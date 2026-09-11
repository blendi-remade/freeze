export type PresetId =
  | "swing"
  | "rise"
  | "orbit"
  | "orbit-left"
  | "arc-return"
  | "rise-return"
  | "arc-left-return"
  | "wide-return"
  | "dip-return"
  | "high-arc-return"
  | "low-arc-return"
  | "sway-return"
  | "halo"
  | "halo-left"
  | "arc-left"
  | "low-angle";
export const ENDPOINT = "minimax/h3-max/multi-angle/image-to-video";

type CameraKeyframe = {
  time: number;
  azimuth: number;
  elevation: number;
  distance: number;
};

const pose = (
  time: number,
  azimuth: number,
  elevation = 0,
): CameraKeyframe => ({ time, azimuth: azimuth || 0, elevation, distance: 1 });

// The playground's full-turn presets use eight 45-degree steps. Preserve the
// signed full turn: resetting azimuth to zero would command a reverse orbit.
const orbit = (direction: 1 | -1): CameraKeyframe[] => [
  ...Array.from({ length: 9 }, (_, i) =>
    pose(Number(((i * 5) / 48).toFixed(6)), direction * i * 45),
  ),
  pose(1, direction * 360),
];

// Return by four seconds, leaving a full second of the opening pose at the end.
const excursion = (azimuth: number, elevation = 0): CameraKeyframe[] => [
  pose(0, 0),
  pose(0.2, azimuth / 2, elevation / 2),
  pose(0.4, azimuth, elevation),
  pose(0.6, azimuth / 2, elevation / 2),
  pose(0.8, 0),
  pose(1, 0),
];
const halo = (direction: 1 | -1): CameraKeyframe[] => [
  ...Array.from({ length: 9 }, (_, i) =>
    pose(Number(((i * 5) / 48).toFixed(6)), direction * i * 45,
      i === 8 ? 0 : Number((25 * Math.sin(Math.PI * i / 8)).toFixed(3))),
  ),
  pose(1, direction * 360),
];

export const PRESETS = [
  {
    id: "swing",
    name: "Side Arc",
    description: "A 65-degree arc around the frame.",
    duration: 5,
    returnsToStart: false,
    trajectory: [pose(0, 0), pose(1, 65, 8)],
  },
  {
    id: "rise",
    name: "Hero Rise",
    description: "A new angle on the action.",
    duration: 5,
    returnsToStart: false,
    trajectory: [pose(0, 0), pose(1, 35, 30)],
  },
  {
    id: "orbit",
    name: "Full Orbit",
    description: "A full right orbit back to the starting pose.",
    duration: 6,
    returnsToStart: true,
    trajectory: orbit(1),
  },
  {
    id: "arc-return",
    name: "Arc Return",
    description:
      "Sweep 45 degrees to the side, then retrace to the starting pose.",
    duration: 5,
    returnsToStart: true,
    trajectory: [
      pose(0, 0),
      pose(0.2, 22.5),
      pose(0.45, 45),
      pose(0.7, 22.5),
      pose(0.9, 0),
      pose(1, 0),
    ],
  },
  {
    id: "rise-return",
    name: "Rise Return",
    description: "Rise 25 degrees, then descend to the starting pose.",
    duration: 5,
    returnsToStart: true,
    trajectory: [
      pose(0, 0),
      pose(0.2, 0, 12.5),
      pose(0.45, 0, 25),
      pose(0.7, 0, 12.5),
      pose(0.9, 0),
      pose(1, 0),
    ],
  },
  {
    id: "orbit-left",
    name: "Orbit Left",
    description: "A full left orbit back to the starting pose.",
    duration: 6,
    returnsToStart: true,
    trajectory: orbit(-1),
  },
  {
    id: "arc-left-return",
    name: "Left Return",
    description: "Sweep 45 degrees left, then retrace to the opening view.",
    duration: 5,
    returnsToStart: true,
    trajectory: excursion(-45),
  },
  {
    id: "wide-return",
    name: "Wide Return",
    description: "Reach a 90-degree side view, then return to the opening pose.",
    duration: 5,
    returnsToStart: true,
    trajectory: excursion(90),
  },
  {
    id: "dip-return",
    name: "Dip Return",
    description: "Dip 20 degrees below the subject, then rise back to the opening view.",
    duration: 5,
    returnsToStart: true,
    trajectory: excursion(0, -20),
  },
  {
    id: "high-arc-return",
    name: "High Return",
    description: "Arc 45 degrees right and 25 degrees up, then retrace home.",
    duration: 5,
    returnsToStart: true,
    trajectory: excursion(45, 25),
  },
  {
    id: "low-arc-return",
    name: "Low Return",
    description: "Arc 45 degrees left and 20 degrees down, then retrace home.",
    duration: 5,
    returnsToStart: true,
    trajectory: excursion(-45, -20),
  },
  {
    id: "sway-return",
    name: "Side to Side",
    description: "Sway left, cross through the opening view to the right, then return.",
    duration: 5,
    returnsToStart: true,
    trajectory: [pose(0, 0), pose(0.2, -30), pose(0.4, 0), pose(0.6, 30), pose(0.8, 0), pose(1, 0)],
  },
  {
    id: "halo",
    name: "High Orbit",
    description: "Orbit right through a raised viewpoint, descending to the exact opening pose.",
    duration: 6,
    returnsToStart: true,
    trajectory: halo(1),
  },
  {
    id: "halo-left",
    name: "High Orbit Left",
    description: "Orbit left through a raised viewpoint, descending to the exact opening pose.",
    duration: 6,
    returnsToStart: true,
    trajectory: halo(-1),
  },
  {
    id: "arc-left",
    name: "Left Arc",
    description: "A 65-degree left arc that finishes at a new angle.",
    duration: 5,
    returnsToStart: false,
    trajectory: [pose(0, 0), pose(1, -65, 8)],
  },
  {
    id: "low-angle",
    name: "Low Reveal",
    description: "Sweep 40 degrees right and descend 20 degrees for a low-angle finish.",
    duration: 5,
    returnsToStart: false,
    trajectory: [pose(0, 0), pose(1, 40, -20)],
  },
] as const satisfies readonly {
  id: PresetId;
  name: string;
  description: string;
  duration: number;
  returnsToStart: boolean;
  trajectory: readonly CameraKeyframe[];
}[];

export function getPreset(id: PresetId) {
  const preset = PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error("Unknown camera preset.");
  return preset;
}

const FROZEN_SCENE_PROMPT =
  "The reference image is one instant of completely stopped time, held for the entire video. Only the camera moves around this static three-dimensional scene. All people and animals remain rigid lifelike statues: preserve every face, gaze, expression, pose, hand, foot, joint and garment fold. Every object stays fixed in its reference world position, orientation and shape. Airborne objects remain suspended exactly where captured: do not travel, spin, fall or complete any implied action. Freeze hair, fabric, water, particles, foliage, shadows and background activity. Apparent screen-position changes come only from camera parallax. Begin with the exact reference framing. Follow the supplied azimuth and elevation keyframes while keeping camera radius and focal length constant. No zoom, introductory push-in or camera roll. Keep the main subject in view. Preserve identities, geometry, spatial relationships, architecture, lighting, colors and materials. One continuous shot, no cuts, no added or removed people or objects.";

export function makeInput(
  image: string,
  presetId: PresetId,
  resolution: string,
  seed?: number,
) {
  const preset = getPreset(presetId);
  return {
    image_url: image,
    duration: preset.duration,
    resolution,
    prompt_expansion_mode: "balanced",
    enable_safety_checker: true,
    prompt:
      FROZEN_SCENE_PROMPT +
      (preset.returnsToStart
        ? " Return to the exact opening camera position, viewing direction, distance, focal length and reference framing by the final hold. Finish with the same frozen scene and composition as the reference image. Hold that pose through the last frame; do not resume the action."
        : ""),
    ...(seed === undefined ? {} : { seed }),
    camera_trajectory: preset.trajectory.map((keyframe) => ({ ...keyframe })),
  };
}
