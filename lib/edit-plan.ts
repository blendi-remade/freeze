export function buildEditPlan(
  width: number,
  height: number,
  freezeAt: number,
  cameraDuration: number,
  sourceDuration: number,
  sourceAudio: boolean,
  cameraAudio: boolean,
) {
  const normalize = `scale=${width}:${height},setsar=1,fps=30,format=yuv420p`;
  const normalizeCamera = normalize;
  const graph: string[] = [];
  const segments: string[] = [],
    audios: string[] = [];
  const hasAudio = sourceAudio || cameraAudio;
  if (freezeAt >= 1 / 30) {
    graph.push(
      `[0:v]trim=end=${freezeAt},setpts=PTS-STARTPTS,${normalize}[before]`,
    );
    segments.push("[before]");
    if (hasAudio) {
      graph.push(
        sourceAudio
          ? `[0:a]atrim=end=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${freezeAt}[abefore]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${freezeAt},asetpts=PTS-STARTPTS[abefore]`,
      );
      audios.push("[abefore]");
    }
  }
  const remaining = sourceDuration - freezeAt;
  if (remaining >= 1 / 30) {
    // Blend the last six frames into the source's frozen pose before motion resumes.
    // This preserves the full timeline and leaves the entry cut untouched.
    const blendDuration = Math.min(0.2, cameraDuration);
    const blendStart = Math.max(0, cameraDuration - blendDuration);
    const weight = `clip((T-${blendStart})/${Math.max(1 / 30, blendDuration - 1 / 30)},0,1)`;
    graph.push(
      `[1:v]setpts=PTS-STARTPTS,${normalizeCamera}[cameraRaw]`,
      `[0:v]trim=start=${freezeAt},setpts=PTS-STARTPTS,${normalize},trim=end_frame=1,tpad=stop_mode=clone:stop_duration=${cameraDuration},trim=duration=${cameraDuration}[returnFrame]`,
      `[cameraRaw][returnFrame]blend=all_expr='A*(1-${weight})+B*${weight}':shortest=1[camera]`,
    );
  } else {
    graph.push(`[1:v]setpts=PTS-STARTPTS,${normalizeCamera}[camera]`);
  }
  segments.push("[camera]");
  if (hasAudio) {
    graph.push(
      cameraAudio
        ? `[1:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${cameraDuration}[acamera]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${cameraDuration},asetpts=PTS-STARTPTS[acamera]`,
    );
    audios.push("[acamera]");
  }
  if (remaining >= 1 / 30) {
    graph.push(
      `[0:v]trim=start=${freezeAt},setpts=PTS-STARTPTS,${normalize}[after]`,
    );
    segments.push("[after]");
    if (hasAudio) {
      graph.push(
        sourceAudio
          ? `[0:a]atrim=start=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${remaining}[aafter]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${remaining},asetpts=PTS-STARTPTS[aafter]`,
      );
      audios.push("[aafter]");
    }
  }
  graph.push(`${segments.join("")}concat=n=${segments.length}:v=1:a=0[v]`);
  if (hasAudio)
    graph.push(`${audios.join("")}concat=n=${audios.length}:v=0:a=1[a]`);
  return graph.join(";");
}
