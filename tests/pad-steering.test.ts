import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { Race, initPhysics } from '../shared/simulation.ts';
import { isInput } from '../shared/protocol.ts';
import { PAD_STEERING, padSteer, padTravel } from '../shared/steering.ts';
import { drivingControl } from '../shared/driving.ts';
import { trackAt } from '../shared/track.ts';

before(async () => {
  await initPhysics();
});

test('the pad maps the whole slide to steering, with a dead zone and a soft centre', () => {
  const travel = 100;
  assert.equal(padSteer(0, travel), 0);
  assert.equal(padSteer(5, travel), 0, 'resting thumb wobble stays straight');
  assert.equal(padSteer(-7, travel), 0);
  const small = padSteer(15, travel);
  assert.ok(small > 0 && small < 0.1, `a 15% slide is a small correction, got ${small}`);
  const quarter = padSteer(25, travel);
  assert.ok(quarter > 0.03 && quarter < 0.07, `a quarter slide is ~5% steer, got ${quarter}`);
  const half = padSteer(50, travel);
  assert.ok(half > 0.2 && half < 0.3, `half the slide is about a quarter lock, got ${half}`);
  assert.ok(padSteer(10, travel) === 0, 'the 12% dead zone holds a resting thumb');
  assert.equal(padSteer(100, travel), 1);
  assert.equal(padSteer(-100, travel), -1);
  assert.equal(padSteer(400, travel), 1, 'past the end stays clamped');
  let last = 0;
  for (let dx = 0; dx <= travel; dx++) {
    const v = padSteer(dx, travel);
    assert.ok(v >= last, 'monotonic across the travel');
    last = v;
  }
  assert.equal(padSteer(Number.NaN, travel), 0);
  assert.equal(padSteer(40, 0), 0);
});

test('the slide spans 60% of the pad width each way, 90-220px', () => {
  assert.equal(padTravel(100), 90);
  assert.equal(padTravel(200), 120);
  assert.equal(padTravel(1000), 220);
});

test('inputs accept analog steer in -1..1 only, and keys may omit it', () => {
  const base = { seq: 1, left: false, right: false, actionSeq: 0 };
  assert.equal(isInput(base), true);
  assert.equal(isInput({ ...base, steer: 0.3 }), true);
  assert.equal(isInput({ ...base, steer: -1 }), true);
  assert.equal(isInput({ ...base, steer: 1.01 }), false);
  assert.equal(isInput({ ...base, steer: Number.NaN }), false);
  assert.equal(isInput({ ...base, steer: '1' }), false);
});

test('gentle steering never power-slides; a hard turn still drifts', () => {
  const state = { steering: 0, drift: 0, grounded: true, reverseHold: 0, reversing: false };
  const input = { speed: 20, brake: false, boost: false, frozen: false, hit: false };
  const gentle = drivingControl(20, state, { ...input, turn: 0.3 }, 1 / 30);
  assert.equal(gentle.drift, 0);
  const hard = drivingControl(20, state, { ...input, turn: PAD_STEERING.driftThreshold }, 1 / 30);
  assert.ok(hard.drift > 0);
});

function setup() {
  const r = new Race(71);
  for (let i = 0; i < 2; i++)
    r.addDriver({
      id: 'p' + i,
      name: 'Pad ' + i,
      slot: i,
      bot: false,
      ready: true,
      connected: true,
      wins: 0,
    });
  r.start();
  r.phase = 'racing';
  r.roundStart = r.tick;
  const s = -100;
  r.cameraProgress = s;
  const c = r.cars.get('p0')!,
    a = trackAt(s);
  c.progress = s;
  c.weapon = null;
  c.invulnerableUntil = 10000;
  c.body.setTranslation({ x: a.p.x, y: a.p.y + 0.55, z: a.p.z }, true);
  c.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a.yaw), true);
  c.body.setLinvel(a.t.clone().multiplyScalar(10), true);
  const other = r.cars.get('p1')!,
    b = trackAt(s + 40);
  other.progress = s + 40;
  other.body.setTranslation({ x: b.p.x, y: b.p.y + 0.55, z: b.p.z }, true);
  return { r, yaw0: a.yaw };
}
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
function turnWith(steer: number | undefined, left = false, right = false) {
  const { r, yaw0 } = setup();
  try {
    const c = r.cars.get('p0')!;
    for (let i = 0; i < 15; i++) {
      const o = r.cars.get('p1')!;
      r.input('p1', { seq: o.input.seq + 1, left: false, right: false, actionSeq: 0 });
      r.input('p0', {
        seq: c.input.seq + 1,
        left,
        right,
        ...(steer === undefined ? {} : { steer }),
        actionSeq: 0,
      });
      r.step();
    }
    return angle(r.snapshot('PAD').cars.find((x) => x.id === 'p0')!.yaw - yaw0);
  } finally {
    r.dispose();
  }
}

test('the simulation honours analog steer instead of treating it as full lock', () => {
  const full = turnWith(-1, true, false);
  const keyLeft = turnWith(undefined, true, false);
  const small = turnWith(-0.2, true, false);
  const right = turnWith(0.5, false, true);
  assert.ok(full > 0.2, `full left turns left, got ${full}`);
  assert.ok(
    full < keyLeft * 0.85 && full > keyLeft * 0.5,
    `full pad lock turns calmer than the key, got ${full} vs ${keyLeft}`,
  );
  assert.ok(small > 0 && small < full * 0.4, `a 0.2 steer turns a little, got ${small} vs ${full}`);
  assert.ok(right < 0, 'positive steer turns right');
});
