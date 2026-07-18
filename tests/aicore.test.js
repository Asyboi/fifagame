import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPassTarget, pickSwitchTarget, formationAnchor, inShootingRange, shootAim, shotVelocity, aiShouldShoot } from '../src/game/aicore.js';
import { PITCH } from '../src/config.js';

const P = (id, x, z, role = 'MID') => ({ id, pos: { x, z }, vel: { x: 0, z: 0 }, role });

test('pass target prefers a teammate in the input direction', () => {
  const carrier = P(0, 0, 0);
  const right = P(1, 12, 0);          // where input points
  const behind = P(2, -12, 0);
  const pick = pickPassTarget([carrier, right, behind], [], carrier, 1, 0);
  assert.equal(pick.p.id, 1);
});

test('pass target falls back to openness when there is no input direction', () => {
  const carrier = P(0, 0, 0);
  const marked = P(1, 10, 0);
  const open = P(2, 8, 8);
  const opp = P(3, 10.5, 0.2); // sitting on 'marked'
  const pick = pickPassTarget([carrier, marked, open], [opp], carrier, 0, 0);
  assert.equal(pick.p.id, 2);
});

test('long or crowded passes are lobs', () => {
  const carrier = P(0, 0, 0);
  const far = P(1, 26, 0);
  const pick = pickPassTarget([carrier, far], [], carrier, 1, 0);
  assert.equal(pick.lob, true);
});

test('switch picks the nearest outfielder to the ball, never the current player', () => {
  const mates = [P(1, 0, 0, 'GK'), P(2, 5, 0), P(3, 2, 0), P(4, -8, 3)];
  const pick = pickSwitchTarget(mates, { x: 2.5, z: 0 }, 3);
  assert.equal(pick.id, 2);
  const pick2 = pickSwitchTarget(mates, { x: 0.4, z: 0.2 }, 99);
  assert.equal(pick2.id, 3, 'GK skipped while outfielders exist');
});

test('formation anchors shift with the ball and stay on the pitch', () => {
  const base = { x: -14, z: -10 };
  const a = formationAnchor(base, 'MID', PITCH.LENGTH / 2, 20, 1, true);
  assert.ok(a.x > base.x, 'attacks with the ball');
  assert.ok(a.x <= PITCH.LENGTH / 2 - 2 && Math.abs(a.z) <= PITCH.WIDTH / 2 - 2);
  const gk = formationAnchor({ x: -44, z: 0 }, 'GK', 40, 0, 1, true);
  assert.equal(gk.x, -44, 'GK holds his line');
});

test('shooting range respects direction and distance', () => {
  assert.equal(inShootingRange(P(1, PITCH.LENGTH / 2 - 15, 3), 1), true);
  assert.equal(inShootingRange(P(1, -(PITCH.LENGTH / 2 - 10), 0), 1), false, 'own half');
  assert.equal(inShootingRange(P(1, PITCH.LENGTH / 2 - 40, 0), 1), false, 'too far');
});

test('shoot aim stays inside the frame unless overcharged', () => {
  const half = PITCH.GOAL_WIDTH / 2;
  for (const ch of [0.2, 0.5, 0.8]) {
    const aim = shootAim(1, 0.8, ch, 0);
    assert.ok(Math.abs(aim.z) < half);
    assert.ok(aim.y < PITCH.GOAL_HEIGHT, `charge ${ch} kept under bar`);
  }
  const sky = shootAim(1, 0, 1, 0);
  assert.ok(sky.y > PITCH.GOAL_HEIGHT, 'full charge can balloon over');
});

test('shot velocity reaches the aim point at the goal plane', () => {
  const from = { x: 30, y: 0.34, z: 0 };
  const aim = { x: PITCH.LENGTH / 2, y: 1.2, z: 2.5 };
  const v = shotVelocity(from, aim, 24, 26);
  const t = (aim.x - from.x) / v.vx;
  const y = from.y + v.vy * t - 0.5 * 26 * t * t;
  assert.ok(Math.abs(y - aim.y) < 0.6, `arrives at bar height, got ${y}`);
  assert.ok(v.vx > 0, 'travels toward the +x goal');
});

test('AI only shoots when in range with a look at goal', () => {
  const diff = { reaction: 0.3 };
  assert.equal(aiShouldShoot(P(1, PITCH.LENGTH / 2 - 14, 4), 1, 4, diff), true);
  assert.equal(aiShouldShoot(P(1, PITCH.LENGTH / 2 - 60, 0), 1, 4, diff), false);
});
