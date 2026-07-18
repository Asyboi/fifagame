import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBall, stepBall, kickBall, giveBall, predictCrossing, ballSpeed } from '../src/game/ball.js';
import { BALL, PITCH } from '../src/config.js';

const stepN = (b, dt, n) => {
  let r = { hitPost: false };
  for (let i = 0; i < n; i++) r = stepBall(b, dt);
  return r;
};

test('gravity pulls a lifted ball back to the ground', () => {
  const b = createBall();
  kickBall(b, 0, 8, 0, 'home');
  stepN(b, 1 / 60, 240); // 4 seconds
  assert.equal(b.pos.y, BALL.R);
  assert.equal(b.vel.y <= 0.01, true);
});

test('bounced ball loses energy (restitution < 1)', () => {
  const b = createBall();
  b.pos.y = 5;
  stepN(b, 1 / 60, 600);
  assert.ok(b.pos.y <= BALL.R + 0.01, 'settles on the ground');
  assert.ok(Math.abs(b.vel.y) < 0.5, 'no perpetual bounce');
});

test('rolling ball slows to a stop via friction', () => {
  const b = createBall();
  kickBall(b, 6, 0, 0, 'home');
  stepN(b, 1 / 60, 600);
  assert.ok(ballSpeed(b) < 0.1, `speed ${ballSpeed(b)} should decay`);
});

test('air drag makes long balls slower than friction-free', () => {
  const b = createBall();
  kickBall(b, 20, 6, 0, 'home');
  const x0 = b.pos.x;
  stepN(b, 1 / 60, 60); // 1s
  const traveled = b.pos.x - x0;
  assert.ok(traveled < 20, `drag should eat distance, got ${traveled}`);
  assert.ok(traveled > 12, 'but still travels');
});

test('goal frame: shot straight at the post rebounds, does not pass through', () => {
  const b = createBall();
  b.pos.x = PITCH.LENGTH / 2 - 3;
  b.pos.z = PITCH.GOAL_WIDTH / 2; // dead on the right post
  kickBall(b, 25, 0, 0, 'home');
  let hit = false;
  for (let i = 0; i < 120; i++) hit = stepBall(b, 1 / 120).hitPost || hit;
  assert.ok(hit, 'post collision registered');
  assert.ok(b.pos.x < PITCH.LENGTH / 2 + 0.2, 'ball stayed out of the net');
});

test('ball inside the net behind the line gets smothered', () => {
  const b = createBall();
  b.pos.x = PITCH.LENGTH / 2 - 0.5;
  b.pos.z = 0;
  kickBall(b, 20, 0, 0, 'home');
  stepN(b, 1 / 60, 30);
  assert.ok(b.pos.x < PITCH.LENGTH / 2 + PITCH.GOAL_DEPTH, 'net holds depth');
  assert.ok(Math.abs(b.vel.x) < 8, 'net kills pace');
});

test('predictCrossing hits the goal plane with sane y/z', () => {
  const b = createBall();
  b.pos.x = 20; b.pos.z = 2; b.pos.y = BALL.R;
  kickBall(b, 18, 3, -1, 'home');
  const p = predictCrossing(b, PITCH.LENGTH / 2);
  assert.ok(p, 'crossing exists');
  assert.ok(p.t > 0.5 && p.t < 2.5);
  assert.ok(p.y > 0 && p.y < 6);
});

test('giveBall stops the ball and sets ownership', () => {
  const b = createBall();
  kickBall(b, 10, 4, 2, 'away');
  giveBall(b, { id: 7 }, 'home');
  assert.equal(b.owner.id, 7);
  assert.equal(b.lastTouch, 'home');
  assert.equal(ballSpeed(b), 0);
});
