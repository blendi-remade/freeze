export function buildEditPlan(
  width: number,
  height: number,
  freezeAt: number,
  cameraDuration: number,
  sourceDuration: number,
  sourceAudio: boolean,
  cameraAudio: boolean,
  cameraSpeed = 1,
  trimCameraEnd = false,
) {
  if (!Number.isFinite(cameraSpeed) || cameraSpeed < 1 || cameraSpeed > 2)
    throw new Error('AI clip speed must be between 1× and 2×.');
  const keptDuration = cameraDuration - (trimCameraEnd ? 1 : 0);
  if (keptDuration <= 0)
    throw new Error('The AI clip is too short to trim its last second.');
  const playbackDuration = keptDuration / cameraSpeed;
  const videoTrim = trimCameraEnd ? `trim=duration=${keptDuration},` : '';
  const audioTrim = trimCameraEnd ? `atrim=duration=${keptDuration},` : '';
  const normalize = `scale=${width}:${height},setsar=1,fps=30,format=yuv420p`;
  const graph: string[] = [];
  const segments: string[] = [],
    audios: string[] = [];
  const hasAudio = sourceAudio || cameraAudio;
  if (freezeAt >= 1 / 30) {
    graph.push(
      `[0:v]trim=end=${freezeAt},setpts=PTS-STARTPTS,${normalize}[before]`,
    );
    segments.push('[before]');
    if (hasAudio) {
      graph.push(
        sourceAudio
          ? `[0:a]atrim=end=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${freezeAt}[abefore]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${freezeAt},asetpts=PTS-STARTPTS[abefore]`,
      );
      audios.push('[abefore]');
    }
  }
  const remaining = sourceDuration - freezeAt;
  // Retime only the AI insert, then cut directly to the unchanged source tail.
  graph.push(`[1:v]${videoTrim}setpts=(PTS-STARTPTS)/${cameraSpeed},${normalize}[camera]`);
  segments.push('[camera]');
  if (hasAudio) {
    graph.push(
      cameraAudio
        ? `[1:a]${audioTrim}asetpts=PTS-STARTPTS,atempo=${cameraSpeed},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${playbackDuration}[acamera]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${playbackDuration},asetpts=PTS-STARTPTS[acamera]`,
    );
    audios.push('[acamera]');
  }
  if (remaining >= 1 / 30) {
    graph.push(
      `[0:v]trim=start=${freezeAt},setpts=PTS-STARTPTS,${normalize}[after]`,
    );
    segments.push('[after]');
    if (hasAudio) {
      graph.push(
        sourceAudio
          ? `[0:a]atrim=start=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${remaining}[aafter]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${remaining},asetpts=PTS-STARTPTS[aafter]`,
      );
      audios.push('[aafter]');
    }
  }
  graph.push(`${segments.join('')}concat=n=${segments.length}:v=1:a=0[v]`);
  if (hasAudio)
    graph.push(`${audios.join('')}concat=n=${audios.length}:v=0:a=1[a]`);
  return graph.join(';');
}
