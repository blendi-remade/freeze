'use client';
// Blob thumbnails stay local; user-uploaded clips do not include caption files.
/* oxlint-disable next/no-img-element, jsx-a11y/media-has-caption */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  KeyRound,
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
          setPhase('Camera move ready. Assemble your edit below.');
          return;
        }
        setPhase(
          state.status === 'IN_QUEUE'
            ? 'In the queue. Your moment is on its way.'
            : 'Moving the camera. Holding the moment.',
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
  const active = PRESETS.find((p) => p.id === preset)!,
    hasResult = view === 'result' && generated;
  return (
    <main className="studio">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="Freeze home">
          fr<span className="pause-glyph">Ⅱ</span>ze
          <span className="wordmark-dot">↗</span>
        </Link>
        <div className="edition">
          <span className="status-dot" /> A MOMENT, FROM EVERY ANGLE
        </div>
        <div className="head-actions">
          <button onClick={() => setRecipeOpen(true)}>
            <Code2 size={16} />
            <span>The recipe</span>
          </button>
          <button
            className={key ? 'connected' : ''}
            onClick={() => setKeyOpen(true)}
          >
            <KeyRound size={15} />
            <span>{key ? 'Connected' : 'Connect fal'}</span>
          </button>
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">THE BULLET-TIME EDITOR / VOL. 001</p>
          <h1>
            Life moves.
            <br />
            <span>You don’t have to.</span>
          </h1>
        </div>
        <p className="intro-copy">
          Pick a moment. Move around it.
          <br />
          Then let life carry on.
          <ArrowDown size={22} />
        </p>
      </section>
      <section className="edit-room" aria-label="Video editor">
        <div className="monitor-column">
          <div className="monitor-bar">
            <span>
              <i />
              {file?.name || 'YOUR NEXT IMPOSSIBLE SHOT'}
            </span>
            <span>
              {hasResult
                ? exported
                  ? 'FINISHED EDIT'
                  : 'CAMERA MOVE'
                : 'SOURCE / 01'}
            </span>
          </div>
          <div
            className={`monitor ${drag ? 'dragging' : ''}`}
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
                  className="cover-image"
                  src="/images/freeze-cover.jpg"
                  alt="A skateboarder suspended above a concrete plaza"
                />
                <div className="cover-shade" />
                <div className="viewfinder-corner tl" />
                <div className="viewfinder-corner br" />
                <div className="still-label">
                  ILLUSTRATIVE STILL <span>FRAME / ∞</span>
                </div>
                <div className="cover-title">
                  MAKE TIME
                  <br />
                  <em>STAND STILL.</em>
                </div>
                <button
                  className="upload-cta"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  <Plus size={23} />
                  <span>
                    Drop your video here<small>or click to choose a clip</small>
                  </span>
                  <ArrowUpRight size={23} />
                </button>
                <span className="cover-footnote">
                  MP4, MOV, WEBM · UP TO 60 SEC / 150 MB
                </span>
              </>
            )}
            {drag && (
              <div className="drop-overlay">
                <Upload size={40} />
                Drop it. Freeze it.
              </div>
            )}
            {source && !hasResult && (
              <span className="frame-readout">
                <span className="status-dot" />
                {stamp(time)}
              </span>
            )}
          </div>
          <div className="transport">
            <div className="transport-left">
              <button
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
              <span>
                {stamp(time)} <b>/ {stamp(duration)}</b>
              </span>
            </div>
            <div className="transport-right">
              {generated && (
                <button
                  onClick={() => {
                    setView(view === 'source' ? 'result' : 'source');
                    setPlaying(false);
                  }}
                  disabled={busy}
                >
                  {view === 'source' ? 'View result' : 'View original'}
                </button>
              )}
              <button
                disabled={!source || busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload size={14} />
                Replace clip
              </button>
            </div>
          </div>
          <div className="timeline-wrap">
            <div className="timeline-heading">
              <span>01 / FIND YOUR MOMENT</span>
              <span>
                {source
                  ? 'Scrub to the frame you want to freeze'
                  : 'Your clip starts here'}
              </span>
            </div>
            <div className={`filmstrip ${!source ? 'empty-strip' : ''}`}>
              {thumbs.length
                ? thumbs.map((src, i) => <img key={i} src={src} alt="" />)
                : Array.from({ length: 10 }, (_, i) => (
                    <span key={i}>{String(i + 1).padStart(2, '0')}</span>
                  ))}
              <div
                className="playhead"
                style={{ left: `${duration ? (time / duration) * 100 : 44}%` }}
              >
                <span>Ⅱ</span>
              </div>
            </div>
            <Slider
              aria-label="Freeze moment"
              className="scrubber"
              value={[time]}
              onValueChange={(v) => scrub(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={Math.max(0.01, duration - 0.05)}
              step={0.01}
              disabled={!source || busy || !!hasResult}
            />
            <div className="timeline-ticks">
              <span>00:00</span>
              <div>
                <button
                  aria-label="Step back approximately one frame"
                  disabled={!source || busy || !!hasResult}
                  onClick={() => scrub(Math.max(0, time - 1 / 30))}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>FINE TUNE</span>
                <button
                  aria-label="Step forward approximately one frame"
                  disabled={!source || busy || !!hasResult}
                  onClick={() =>
                    scrub(Math.min(duration - 0.05, time + 1 / 30))
                  }
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <span>{stamp(duration)}</span>
            </div>
          </div>
        </div>
        <aside className="director-panel">
          <div className="panel-top">
            <span className="eyebrow">02 / DIRECT THE CAMERA</span>
            <span>+</span>
          </div>
          <h2>
            One moment.
            <br />A new perspective.
          </h2>
          <RadioGroup
            className="preset-list"
            aria-label="Camera move"
            value={preset}
            onValueChange={(v) => setPreset(v as PresetId)}
            disabled={busy}
          >
            {PRESETS.map((p, i) => (
              <label
                key={p.id}
                className={`preset ${preset === p.id ? 'selected' : ''}`}
              >
                <RadioGroupItem
                  value={p.id}
                  className="preset-radio"
                  aria-label={p.name}
                />
                <span className="preset-number">0{i + 1}</span>
                <span className="preset-copy">
                  <strong>{p.name}</strong>
                  <small>{p.description}</small>
                </span>
                <span className="preset-icon" aria-hidden="true">
                  {p.id === 'swing' ? '↶' : p.id === 'rise' ? '⤴' : '⟳'}
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="trajectory">
            <div className="trajectory-title">
              <span>CAMERA PATH</span>
              <span>{active.angle}</span>
            </div>
            <svg
              viewBox="0 0 300 110"
              aria-label={`${active.name} camera trajectory diagram`}
            >
              <defs>
                <pattern
                  id="grid"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 20 0 L 0 0 0 20"
                    fill="none"
                    stroke="currentColor"
                    opacity=".09"
                  />
                </pattern>
              </defs>
              <rect width="300" height="110" fill="url(#grid)" />
              <ellipse
                cx="150"
                cy="62"
                rx="104"
                ry="29"
                fill="none"
                stroke="currentColor"
                opacity=".2"
                strokeDasharray="3 4"
              />
              <path
                className="orbit-path"
                d={
                  preset === 'rise'
                    ? 'M 150 91 Q 238 98 223 36 Q 214 2 150 18'
                    : preset === 'orbit'
                      ? 'M 150 91 A 104 29 0 1 1 151 91'
                      : 'M 150 91 Q 249 94 254 62 Q 249 35 193 36'
                }
              />
              <path
                d="M 144 57 L 150 49 L 156 57 L 156 69 L 144 69 Z"
                fill="currentColor"
              />
              <circle cx="150" cy="91" r="5" fill="var(--orange)" />
            </svg>
            <div className="trajectory-caption">
              <span>● Frozen moment</span>
              <span>{preset === 'orbit' ? 'Full rotation' : 'Out + back'}</span>
            </div>
          </div>
          <div className="settings-row">
            <label htmlFor="resolution">Render quality</label>
            <NativeSelect
              id="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={busy}
            >
              <option value="480P">480p · Draft</option>
              <option value="768P">768p · Standard</option>
              <option value="1080P">1080p · Refined</option>
            </NativeSelect>
          </div>
          <div className="render-note">
            <span>5 sec generation</span>
            <span>
              $
              {
                (
                  { '480P': '0.25', '768P': '0.40', '1080P': '0.80' } as Record<
                    string,
                    string
                  >
                )[resolution]
              }{' '}
              / render*
            </span>
          </div>
          <button
            className="freeze-button"
            disabled={busy || !!hasResult}
            onClick={() => void generate()}
          >
            {busy ? (
              <Loader2 className="spin" size={20} />
            ) : (
              <span className="button-pause">Ⅱ</span>
            )}
            <span>
              {busy
                ? 'Making your moment'
                : source
                  ? 'Freeze this moment'
                  : 'Choose your video'}
            </span>
            <ArrowUpRight size={20} />
          </button>
          {generated && (
            <div className="export-actions">
              <button
                className="export-button"
                disabled={busy}
                onClick={() => void exportEdit()}
              >
                <Download size={16} />
                {exported ? 'Rebuild finished edit' : 'Assemble finished edit'}
              </button>
              {exported && (
                <a
                  className="download-link"
                  href={exported}
                  download="freeze-edit.mp4"
                >
                  Download your edit <ArrowDown size={16} />
                </a>
              )}
              <a href={generated} target="_blank" rel="noreferrer">
                Open raw camera move ↗
              </a>
            </div>
          )}
          <p className="model-credit">
            POWERED BY{' '}
            <a
              href="https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video"
              target="_blank"
              rel="noreferrer"
            >
              H3 MAX ON FAL ↗
            </a>
          </p>
          <p className="price-note">
            *Standard rate. Launch discounts may apply.
          </p>
        </aside>
      </section>
      {(phase || error) && (
        <div
          className={`feedback ${error ? 'error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error || phase}
        </div>
      )}
      <section className="explanation">
        <div>
          <span className="eyebrow">THE TRICK IS IN THE CUT.</span>
          <h3>Real life. Impossible camera.</h3>
        </div>
        <div className="edit-equation">
          <span>
            YOUR VIDEO<small>Before the moment</small>
          </span>
          <b>→</b>
          <span className="orange-text">
            THE FREEZE<small>AI camera move</small>
          </span>
          <b>→</b>
          <span>
            YOUR VIDEO<small>Life carries on</small>
          </span>
        </div>
      </section>
      <footer>
        <span>FREEZE / AN EXPERIMENT IN PERSPECTIVE</span>
        <button onClick={() => setRecipeOpen(true)}>
          Made to be taken apart. <Code2 size={15} />
        </button>
        <span>TIME IS YOURS. ↗</span>
      </footer>
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
        <DialogContent className="setup-dialog">
          <DialogTitle>Connect your camera.</DialogTitle>
          <DialogDescription>
            Use your fal API key to generate. Your key stays in this tab’s
            memory and passes through this app’s server to fal. It is never
            saved by this app.
          </DialogDescription>
          <label htmlFor="fal-key">fal API key</label>
          <input
            id="fal-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your fal key"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
          />
          <a
            href="https://fal.ai/dashboard/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get a key from fal ↗
          </a>
          <p>
            Generation is billed to your fal account. Closing or refreshing this
            page clears the key.
          </p>
          <button
            className="freeze-button"
            onClick={() => setKeyOpen(false)}
            disabled={!key}
          >
            Save for this session <Check size={18} />
          </button>
          {key && (
            <button
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
        <DialogContent className="recipe-dialog">
          <DialogTitle>The whole trick, in one recipe.</DialogTitle>
          <DialogDescription>
            Extract one frame. Generate a camera move with H3 Max. Insert it
            into the original video. Swing Back and Hero Rise reverse the move
            to return to its opening frame.
          </DialogDescription>
          <pre>
            {JSON.stringify(
              makeInput('YOUR_EXTRACTED_FRAME', preset, resolution),
              null,
              2,
            )}
          </pre>
          <button
            className="freeze-button"
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
            {copied ? 'Copied' : 'Copy API input'}
            <Code2 size={18} />
          </button>
          <a
            href="https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video/api"
            target="_blank"
            rel="noreferrer"
          >
            Read the endpoint docs ↗
          </a>
        </DialogContent>
      </Dialog>
    </main>
  );
}
