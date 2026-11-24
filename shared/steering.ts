/**
 * Analog steering from the phone slide pad.
 *
 * Tuned calmer on 2026-11-24 after players still found it twitchy: a longer slide (60% of the
 * pad width each way), a 12% dead zone and a 75% squared curve, so a quarter of the slide is
 * ~5% steer and half the slide ~25%; the simulation also turns pad cars at 78% of the key rate
 * and eases the wheel in more slowly.
 *
 * The pad used to send a plain left/right key once the finger moved 14px, so the slightest
 * slide was full lock. Now the whole travel maps to -1..1: a small dead zone keeps the car
 * straight while the thumb rests, and a blend of linear and squared response keeps small
 * slides gentle while the end of the travel is still full lock.
 */
export const PAD_STEERING = {
  /** Share of the travel (0..1) that still counts as centred. */
  deadZone: 0.12,
  /** Share of the squared term: 0 is linear, 1 is fully squared. */
  curve: 0.75,
  /** Below this |steer| the car does not power-slide, so gentle corrections never drift. */
  driftThreshold: 0.7,
  /** Slide travel each way as a share of the pad width, clamped to [minTravelPx, maxTravelPx]. */
  travelShare: 0.6,
  minTravelPx: 90,
  maxTravelPx: 220,
  /** Pad cars turn at this share of the keyboard yaw rate at full lock. */
  yawScale: 0.78,
  /** Wheel easing rate for pad cars (keys use DRIVING.steeringResponse = 24). */
  steeringResponse: 10,
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

/** Slide travel in px for a pad of the given width. */
export const padTravel = (padWidth: number): number =>
  Math.min(
    PAD_STEERING.maxTravelPx,
    Math.max(PAD_STEERING.minTravelPx, padWidth * PAD_STEERING.travelShare),
  );

/** Valid analog steer value carried by an Input. */
export const isSteer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1;
