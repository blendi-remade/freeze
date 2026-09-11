export type BatchStatus =
  | 'waiting'
  | 'generating'
  | 'queued-export'
  | 'assembling'
  | 'ready'
  | 'error';

// Submit a few independent generations at a time, but run only one browser
// encoder at once: each encoder owns a large WASM heap.
export async function runCameraBatch<T>(
  items: readonly T[],
  services: {
    generate: (item: T) => Promise<string>;
    assemble: (item: T, cameraUrl: string) => Promise<string>;
    update: (
      item: T,
      patch: {
        status: BatchStatus;
        cameraUrl?: string;
        outputUrl?: string;
        error?: string;
      },
    ) => void;
    signal?: AbortSignal;
  },
) {
  let next = 0;
  let exportQueue: Promise<void> = Promise.resolve();
  async function worker() {
    while (next < items.length && !services.signal?.aborted) {
      const item = items[next++];
      try {
        services.update(item, { status: 'generating' });
        const cameraUrl = await services.generate(item);
        if (services.signal?.aborted) return;
        services.update(item, { status: 'queued-export', cameraUrl });
        const exported = exportQueue.then(async () => {
          if (services.signal?.aborted) return;
          services.update(item, { status: 'assembling' });
          const outputUrl = await services.assemble(item, cameraUrl);
          services.update(item, { status: 'ready', outputUrl, error: '' });
        });
        exportQueue = exported.catch(() => {});
        // Continue starting generations while this export waits for the encoder.
        void exported.catch((error: unknown) =>
          services.update(item, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Export failed.',
          }),
        );
      } catch (error) {
        if (!services.signal?.aborted)
          services.update(item, {
            status: 'error',
            error:
              error instanceof Error ? error.message : 'Generation failed.',
          });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  await exportQueue;
}
