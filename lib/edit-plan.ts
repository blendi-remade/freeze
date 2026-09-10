export function buildEditPlan(
  width: number,
  height: number,
  freezeAt: number,
  cameraDuration: number,
  sourceDuration: number,
  sourceAudio: boolean,
  cameraAudio: boolean,
) {
  const normalize = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`;
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
  graph.push(`[1:v]setpts=PTS-STARTPTS,${normalize}[camera]`);
  segments.push('[camera]');
  if (hasAudio) {
    graph.push(
      cameraAudio
        ? `[1:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${cameraDuration}[acamera]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${cameraDuration},asetpts=PTS-STARTPTS[acamera]`,
    );
    audios.push('[acamera]');
  }
  const remaining = sourceDuration - freezeAt;
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
