'use client';
// Blob thumbnails stay local; user-uploaded clips do not include caption files.
/* oxlint-disable next/no-img-element, jsx-a11y/media-has-caption */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  Loader2,
  Maximize,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Plus,
  Upload,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { NativeSelect } from '@/components/ui/native-select';
import { Select as CameraSelect } from '@base-ui/react/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRESETS, type PresetId, makeInput, getPreset } from '@/lib/recipe';
import { extractFrame, makeThumbnails, readVideo } from '@/lib/video';
import { runCameraBatch, type BatchStatus } from '@/lib/batch';

type ClipResult = {
  id: string;
  preset: PresetId;
  freezeAt: number;
  resolution: string;
  speed: number;
  trimEnd: boolean;
  status: BatchStatus;
  cameraUrl?: string;
  outputUrl?: string;
  error?: string;
  progress?: string;
};
const resultStatus: Record<BatchStatus, string> = {
  waiting: 'Waiting',
  generating: 'Generating',
  'queued-export': 'Waiting for export',
  assembling: 'Assembling',
  ready: 'Ready',
  error: 'Failed',
};

const stamp = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null),
    videoRef = useRef<HTMLVideoElement>(null);
  const dragDepth = useRef(0);
  const [resultTime, setResultTime] = useState(0);
  const [resultDuration, setResultDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const objectUrl = useRef('');
  const resultUrls = useRef(new Set<string>());
  const operation = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState('');
  const [duration, setDuration] = useState(0),
    [time, setTime] = useState(0),
    [thumbs, setThumbs] = useState<string[]>([]);
  const [presets, setPresets] = useState<PresetId[]>(['orbit']),
    [resolution, setResolution] = useState('768P');
  const [cameraSpeed, setCameraSpeed] = useState(1);
  const [trimCameraEnd, setTrimCameraEnd] = useState(false);
  const [results, setResults] = useState<ClipResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState('');
  const selectedResult = results.find((item) => item.id === selectedResultId);
  const exported = selectedResult?.outputUrl || '';
  const [serverKey, setServerKey] = useState(false);
  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((data) =>
        setServerKey(Boolean((data as { configured?: boolean }).configured)),
      )
      .catch(() => {});
  }, []);
  const [key, setKey] = useState(''),
    [keyOpen, setKeyOpen] = useState(false),
    [recipeOpen, setRecipeOpen] = useState(false);
  const [drag, setDrag] = useState(false),
    [playing, setPlaying] = useState(false);
  const [activity, setActivity] = useState<
    'idle' | 'reading' | 'generating' | 'assembling'
  >('idle');
  const busy = activity !== 'idle';
  const busyLabel =
    activity === 'reading'
      ? 'Preparing video…'
      : activity === 'assembling'
        ? 'Assembling video…'
        : 'Generating…';
  const [phase, setPhase] = useState(''),
    [error, setError] = useState('');
  const [view, setView] = useState<'source' | 'result'>('source'),
    [copied, setCopied] = useState(false);
  useEffect(
    () => () => {
      URL.revokeObjectURL(objectUrl.current);
      operation.current?.abort();
      for (const url of resultUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  async function upload(next?: File) {
    if (!next || busy) return;
    setError('');
    if (!next.type.startsWith('video/'))
      return setError('Choose a video file, such as MP4, MOV, or WebM.');
    if (next.size > 150 * 1024 * 1024)
      return setError('Choose a video smaller than 150 MB.');
    setActivity('reading');
    setPhase('Reading your clip');
    const url = URL.createObjectURL(next);
    try {
      const video = await readVideo(url);
      if (
        !Number.isFinite(video.duration) ||
        video.duration < 1 ||
        video.duration > 60
      )
        throw new Error('Choose a clip between 1 and 60 seconds long.');
      const frames = await makeThumbnails(video, 10);
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setSource(url);
      setFile(next);
      setDuration(video.duration);
      setTime(video.duration / 2);
      setThumbs(frames);
      for (const url of resultUrls.current) URL.revokeObjectURL(url);
      resultUrls.current.clear();
      setResults([]);
      setSelectedResultId('');
      setView('source');
      setPlaying(false);
      video.removeAttribute('src');
      video.load();
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(
        e instanceof Error
          ? e.message
          : 'This video could not be opened. Try an MP4.',
      );
    } finally {
      setActivity('idle');
      setPhase('');
    }
  }
  function scrub(value: number) {
    setTime(value);
    if (videoRef.current && view === 'source') {
      videoRef.current.pause();
      videoRef.current.currentTime = value;
      setPlaying(false);
    }
  }
  function updateResult(item: ClipResult, patch: Partial<ClipResult>) {
    setResults((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, ...(patch.status ? { progress: '' } : {}), ...patch }
          : entry,
      ),
    );
  }
  async function assembleResult(
    item: ClipResult,
    cameraUrl: string,
    batchFile: File,
    signal: AbortSignal,
  ) {
    const { assembleEdit } = await import('@/lib/export');
    const output = await assembleEdit(
      batchFile,
      cameraUrl,
      item.freezeAt,
      (progress) => updateResult(item, { progress }),
      item.speed,
      item.trimEnd,
    );
    signal.throwIfAborted();
    const url = URL.createObjectURL(output);
    resultUrls.current.add(url);
    return url;
  }
  async function generate() {
    if (busy || !presets.length) return;
    if (!file) {
      inputRef.current?.click();
      return;
    }
    if (!key && !serverKey) {
      setKeyOpen(true);
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    const { signal } = controller;
    setActivity('generating');
    setError('');
    setPhase('Capturing this exact moment');
    videoRef.current?.pause();
    setPlaying(false);
    let capture: HTMLVideoElement | undefined;
    try {
      // Always capture the original, even while reviewing an earlier finished edit.
      capture = await readVideo(source);
      const frozenTime = time;
      const frame = await extractFrame(capture, frozenTime);
      signal.throwIfAborted();
      const jobs: ClipResult[] = presets.map((preset) => ({
        id: crypto.randomUUID(),
        preset,
        freezeAt: frozenTime,
        resolution,
        speed: cameraSpeed,
        trimEnd: trimCameraEnd,
        status: 'waiting',
      }));
      setResults((current) => [...current, ...jobs]);
      setSelectedResultId(jobs[0].id);
      setView('result');
      setPhase(
        `Generating ${jobs.length} camera ${jobs.length === 1 ? 'move' : 'moves'}. Results appear as they finish.`,
      );
      await runCameraBatch(jobs, {
        signal,
        update: updateResult,
        generate: async (item) => {
          const response = await fetch('/api/generate', {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json', 'X-Fal-Key': key },
            body: JSON.stringify(
              makeInput(frame, item.preset, item.resolution),
            ),
          });
          const job = (await response.json()) as {
            error?: string;
            request_id?: string;
          };
          if (!response.ok || !job.request_id)
            throw new Error(job.error || 'Could not start generation.');
          const started = Date.now();
          while (Date.now() - started < 600000) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            signal.throwIfAborted();
            const response = await fetch(
              `/api/jobs/${encodeURIComponent(job.request_id)}`,
              {
                headers: { 'X-Fal-Key': key },
                signal,
              },
            );
            const state = (await response.json()) as {
              error?: string;
              status?: string;
              video?: { url: string };
            };
            if (!response.ok)
              throw new Error(state.error || 'Could not check generation.');
            if (state.video?.url) return state.video.url;
            updateResult(item, {
              progress:
                state.status === 'IN_QUEUE'
                  ? 'Queued on fal'
                  : 'Generating camera move',
            });
          }
          throw new Error(
            'Generation timed out. Check your fal dashboard before generating again.',
          );
        },
        assemble: (item, cameraUrl) =>
          assembleResult(item, cameraUrl, file, signal),
      });
      setPhase('Batch finished. Choose a result to preview or download.');
    } catch (e) {
      if (!signal.aborted)
        setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      if (capture) {
        capture.removeAttribute('src');
        capture.load();
      }
      if (!signal.aborted) setActivity('idle');
    }
  }
  async function retryExport(item: ClipResult) {
    if (busy || !file || !item.cameraUrl) return;
    const controller = new AbortController();
    operation.current = controller;
    setActivity('assembling');
    updateResult(item, { status: 'assembling', error: '' });
    try {
      const outputUrl = await assembleResult(
        item,
        item.cameraUrl,
        file,
        controller.signal,
      );
      updateResult(item, { status: 'ready', outputUrl, error: '' });
    } catch (e) {
      updateResult(item, {
        status: 'error',
        error: e instanceof Error ? e.message : 'Export failed.',
      });
    } finally {
      setActivity('idle');
    }
  }
  const hasResult = view === 'result' && !!exported;
  const pendingResult =
    view === 'result' && !exported ? selectedResult : undefined;
  const selectedPreset = getPreset(presets[0] || 'orbit');
  const totalSeconds = presets.reduce(
    (sum, id) => sum + getPreset(id).duration,
    0,
  );
  return (
    <main className={`workspace ${source ? 'has-source' : ''}`}>
      <header className="app-header">
        <Link className="app-name" href="/" aria-label="Freeze home">
          <Pause size={18} strokeWidth={3} />
          freeze
        </Link>
        <span className="file-name">{file?.name || 'Untitled clip'}</span>
        <div className="header-tools">
          <button
            className="quiet-button"
            onClick={() => setRecipeOpen(true)}
            aria-label="View API recipe"
          >
            <Code2 size={18} />
            <span>Recipe</span>
          </button>
          {serverKey ? (
            <span className="account-button is-connected">
              <span className="connection-dot" />
              fal ready
            </span>
          ) : (
            <button
              className={`account-button ${key ? 'is-connected' : ''}`}
              onClick={() => setKeyOpen(true)}
            >
              <span className="connection-dot" />
              {key ? 'fal connected' : 'Connect fal'}
            </button>
          )}
        </div>
      </header>

      <div
        className={`stage ${drag ? 'is-dragging' : ''}`}
        aria-label="Video preview"
        onDragEnter={(e) => {
          e.preventDefault();
          if (busy || !e.dataTransfer.types.includes('Files')) return;
          dragDepth.current += 1;
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDrag(false);
          void upload(e.dataTransfer.files[0]);
        }}
      >
        {pendingResult ? (
          <output className="result-pending">
            <CameraPath kind={pendingResult.preset} />
            <strong>{getPreset(pendingResult.preset).name}</strong>
            <span>
              {pendingResult.error ||
                pendingResult.progress ||
                resultStatus[pendingResult.status]}
            </span>
          </output>
        ) : source ? (
          <video
            key={hasResult ? exported : source}
            ref={videoRef}
            src={hasResult ? exported : source}
            playsInline
            muted={muted}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={() => {
              setPlaying(false);
              if (hasResult && videoRef.current) {
                setResultDuration(videoRef.current.duration);
                setResultTime(0);
              }
              if (!hasResult && videoRef.current)
                videoRef.current.currentTime = time;
            }}
            onTimeUpdate={() => {
              if (hasResult && videoRef.current)
                setResultTime(videoRef.current.currentTime);
              if (!hasResult && playing && videoRef.current)
                setTime(videoRef.current.currentTime);
            }}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <>
            <img
              className="preview-art"
              src="/images/freeze-cover.jpg"
              alt="Illustrative still of a skateboarder in midair"
            />
            <div className="art-dimmer" />
            <div className="open-video">
              <button
                className="open-video-button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Plus size={22} />
                <span>Open a video</span>
              </button>
              <p>or drop a clip anywhere</p>
            </div>
            <span className="art-caption">Preview artwork</span>
          </>
        )}
        {hasResult && (
          <fieldset
            className="result-playback"
            aria-label="Result playback controls"
          >
            <button
              aria-label={playing ? 'Pause result' : 'Play result'}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <span>{stamp(resultTime)}</span>
            <input
              aria-label="Seek result"
              type="range"
              min={0}
              max={resultDuration || 1}
              step={0.01}
              value={resultTime}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = value;
                setResultTime(value);
              }}
            />
            <span>{stamp(resultDuration)}</span>
            <button
              aria-label={muted ? 'Unmute result' : 'Mute result'}
              onClick={() => setMuted(!muted)}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              aria-label="Fullscreen result"
              onClick={() => {
                void videoRef.current?.parentElement?.requestFullscreen();
              }}
            >
              <Maximize size={16} />
            </button>
          </fieldset>
        )}
        {drag && (
          <div className="drop-screen">
            <Upload size={35} />
            <span>Drop video to open</span>
          </div>
        )}
        {source && (
          <div className="stage-label">
            <span className="stage-dot" />
            {view === 'result' && selectedResult
              ? getPreset(selectedResult.preset).name
              : 'Original'}
            <span>{view === 'result' ? '' : stamp(time)}</span>
          </div>
        )}
        {source && (
          <div className="stage-tools">
            <button onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={16} />
              Replace
            </button>
            {selectedResult && (
              <button
                onClick={() => {
                  setView(view === 'source' ? 'result' : 'source');
                  setPlaying(false);
                }}
              >
                {view === 'source' ? 'Show result' : 'Show original'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="editing-deck">
        {results.length > 0 && (
          <section className="batch-results" aria-label="Generated results">
            <div className="batch-heading">
              <strong>
                Results ·{' '}
                {results.filter((item) => item.status === 'ready').length}/
                {results.length} ready
              </strong>
              <span>
                Choose a clip to preview · shared settings within each batch
              </span>
            </div>
            <div className="batch-result-list">
              {results.map((item, index) => (
                <button
                  key={item.id}
                  className={`batch-result ${item.id === selectedResultId && view === 'result' ? 'active' : ''}`}
                  aria-pressed={
                    item.id === selectedResultId && view === 'result'
                  }
                  onClick={() => {
                    setSelectedResultId(item.id);
                    setView('result');
                    setPlaying(false);
                  }}
                >
                  <span>
                    {index + 1}. {getPreset(item.preset).name}
                  </span>
                  <small>{resultStatus[item.status]}</small>
                </button>
              ))}
            </div>
            {selectedResult && (
              <div className="batch-result-details">
                <span>
                  {getPreset(selectedResult.preset).name} · Frame{' '}
                  {stamp(selectedResult.freezeAt)} · {selectedResult.resolution}{' '}
                  · {selectedResult.speed}× ·{' '}
                  {selectedResult.trimEnd ? 'Trim last 1s' : 'Full AI clip'}
                </span>
                {selectedResult.status === 'ready' && (
                  <a
                    href={exported}
                    download={`freeze-${selectedResult.preset}-${results.indexOf(selectedResult) + 1}.mp4`}
                  >
                    <Download size={15} /> Download MP4
                  </a>
                )}
                {selectedResult.status === 'error' &&
                  selectedResult.cameraUrl && (
                    <button
                      disabled={busy}
                      onClick={() => void retryExport(selectedResult)}
                    >
                      Retry export · no new generation
                    </button>
                  )}
                {selectedResult.error && (
                  <span className="batch-error" role="alert">
                    {selectedResult.error}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
        <div className="timeline-row">
          <button
            className="play-control"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!source || view === 'result' || busy}
            onClick={() => {
              if (!videoRef.current) return;
              if (playing) videoRef.current.pause();
              else void videoRef.current.play();
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <div className="timeline">
            <div className="timeline-meta">
              <span>
                {source
                  ? 'Choose the frame to freeze'
                  : 'Add a clip to choose a frame'}
              </span>
              <span>
                {stamp(time)} <i>/ {stamp(duration)}</i>
              </span>
            </div>
            <div className={`frames ${!source ? 'empty-frames' : ''}`}>
              {thumbs.length ? (
                thumbs.map((src, i) => <img src={src} key={i} alt="" />)
              ) : (
                <div className="empty-ticks" />
              )}
              {source && (
                <div
                  className="time-marker"
                  style={{ left: `${(time / duration) * 100}%` }}
                >
                  <span />
                </div>
              )}
              <Slider
                className="time-slider"
                aria-label="Freeze moment"
                value={[time]}
                onValueChange={(v) => scrub(Array.isArray(v) ? v[0] : v)}
                min={0}
                max={Math.max(0.01, duration - 0.05)}
                step={0.01}
                disabled={!source || busy || view === 'result'}
              />
            </div>
          </div>
          <div className="frame-step">
            <button
              aria-label="Step back approximately one frame"
              disabled={!source || busy || view === 'result'}
              onClick={() => scrub(Math.max(0, time - 1 / 30))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Step forward approximately one frame"
              disabled={!source || busy || view === 'result'}
              onClick={() => scrub(Math.min(duration - 0.05, time + 1 / 30))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="camera-controls">
            <div className="control-label" id="camera-move-label">
              Camera move
            </div>
            <CameraSelect.Root
              multiple
              value={presets}
              onValueChange={setPresets}
              disabled={busy}
            >
              <CameraSelect.Trigger
                className="camera-select-trigger"
                aria-label={`Camera moves: ${presets.length} selected`}
              >
                {presets.length === 1 ? (
                  <PresetSummary preset={selectedPreset} />
                ) : (
                  <span className="preset-copy">
                    <span className="preset-name">
                      {presets.length
                        ? `${presets.length} camera moves selected`
                        : 'Choose camera moves'}
                    </span>
                    <span className="preset-description">
                      {presets.length
                        ? `${presets
                            .slice(0, 2)
                            .map((id) => getPreset(id).name)
                            .join(
                              ', ',
                            )}${presets.length > 2 ? ` + ${presets.length - 2} more` : ''}`
                        : 'Select one or more moves for this frame.'}
                    </span>
                  </span>
                )}
                <CameraSelect.Icon>
                  <ChevronDown size={18} />
                </CameraSelect.Icon>
              </CameraSelect.Trigger>
              <CameraSelect.Portal>
                <CameraSelect.Positioner
                  side="top"
                  align="start"
                  sideOffset={8}
                  alignItemWithTrigger={false}
                  className="camera-select-positioner"
                >
                  <CameraSelect.Popup className="camera-select-popup">
                    <div className="camera-select-heading">
                      Camera moves <span>{presets.length} selected</span>
                    </div>
                    <div className="camera-select-actions">
                      <button
                        type="button"
                        onClick={() => setPresets(PRESETS.map((p) => p.id))}
                      >
                        Select all
                      </button>
                      <button type="button" onClick={() => setPresets([])}>
                        Clear
                      </button>
                    </div>
                    <CameraSelect.List
                      className="camera-select-list"
                      aria-label="Camera moves"
                    >
                      {PRESETS.map((p) => (
                        <CameraSelect.Item
                          key={p.id}
                          value={p.id}
                          label={p.name}
                          className="camera-select-option"
                        >
                          <CameraSelect.ItemText>
                            <PresetSummary preset={p} />
                          </CameraSelect.ItemText>
                          <CameraSelect.ItemIndicator className="camera-select-check">
                            <Check size={17} />
                          </CameraSelect.ItemIndicator>
                        </CameraSelect.Item>
                      ))}
                    </CameraSelect.List>
                  </CameraSelect.Popup>
                </CameraSelect.Positioner>
              </CameraSelect.Portal>
            </CameraSelect.Root>
          </div>
          <div className="output-controls">
            <div className="quality-control">
              <label htmlFor="resolution">Quality</label>
              <NativeSelect
                id="resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={busy}
              >
                <option value="480P">480p</option>
                <option value="768P">768p</option>
                <option value="1080P">1080p</option>
              </NativeSelect>
            </div>
            <div className="quality-control">
              <label htmlFor="camera-speed">AI clip speed</label>
              <NativeSelect
                id="camera-speed"
                value={cameraSpeed}
                onChange={(e) => setCameraSpeed(Number(e.target.value))}
                disabled={busy}
              >
                {[1, 1.25, 1.5, 1.75, 2].map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}×
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="quality-control">
              <label htmlFor="camera-trim">AI clip ending</label>
              <NativeSelect
                id="camera-trim"
                value={trimCameraEnd ? 'trim' : 'full'}
                onChange={(e) => setTrimCameraEnd(e.target.value === 'trim')}
                disabled={busy}
                title="Remove the last second of the AI clip before applying speed"
              >
                <option value="full">Keep full clip</option>
                <option value="trim">Trim last 1s</option>
              </NativeSelect>
            </div>
            <span className="render-price">
              {presets.length} {presets.length === 1 ? 'video' : 'videos'} · $
              {(
                (
                  { '480P': 0.05, '768P': 0.08, '1080P': 0.16 } as Record<
                    string,
                    number
                  >
                )[resolution] * totalSeconds
              ).toFixed(2)}
              <small>before launch discount</small>
            </span>
          </div>
          <div className="primary-actions">
            <button
              className="generate-button"
              disabled={busy || presets.length === 0}
              onClick={() => void generate()}
            >
              {busy ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Pause size={18} />
              )}
              <span>
                {busy
                  ? busyLabel
                  : !source
                    ? 'Open video'
                    : `Generate ${presets.length} ${presets.length === 1 ? 'video' : 'videos'}`}
              </span>
            </button>
            <span>Same frame and settings for every move</span>
          </div>
        </div>
        <div
          className={`status-line ${error ? 'has-error' : ''}`}
          aria-live="polite"
        >
          {error ||
            phase ||
            (source
              ? 'Scrub to a clear frame. Choose a camera move, then generate.'
              : 'MP4, MOV or WebM · Up to 60 seconds · 150 MB max')}
          <a
            href="https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video"
            target="_blank"
            rel="noreferrer"
          >
            H3 Max / fal ↗
          </a>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        aria-label="Choose a video"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="settings-dialog">
          <DialogTitle>Connect fal</DialogTitle>
          <DialogDescription>
            Your key is kept in this tab’s memory and sent through this app’s
            server to fal. It is never saved by the app.
          </DialogDescription>
          <label htmlFor="fal-key">API key</label>
          <input
            id="fal-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your fal API key"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
          />
          <a
            href="https://fal.ai/dashboard/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get an API key ↗
          </a>
          <p>
            Generations are billed to your fal account. Refreshing or closing
            the page clears your key.
          </p>
          <button
            className="generate-button"
            onClick={() => setKeyOpen(false)}
            disabled={!key}
          >
            <Check size={17} />
            Connect
          </button>
          {key && (
            <button
              className="quiet-button"
              onClick={() => {
                setKey('');
                setKeyOpen(false);
              }}
            >
              Disconnect
            </button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
        <DialogContent className="settings-dialog recipe-dialog">
          <DialogTitle>Camera recipe</DialogTitle>
          <DialogDescription>
            The selected frame becomes the first frame of an H3 Max camera move.
            The result contains your original footage up to the selected frame,
            followed by the full generated clip and the remaining original
            footage.
          </DialogDescription>
          <pre>
            {JSON.stringify(
              presets.map((id) =>
                makeInput('YOUR_EXTRACTED_FRAME', id, resolution),
              ),
              null,
              2,
            )}
          </pre>
          <button
            className="generate-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(
                    presets.map((id) =>
                      makeInput('YOUR_EXTRACTED_FRAME', id, resolution),
                    ),
                    null,
                    2,
                  ),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setError('Clipboard unavailable. Select and copy the recipe.');
              }
            }}
          >
            <Code2 size={17} />
            {copied ? 'Copied' : 'Copy input'}
          </button>
          <a
            href="https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video/api"
            target="_blank"
            rel="noreferrer"
          >
            API documentation ↗
          </a>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function PresetSummary({ preset }: { preset: (typeof PRESETS)[number] }) {
  return (
    <span className="preset-summary">
      <CameraPath kind={preset.id} />
      <span className="preset-copy">
        <span className="preset-name">{preset.name}</span>
        <span className="preset-description">{preset.description}</span>
        <span className="preset-return">
          {preset.returnsToStart ? 'Returns to start' : 'Ends at new angle'}
        </span>
      </span>
    </span>
  );
}

function CameraPath({ kind }: { kind: PresetId }) {
  const paths: Record<PresetId, string> = {
    orbit: 'M50 43a34 13 0 1 1 1 0l-5-4m5 4-5 3',
    'orbit-left': 'M50 43a34 13 0 1 0-1 0l5-4m-5 4 5 3',
    swing: 'M50 43Q84 44 84 30Q82 20 67 19',
    rise: 'M50 43Q88 43 77 18Q68 4 50 7',
    'arc-return':
      'M50 43Q84 44 84 30Q82 20 67 19M67 23Q78 24 79 30Q79 39 50 39l5-4m-5 4 5 3',
    'rise-return': 'M46 43V10l-4 5m4-5 4 5M56 10v33l-4-5m4 5 4-5',
    'arc-left-return':
      'M50 43Q16 44 16 30Q18 20 33 19M33 23Q22 24 21 30Q21 39 50 39l-5-4m5 4-5 3',
    'wide-return': 'M50 43C5 43 5 17 50 17C90 17 90 39 50 39l5-4m-5 4 5 3',
    'dip-return': 'M46 16v32l-4-5m4 5 4-5M56 48V16l-4 5m4-5 4 5',
    'high-arc-return': 'M50 43Q84 30 72 8M72 8Q76 30 50 39l5-5',
    'low-arc-return': 'M50 24Q16 30 28 49M28 49Q24 30 50 28l-5-4',
    'sway-return': 'M50 43Q16 43 16 30Q50 8 84 30Q84 43 50 43l5-4m-5 4 5 3',
    halo: 'M50 43C96 43 91 5 50 5C9 5 4 43 50 43l-5-4m5 4-5 3',
    'halo-left': 'M50 43C4 43 9 5 50 5C91 5 96 43 50 43l5-4m-5 4 5 3',
    'arc-left': 'M50 43Q16 44 16 30Q18 20 33 19',
    'low-angle': 'M50 20Q85 20 78 48l-5-4m5 4 3-5',
  };
  return (
    <svg className="camera-path" viewBox="0 0 100 56" aria-hidden="true">
      <ellipse cx="50" cy="30" rx="34" ry="13" className="path-guide" />
      <path d="M50 13v25M43 33l7 5 7-5" className="path-axis" />
      <circle cx="50" cy="29" r="4" className="path-subject" />
      <path className="path-motion" d={paths[kind]} />
      <circle cx="50" cy="43" r="3" className="path-camera" />
    </svg>
  );
}
