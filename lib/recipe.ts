export type PresetId = "swing" | "rise" | "orbit";
export const ENDPOINT = "minimax/h3-max/multi-angle/image-to-video";
export const PRESETS = [
  {
    id: "swing",
    name: "Side Arc",
    description: "A 65-degree arc around the frame.",
    angle: "65° / LATERAL",
  },
  {
    id: "rise",
    name: "Hero Rise",
    description: "A new angle on the action.",
    angle: "35° / ELEVATED",
  },
  {
    id: "orbit",
    name: "Full Orbit",
    description: "All the way around. Experimental.",
    angle: "360° / ORBIT",
  },
] as const;
export function makeInput(
  image: string,
  preset: PresetId,
  resolution: string,
  seed?: number,
) {
  const target =
    preset === "swing"
      ? { azimuth: 65, elevation: 8 }
      : preset === "rise"
        ? { azimuth: 35, elevation: 30 }
        : { azimuth: 360, elevation: 0 };
  return {
    image_url: image,
    duration: preset === "orbit" ? 6 : 5,
    resolution,
    prompt_expansion_mode: "balanced",
    enable_safety_checker: true,
    prompt:
      preset === "orbit"
        ? "The same people in the reference are rigid lifelike mannequins. Preserve every face, gaze, pose, hand, foot, joint, garment fold and contact with furniture. The entire scene is frozen. Only the camera moves. Camera choreography: Low camera swing and direction reversal beneath the parking ceiling. Follow the supplied azimuth and elevation keyframes, moving quickly through the middle with controlled acceleration, deceleration and rounded reversals. Begin with the exact reference framing. Keep camera radius and focal length constant. No zoom, no introductory push-in, no camera roll. Aim at the group center and keep the people visible. Preserve architecture and lighting. One continuous editorial shot, no cuts, no added people or objects."
        : "The reference image is one instant of completely stopped time, held for the entire video. Render a camera move around this static three-dimensional scene. Only the camera moves. All people and animals remain rigid lifelike statues: preserve every face, gaze, expression, pose, hand, foot, joint and garment fold. Every object stays fixed in its reference world position, orientation and shape. Airborne objects, including balls, remain suspended at exactly the captured point in space; they do not travel, spin, fall, bounce or reach their target. Do not continue or complete any action implied by the image. Freeze hair, fabric, water, particles, foliage, shadows and background activity. Apparent screen-position changes must come only from camera parallax, never independent subject or object motion. Begin with the exact reference framing. Follow the supplied azimuth and elevation keyframes while keeping camera radius and focal length constant. No zoom, introductory push-in or camera roll. Keep the main subject in view. Preserve identities, geometry, spatial relationships, architecture, lighting, colors and materials. One continuous shot, no cuts, no added or removed people or objects.",
    ...(seed === undefined ? {} : { seed }),
    camera_trajectory:
      preset === "orbit"
        ? [
            0, 0.104167, 0.208333, 0.3125, 0.416666, 0.520833, 0.625, 0.729166,
            0.833333,
          ].map((time, index) => ({
            time,
            azimuth: index * 45,
            elevation: 0,
            distance: 1,
          }))
        : [
            { time: 0, azimuth: 0, elevation: 0, distance: 1 },
            { time: 1, ...target, distance: 1 },
          ],
  };
}
