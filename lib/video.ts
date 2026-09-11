export function readVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const timer = setTimeout(
      () => reject(new Error('Video loading timed out. Try a smaller MP4.')),
      20000,
    );
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve(video);
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error('Your browser cannot decode this video. Try an H.264 MP4.'),
      );
    };
    video.src = url;
  });
}
export function seekVideo(
  video: HTMLVideoElement,
  time: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2)
      return resolve();
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', done);
      reject(new Error('Could not read this frame.'));
    }, 10000);
    function done() {
      clearTimeout(timer);
      resolve();
    }
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
  });
}
function capture(video: HTMLVideoElement, width: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, video.videoWidth);
  canvas.height = Math.round(
    (canvas.width * video.videoHeight) / video.videoWidth,
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Frame capture is unavailable.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.94);
}
export async function extractFrame(video: HTMLVideoElement, time: number) {
  await seekVideo(video, time);
  // Leave room for the recipe JSON below Vercel's 4.5 MB request limit.
  let width = Math.min(1920, video.videoWidth);
  let frame = capture(video, width);
  while (frame.length > 3_800_000 && width > 320) {
    width = Math.max(320, Math.floor(width * 0.75));
    frame = capture(video, width);
  }
  if (frame.length > 3_800_000)
    throw new Error('This frame is too large. Try a smaller source video.');
  return frame;
}
export async function makeThumbnails(video: HTMLVideoElement, count: number) {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    await seekVideo(
      video,
      Math.min(video.duration - 0.05, (video.duration * i) / count),
    );
    frames.push(capture(video, 160));
  }
  return frames;
}
