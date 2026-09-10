export function buildEditPlan(
  width: number,
  height: number,
  total: number,
  freezeAt: number,
  rewind: boolean,
  hasAudio: boolean,
) {
  const normalize = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`;
  const graph: string[] = [];
  const segments: string[] = [],
    audios: string[] = [];
  // A 3.2s insert: either a 1.6s outbound arc + its exact reverse, or a full orbit.
  if (rewind) {
    graph.push(
      `[1:v]trim=duration=5,setpts=0.32*(PTS-STARTPTS),${normalize},split=2[outbound][returning]`,
    );
    graph.push('[returning]reverse,setpts=PTS-STARTPTS[back]');
    graph.push(
      '[outbound][back]concat=n=2:v=1:a=0,trim=duration=3.2,setpts=PTS-STARTPTS[insert]',
    );
  } else
    graph.push(
      `[1:v]trim=duration=5,setpts=0.64*(PTS-STARTPTS),${normalize},trim=duration=3.2[insert]`,
    );
  if (freezeAt >= 0.04) {
    graph.push(
      `[0:v]trim=end=${freezeAt},setpts=PTS-STARTPTS,${normalize}[before]`,
    );
    segments.push('[before]');
    if (hasAudio) {
      graph.push(
        `[0:a]atrim=end=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[abefore]`,
      );
      audios.push('[abefore]');
    }
  }
  segments.push('[insert]');
  if (hasAudio) {
    graph.push(
      'anullsrc=r=48000:cl=stereo,atrim=duration=3.2,asetpts=PTS-STARTPTS[asilence]',
    );
    audios.push('[asilence]');
  }
  if (total - freezeAt >= 0.04) {
    graph.push(
      `[0:v]trim=start=${freezeAt},setpts=PTS-STARTPTS,${normalize}[after]`,
    );
    segments.push('[after]');
    if (hasAudio) {
      graph.push(
        `[0:a]atrim=start=${freezeAt},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[aafter]`,
      );
      audios.push('[aafter]');
    }
  }
  graph.push(`${segments.join('')}concat=n=${segments.length}:v=1:a=0[v]`);
  if (hasAudio)
    graph.push(`${audios.join('')}concat=n=${audios.length}:v=0:a=1[a]`);
  return graph.join(';');
}
