export type PresetId = 'swing' | 'rise' | 'orbit';
export const ENDPOINT = 'minimax/h3-max/multi-angle/image-to-video';
export const PRESETS = [
  {
    id: 'swing',
    name: 'Swing Back',
    description: 'A side arc. Then rewind.',
    angle: '65° / LATERAL',
  },
  {
    id: 'rise',
    name: 'Hero Rise',
    description: 'A new angle on the action.',
    angle: '35° / ELEVATED',
  },
  {
    id: 'orbit',
    name: 'Full Orbit',
    description: 'All the way around. Experimental.',
    angle: '360° / ORBIT',
  },
] as const;
export function makeInput(
  image: string,
  preset: PresetId,
  resolution: string,
  seed?: number,
) {
  const target =
    preset === 'swing'
      ? { azimuth: 65, elevation: 8 }
      : preset === 'rise'
        ? { azimuth: 35, elevation: 30 }
        : { azimuth: 360, elevation: 0 };
  return {
    image_url: image,
    duration: 5,
    resolution,
    prompt_expansion_mode: 'balanced',
    enable_safety_checker: true,
    prompt:
      'Preserve the exact reference framing at the start. The entire scene is frozen in time. All people, faces, limbs, clothing, objects and background elements remain rigid and motionless. Only the camera moves, following the supplied trajectory. Preserve identity, lighting, colors, materials and spatial relationships. Constant camera radius and focal length. One continuous shot, no cuts, no added objects, no subject animation.',
    ...(seed === undefined ? {} : { seed }),
    camera_trajectory: [
      { time: 0, azimuth: 0, elevation: 0, distance: 1 },
      { time: 1, ...target, distance: 1 },
    ],
  };
}
