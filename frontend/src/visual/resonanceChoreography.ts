export const REFERENCE_END = 7.17;
export const RING_LAYERS = 7;

/** Stay in the oblique front view, including initial load, seeking and replay. */
export function resonanceView(seconds: number) {
  const t = Math.max(0, seconds);
  return {
    pitch: -0.035,
    yaw: -1.22 + Math.sin(t * 0.18) * 0.04,
    roll: -0.49 + Math.sin(t * 0.14) * 0.025,
  };
}
