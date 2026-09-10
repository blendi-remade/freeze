# Freeze

A video editor for frozen camera moves.

Turn a moment in a real video into a bullet-time camera move, then resume the original action. Built with [MiniMax H3 Max Multi Angle on fal](https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video).

![Freeze art direction — illustrative still, not an endpoint result](public/images/freeze-cover.jpg)

```text
Original video → extract one frame → H3 Max camera move → original video resumes
```

## Try it locally

Requires Node.js 22.13+ and npm.

```bash
npm ci
npm run dev
```

Open the printed local URL. For local use, put `FAL_KEY=your_key` in `.dev.vars` (ignored by Git), or use **Connect fal** to enter a session-only key. Upload a short clip, scrub to the moment, choose a camera move, and generate. Once the move is ready, choose **Assemble finished edit** and download the MP4.

The local demo reads its key from `.dev.vars`. Local `.env*` and `.dev.vars*` secret files are ignored by Git. The optional manually entered key lives only in tab memory and is sent through the server relay; refreshing clears that optional key. Server credentials are never returned to the browser. The original video stays in the browser; only the selected JPEG frame is sent to fal. fal processes and stores generated media under its own policies.

## Three camera moves

| Move       | Generated camera path                | Edit treatment                     |
| ---------- | ------------------------------------ | ---------------------------------- |
| Swing Back | 0° → 65° azimuth, 0° → 8° elevation  | Outbound + reverse                 |
| Hero Rise  | 0° → 35° azimuth, 0° → 30° elevation | Outbound + reverse                 |
| Full Orbit | 0° → 360° azimuth                    | One continuous orbit; experimental |

All presets keep normalized distance at 1. A five-second generation becomes a 3.2-second insert. The two return presets play the generated move forward and backward, returning to the same generated opening frame. This reduces return drift but does not guarantee a pixel-perfect match to the original frame.

The **recipe** panel exposes the actual endpoint payload. Edit `lib/recipe.ts` to design another move.

## Architecture

- React + TypeScript, Vinext/Vite, Cloudflare-compatible API routes.
- Browser video decoding, thumbnail extraction, and frame capture.
- Server relay submits a fixed five-second request and polls the fal queue. Safety checking stays enabled.
- Single-thread FFmpeg WebAssembly assembles the complete edit locally. No video upload server or database.
- H.264 MP4 export at 30 fps, source aspect ratio, maximum long edge 1280 px. Source audio resumes in sync after a silent freeze interval. Generated audio is omitted.
- The editing engine is downloaded only when exporting. Its approximately 32 MB WASM file is delivered in two pieces to respect static hosting file limits.

## Current boundaries

This is a working first version awaiting live model evaluation on varied footage. Automated codec and timeline tests are included; model quality and end-to-end browser behavior are not yet validated.

- Inputs: browser-decodable video, 1–60 seconds, up to 150 MB. H.264 MP4 is the most predictable choice; MOV/HEVC support depends on the browser.
- Export needs a WebAssembly-capable browser and can be slow or memory constrained on phones. Start with a short 720p/1080p clip on desktop.
- HDR footage is not explicitly tone-mapped. Use SDR clips for initial tests.
- No automatic color matching, optical-flow seam repair, speed ramps, subject tracking, or guaranteed frozen geometry yet.
- Fine stepping uses 1/30-second increments; it is not native frame indexing for variable-frame-rate sources.
- Full Orbit can drift at the return and reveal invented surfaces. It is deliberately labeled experimental.
- No accounts, saved projects, shared media gallery, or automatic retries. Export your work before refreshing.
- After a polling timeout or network interruption, check your fal dashboard before generating again: the prior job may still run and be billed.

## Costs

As documented September 9, 2026, a five-second request is $0.0625 / $0.10 / $0.20 at 480P / 768P / 1080P during the launch promotion. Listed standard prices after the promotion are $0.25 / $0.40 / $0.80. The UI shows standard prices. Check [current endpoint pricing](https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video/llms.txt) before running a batch. 1080P is a refinement of native 768P, while this first export pipeline caps the final long edge at 1280 px.

## Validate

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` also requires native `ffmpeg` and `ffprobe` on PATH. It builds small synthetic fixtures, verifies middle/start/end insertion duration, dimensions and audio handling, then tests the same filter graph with the actual shipped WebAssembly core. The lint command covers authored app, library and script code; the starter's vendored UI catalog is not modified.

See [the real-footage test plan](docs/testing.md).

## Hosting and reuse

This deployment is owner-private and uses a server-side `FAL_KEY` secret. Keep it private while using that key. For a public deployment, add authentication and spending controls or remove the server key and use the optional bring-your-own-key flow.

The checked-in `.openai/hosting.json` identifies this project's private Sites deployment. For your own Sites deployment, register your own Site and replace `project_id`; do not push to the original project's source remote. Outside Sites, preserve the generated Worker build and configure your own Cloudflare Worker/assets deployment.

## License and credits

Application source: MIT. Cover artwork is AI-generated illustrative art and is not a demonstration of H3 Max output. The H3 Max service has its own terms and pricing.

FFmpeg WebAssembly is a separate worker-loaded third-party component. `@ffmpeg/ffmpeg` and `@ffmpeg/util` are MIT; `@ffmpeg/core` is GPL-2.0-or-later. See [third-party notices](THIRD_PARTY_NOTICES.md), preserve its license obligations when redistributing the runtime, and consult the linked source/build instructions. The `sharp` override supplies the patched version for the hosting toolchain.
