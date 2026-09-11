# Real-footage evaluation

Start with short SDR H.264 clips, a relatively stationary phone, and a sharp frame at the apex of the action. Use 768P and Arc Return for the first pass. The exporter produces 30fps MP4 at the generated clip's dimensions, with a direct cut back to the source and no exit blend.

## First six clips

| Clip                 | What it tests                                     |
| -------------------- | ------------------------------------------------- |
| Bottle flip          | Small airborne object, hand shape, landing payoff |
| Skateboard ollie     | Board, limbs, ground shadow, fast action          |
| Dog catching a treat | Fur, face consistency, small target               |
| Dance jump           | Face, clothes, pose preservation                  |
| Basketball toss      | Ball shape, hands, background geometry            |
| Hair flip            | Thin structures, subject motion leakage           |

Generate once with Arc Return; retry only when necessary. Check the fal dashboard if a request times out. Then compare Rise Return, Full Orbit and Orbit Left on the three strongest clips. Inspect both the camera pose and subject/scene consistency at the final frame. Record each attempt so the successful examples do not hide retry costs.

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
- Download MP4, check duration = original duration + (generated duration − optional 1-second trim) / AI clip speed.
- Narrow mobile layout and keyboard navigation through presets, slider and dialogs.
- Browser engine download and worker loading on the deployed URL.

## Launch gate (proposed)

At least 80% of suitable clips should produce a shareable result within two attempts. No claim has been made that this target is already met. If the gate fails, narrow the recommended input type and default move before expanding the UI.
