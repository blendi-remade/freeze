# Freeze

Turn one frame of a video into a camera orbit with [MiniMax H3 Max Multi Angle on fal](https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video), then resume the original action.

![Freeze editor with a backflip loaded and Full Orbit selected](docs/images/editor.png)

```text
Original up to the selected frame → generated camera move → rest of the original
```

## Run locally

Requires Node.js 22.13+ and npm. Install **FFmpeg and ffprobe** on your PATH for native local export.

```bash
git clone https://github.com/blendi-remade/freeze.git
cd freeze
npm ci
```

Create a `.dev.vars` file in the project root:

```dotenv
FAL_KEY=your_fal_key
```

Then start the app:

```bash
npm run dev
```

Open the local URL printed in the terminal. Alternatively, leave the key file unset and use **Connect fal** to enter a key for the current tab. `.dev.vars*` and `.env*` files are ignored by Git; never commit your key.

## Make an edit

1. Open or drop a video. H.264 MP4 is the most predictable format. Clips can be 1–60 seconds and up to 150 MB.
2. Scrub to a sharp frame at the moment you want to freeze.
3. Choose a camera move and resolution, then select **Generate freeze**.
4. The app generates the camera move and automatically assembles the complete video. Download the finished MP4.
5. Beside Quality, choose **Final speed** from 1× to 3× in 0.25× steps. Changing speed rebuilds the full edit and updates both the preview and downloaded MP4, with audio kept in sync and pitch preserved. It reuses the existing camera generation without another model call.

**Rebuild full video** reuses the existing generation without another model call. Keep the tab open until you download your result; projects are not saved across refreshes.

## Camera controls

| Preset | Path | Requested duration |
| --- | --- | --- |
| Full Orbit (default) | 0° → 360° azimuth, level elevation | 6 seconds |
| Side Arc | 0° → 65° azimuth, 0° → 8° elevation | 5 seconds |
| Hero Rise | 0° → 35° azimuth, 0° → 30° elevation | 5 seconds |

Full Orbit uses nine keyframes, reaching 360° at normalized time 0.833333. All presets use constant normalized camera distance, balanced prompt expansion, and no fixed seed. The **Recipe** panel shows the endpoint payload; edit `lib/recipe.ts` to adjust prompts and trajectories.

The Full Orbit prompt retains the playground wording that worked in our test, including scene-specific parking-ceiling and furniture references. It is a starting point for experimentation, not a universal prompt.

## How it works

- The browser extracts a JPEG at your selected timestamp. Only that frame is sent to fal for generation.
- Server routes submit the request and poll the fal queue. Server-configured keys are never returned to the browser. Manually entered keys live in tab memory and are passed to the relay.
- In local development, native FFmpeg assembles the source prefix, generated clip, and source tail. Temporary assembly files are removed afterward.
- The generated clip sets the output dimensions. The original is resized to match without cropping or padding, which can slightly change its proportions.
- A 0.2-second blend at the end of the generated clip returns to the original freeze frame before the source action resumes. No optical-flow alignment is applied.
- Output is H.264 MP4 at 30 fps. Audio from each segment is retained when available, with silence substituted where needed.
- When native local export is unavailable, the app falls back to browser FFmpeg WebAssembly. The approximately 32 MB engine loads on demand; browser export can be slower and use substantial memory.

Built with React, TypeScript, Vinext/Vite, and Cloudflare-compatible API routes.

## What to expect

This is an experimental demo. We have tested real backflip footage, but results vary with the frame and camera path. H3 may animate subjects, invent unseen geometry, or change framing and lighting. The exit blend softens a cut; it does not guarantee a seamless return.

Use a short SDR clip and a sharp freeze frame for initial tests. HDR tone mapping, automatic color matching, subject tracking, and exact variable-frame-rate stepping are not implemented. Timeline stepping uses 1/30-second increments.

Generation is billed to your fal account. Check [current endpoint pricing](https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video) before running a batch. The UI displays standard-price estimates; promotions and actual billing may differ. If polling times out, check your fal dashboard before submitting another request.

## Development checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests require native FFmpeg and ffprobe. They check timeline duration, output dimensions and audio for several insertion points, including mismatched source/generated aspect ratios, and exercise the shipped WebAssembly encoder. See [the footage test plan](docs/testing.md) for manual checks.

## Hosting

The app is intended to run locally with your own key. If hosting it with a server-side key, add authentication and spending controls before making it public.

The checked-in `.openai/hosting.json` belongs to the original private Sites deployment. Register your own Site and replace its project ID when deploying a fork through Sites. Other deployments need a compatible Worker/assets setup. The native assembly middleware runs only in local development; hosted exports use the browser fallback.

## License

Application code is MIT. The H3 Max endpoint is a separate paid service with its own terms. The screenshot shows the editor with sample footage; that footage is not included in the code license or bundled as a video. The empty-state illustration is AI-generated artwork, not a model result.

`@ffmpeg/ffmpeg` and `@ffmpeg/util` are MIT; the bundled `@ffmpeg/core` is GPL-2.0-or-later. See [third-party notices](THIRD_PARTY_NOTICES.md) and preserve the applicable notices and source obligations when redistributing it.
