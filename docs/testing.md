# Real-footage evaluation

Start with short SDR H.264 clips, a relatively stationary phone, and a sharp frame at the apex of the action. Use 768P and Side Arc for the first pass. The exporter currently produces 30fps MP4 with the original aspect ratio and a 1280px maximum long edge.

## First six clips

| Clip                 | What it tests                                     |
| -------------------- | ------------------------------------------------- |
| Bottle flip          | Small airborne object, hand shape, landing payoff |
| Skateboard ollie     | Board, limbs, ground shadow, fast action          |
| Dog catching a treat | Fur, face consistency, small target               |
| Dance jump           | Face, clothes, pose preservation                  |
| Basketball toss      | Ball shape, hands, background geometry            |
| Hair flip            | Thin structures, subject motion leakage           |

Generate once with Side Arc; retry only when necessary. Check the fal dashboard if a request times out. Then compare Hero Rise and Full Orbit on the three strongest clips. Record each attempt so the successful examples do not hide retry costs.

## Record for every result

| Clip / timestamp | Move | Attempt | Render time | Subject frozen? | Identity preserved? | Entry seam | Exit seam | Shareable? | Cost |
| ---------------- | ---- | ------- | ----------- | --------------- | ------------------- | ---------- | --------- | ---------- | ---- |
|                  |      |         |             |                 |                     |            |           |            |      |

Score entry and exit seams 1–5, where 5 is visually unobtrusive. Watch the entire finished edit, not just the generated camera move. Check the cut from the source frame into the generated clip.

## Browser flow checks

- Drag/drop and file chooser; reject an unsupported file, a >150MB file, and a >60s clip.
- Scrub, step, play/pause, replace source, portrait video, and landscape video.
- Key connection, refresh clears key, invalid key, empty balance, generation error.
- Source/result toggle and repeated generation.
- Local export with sound and without sound; each segment retains its audio when available.
- Download MP4, check duration = full original duration + generated clip duration.
- Narrow mobile layout and keyboard navigation through presets, slider and dialogs.
- Browser engine download and worker loading on the deployed URL.
- Add music before generation and to an existing finished edit; confirm Sonilo receives the complete edited video and one sample, and only runs when opted in.
- Check soundtrack layering with and without existing audio; preserve picture frames and duration. Uncheck to restore the clean edit, then recheck to reuse the soundtrack.
- Music upload/queue/mix failures keep the video downloadable; Retry music polls an existing job without starting another paid request.

## Launch gate (proposed)

At least 80% of suitable clips should produce a shareable result within two attempts. No claim has been made that this target is already met. If the gate fails, narrow the recommended input type and default move before expanding the UI.
