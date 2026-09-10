'use client';
// Blob thumbnails stay local; user-uploaded clips do not include caption files.
/* oxlint-disable next/no-img-element, jsx-a11y/media-has-caption */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Upload,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRESETS, type PresetId, makeInput } from '@/lib/recipe';
import { extractFrame, makeThumbnails, readVideo } from '@/lib/video';

const stamp = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null),
    videoRef = useRef<HTMLVideoElement>(null);
  const objectUrl = useRef(''),
    resultUrl = useRef('');
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState('');
  const [duration, setDuration] = useState(0),
    [time, setTime] = useState(0),
    [thumbs, setThumbs] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetId>('swing'),
    [resolution, setResolution] = useState('768P');
  const [key, setKey] = useState(''),
    [keyOpen, setKeyOpen] = useState(false),
    [recipeOpen, setRecipeOpen] = useState(false);
  const [drag, setDrag] = useState(false),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(''),
    [error, setError] = useState(''),
    [generated, setGenerated] = useState(''),
    [exported, setExported] = useState('');
  const [freezeAt, setFreezeAt] = useState(0),
    [renderPreset, setRenderPreset] = useState<PresetId>('swing');
  const [view, setView] = useState<'source' | 'result'>('source'),
    [copied, setCopied] = useState(false);
  useEffect(
    () => () => {
      URL.revokeObjectURL(objectUrl.current);
      URL.revokeObjectURL(resultUrl.current);
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
    setBusy(true);
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
      setGenerated('');
      setExported('');
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
      setBusy(false);
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
  async function generate() {
    if (!file || !videoRef.current) {
      inputRef.current?.click();
      return;
    }
    if (!key) {
      setKeyOpen(true);
      return;
    }
    setBusy(true);
    setError('');
    setPhase('Capturing this exact moment');
    videoRef.current.pause();
    setPlaying(false);
    try {
      const frame = await extractFrame(videoRef.current, time),
        frozenTime = time;
      setPhase('Sending your frame to H3 Max');
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Fal-Key': key },
        body: JSON.stringify(makeInput(frame, preset, resolution)),
      });
      const job = (await response.json()) as {
        error?: string;
        request_id: string;
      };
      if (!response.ok)
        throw new Error(job.error || 'Could not start generation.');
      const started = Date.now();
      while (Date.now() - started < 600000) {
        await new Promise((r) => setTimeout(r, 2000));
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(job.request_id)}`,
          { headers: { 'X-Fal-Key': key } },
        );
        const state = (await response.json()) as {
          error?: string;
          status?: string;
          video?: { url: string };
        };
        if (!response.ok)
          throw new Error(state.error || 'Could not check generation.');
        if (state.video?.url) {
          setGenerated(state.video.url);
          setFreezeAt(frozenTime);
          setRenderPreset(preset);
          setExported('');
          setView('result');
          setPhase('Camera move ready. Assemble the finished edit.');
          return;
        }
        setPhase(
          state.status === 'IN_QUEUE'
            ? 'Queued on fal…'
            : 'Generating camera move…',
        );
      }
      throw new Error(
        'This request is taking longer than expected. Check your fal dashboard before retrying.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
      setPhase('');
    } finally {
      setBusy(false);
    }
  }
  async function exportEdit() {
    if (!file || !generated) return;
    setBusy(true);
    setError('');
    try {
      const { assembleEdit } = await import('@/lib/export');
      const output = await assembleEdit(
        file,
        generated,
        freezeAt,
        renderPreset !== 'orbit',
        setPhase,
      );
      URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = URL.createObjectURL(output);
      setExported(resultUrl.current);
      setView('result');
      setPhase('Your finished edit is ready.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Export failed. You can still download the camera move.',
      );
    } finally {
      setBusy(false);
    }
  }
  const hasResult = view === 'result' && generated;
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
          <button
            className={`account-button ${key ? 'is-connected' : ''}`}
            onClick={() => setKeyOpen(true)}
          >
            <span className="connection-dot" />
            {key ? 'fal connected' : 'Connect fal'}
          </button>
        </div>
      </header>

      <div
        className={`stage ${drag ? 'is-dragging' : ''}`}
        aria-label="Video preview"
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files[0]);
        }}
      >
        {source ? (
          <video
            key={hasResult ? exported || generated : source}
            ref={videoRef}
            src={hasResult ? exported || generated : source}
            playsInline
            controls={!!hasResult}
            onLoadedMetadata={() => {
              if (!hasResult && videoRef.current)
                videoRef.current.currentTime = time;
            }}
            onTimeUpdate={() => {
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
        {drag && (
          <div className="drop-screen">
            <Upload size={35} />
            <span>Drop video to open</span>
          </div>
        )}
        {source && (
          <div className="stage-label">
            <span className="stage-dot" />
            {hasResult
              ? exported
                ? 'Finished edit'
                : 'Generated camera move'
              : 'Original'}
            <span>{hasResult ? '' : stamp(time)}</span>
          </div>
        )}
        {source && (
          <div className="stage-tools">
            <button onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={16} />
              Replace
            </button>
            {generated && (
              <button
                disabled={busy}
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
        <div className="timeline-row">
          <button
            className="play-control"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!source || !!hasResult || busy}
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
                disabled={!source || busy || !!hasResult}
              />
            </div>
          </div>
          <div className="frame-step">
            <button
              aria-label="Step back approximately one frame"
              disabled={!source || busy || !!hasResult}
              onClick={() => scrub(Math.max(0, time - 1 / 30))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Step forward approximately one frame"
              disabled={!source || busy || !!hasResult}
              onClick={() => scrub(Math.min(duration - 0.05, time + 1 / 30))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="camera-controls">
            <div className="control-label">Camera move</div>
            <RadioGroup
              className="camera-options"
              aria-label="Camera move"
              value={preset}
              onValueChange={(v) => setPreset(v as PresetId)}
              disabled={busy}
            >
              {PRESETS.map((p) => (
                <label
                  key={p.id}
                  className={`camera-option ${preset === p.id ? 'active' : ''}`}
                >
                  <RadioGroupItem
                    value={p.id}
                    aria-label={p.name}
                    className="camera-radio"
                  />
                  <CameraPath kind={p.id} />
                  <span>{p.name}</span>
                </label>
              ))}
            </RadioGroup>
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
            <span className="render-price">
              5s · $
              {
                (
                  { '480P': '0.25', '768P': '0.40', '1080P': '0.80' } as Record<
                    string,
                    string
                  >
                )[resolution]
              }
              <small>before launch discount</small>
            </span>
          </div>
          <div className="primary-actions">
            {!hasResult ? (
              <button
                className="generate-button"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Pause size={18} />
                )}
                <span>
                  {busy
                    ? 'Generating…'
                    : source
                      ? 'Generate freeze'
                      : 'Open video'}
                </span>
              </button>
            ) : exported ? (
              <a
                className="generate-button"
                href={exported}
                download="freeze-edit.mp4"
              >
                <Download size={18} />
                Download MP4
              </a>
            ) : (
              <button
                className="generate-button"
                disabled={busy}
                onClick={() => void exportEdit()}
              >
                {busy ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Download size={18} />
                )}
                <span>{busy ? 'Assembling…' : 'Assemble edit'}</span>
              </button>
            )}
            <span>
              {hasResult
                ? 'Original + camera move + original'
                : 'Only the selected frame goes to fal'}
            </span>
            {generated && (
              <a
                className="raw-link"
                href={generated}
                target="_blank"
                rel="noreferrer"
              >
                Open camera move ↗
              </a>
            )}
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
            Swing Back and Hero Rise reverse that move before the original video
            resumes.
          </DialogDescription>
          <pre>
            {JSON.stringify(
              makeInput('YOUR_EXTRACTED_FRAME', preset, resolution),
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
                    makeInput('YOUR_EXTRACTED_FRAME', preset, resolution),
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

function CameraPath({ kind }: { kind: PresetId }) {
  return (
    <svg className="camera-path" viewBox="0 0 100 56" aria-hidden="true">
      <ellipse cx="50" cy="30" rx="34" ry="13" className="path-guide" />
      <path d="M50 13v25M43 33l7 5 7-5" className="path-axis" />
      <circle cx="50" cy="29" r="4" className="path-subject" />
      <path
        className="path-motion"
        d={
          kind === 'orbit'
            ? 'M50 43a34 13 0 1 1 1 0'
            : kind === 'rise'
              ? 'M50 43Q88 43 77 18Q68 4 50 7'
              : 'M50 43Q84 44 84 30Q82 20 67 19'
        }
      />
      <circle cx="50" cy="43" r="3" className="path-camera" />
    </svg>
  );
}
