/**
 * Analog steering from the phone slide pad.
 *
 * The pad used to send a plain left/right key once the finger moved 14px, so the slightest
 * slide was full lock. Now the whole travel maps to -1..1: a small dead zone keeps the car
 * straight while the thumb rests, and a blend of linear and squared response keeps small
 * slides gentle while the end of the travel is still full lock.
 */
export const PAD_STEERING = {
  /** Share of the travel (0..1) that still counts as centred. */
  deadZone: 0.08,
  /** Share of the squared term: 0 is linear, 1 is fully squared. */
  curve: 0.65,
  /** Below this |steer| the car does not power-slide, so gentle corrections never drift. */
  driftThreshold: 0.6,
} as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Finger offset in px from the pad centre (negative = left) to steer in -1 (left)..1 (right). */
export function padSteer(dx: number, travelPx: number): number {
  if (!Number.isFinite(dx) || !(travelPx > 0)) return 0;
  const raw = clamp(Math.abs(dx) / travelPx, 0, 1);
  const n = clamp((raw - PAD_STEERING.deadZone) / (1 - PAD_STEERING.deadZone), 0, 1);
  const out = n * (1 - PAD_STEERING.curve) + n * n * PAD_STEERING.curve;
  return out === 0 ? 0 : Math.sign(dx) * out;
}

/** Valid analog steer value carried by an Input. */
export const isSteer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1;
