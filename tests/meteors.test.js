import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorm, updateStorm, resolveImpact } from '../src/game/meteors.js';
import { PITCH, METEOR } from '../src/config.js';

const mkPlayer = (x, z, alive = true) => ({ alive, pos: { x, z } });

test('storm: inactive before the 1-minute mark', () => {
  const s = createStorm();
  const ev = updateStorm(s, METEOR.START_AT - 1, 10, null, () => 0.5);
  assert.equal(ev.started, false);
  assert.equal(ev.spawned.length, 0);
  assert.equal(s.active, false);
});

test('storm: activates at the 1-minute mark and announces itself once', () => {
  const s = createStorm();
  const ev = updateStorm(s, METEOR.START_AT, 0.016, null, () => 0.5);
  assert.equal(ev.started, true);
  assert.equal(s.active, true);
  // first meteor only after FIRST_DELAY
  assert.equal(ev.spawned.length, 0);
  const ev2 = updateStorm(s, METEOR.START_AT + METEOR.FIRST_DELAY, METEOR.FIRST_DELAY + 0.01, null, () => 0.5);
  assert.equal(ev2.started, false); // no re-announce
  assert.equal(ev2.spawned.length, 1);
});

test('storm: keeps spawning on its interval', () => {
  const s = createStorm();
  updateStorm(s, METEOR.START_AT, 0.016, null, () => 0.5);
  let spawned = 0;
  // simulate 30s of play in 1/60 steps
  for (let i = 0; i < 30 * 60; i++) {
    spawned += updateStorm(s, METEOR.START_AT + 1 + i / 60, 1 / 60, null, () => 0.5).spawned.length;
  }
  const expected = 30 / ((METEOR.SPAWN_MIN + METEOR.SPAWN_MAX) / 2);
  assert.ok(spawned > expected * 0.5 && spawned < expected * 1.6, `spawned ${spawned}, expected ~${expected}`);
});

test('storm: meteors fall at medium speed and impact the ground', () => {
  const s = createStorm();
  updateStorm(s, METEOR.START_AT, 0.016, null, () => 0.5);
  updateStorm(s, METEOR.START_AT + METEOR.FIRST_DELAY, METEOR.FIRST_DELAY + 0.01, null, () => 0.5);
  assert.equal(s.meteors.length, 1);
  const m = s.meteors[0];
  assert.equal(m.vy, -METEOR.SPEED);
  assert.ok(m.y > METEOR.SPAWN_HEIGHT - METEOR.SPEED * 2, 'just spawned, near the top');

  const y0 = m.y;
  updateStorm(s, METEOR.START_AT + 2, 0.5, null, () => 0.5);
  assert.ok(m.y < y0, 'meteor descends');

  // fast-forward until it lands
  let impacted = [];
  for (let i = 0; i < 60 * 10 && impacted.length === 0; i++) {
    impacted = updateStorm(s, METEOR.START_AT + 3 + i / 60, 1 / 60, null, () => 0.5).impacted;
  }
  assert.equal(impacted.length, 1);
  assert.equal(impacted[0].id, m.id);
  assert.equal(s.meteors.length, 0, 'impacted meteor is removed');
});

test('storm: meteors land on the pitch', () => {
  const s = createStorm();
  updateStorm(s, METEOR.START_AT, 0.016, null, () => 0.99);
  const all = [];
  for (let i = 0; i < 200; i++) { // 100s of storm time
    const ev = updateStorm(s, METEOR.START_AT + 1 + i * 0.5, 0.5, null, Math.random);
    for (const m of ev.spawned) all.push({ x: m.x, z: m.z }); // snapshot — meteors drift after spawning
  }
  assert.ok(all.length >= 20, `spawned ${all.length}`);
  for (const m of all) {
    assert.ok(Math.abs(m.x) <= PITCH.LENGTH / 2, `x ${m.x} on pitch`);
    assert.ok(Math.abs(m.z) <= PITCH.WIDTH / 2, `z ${m.z} on pitch`);
  }
});

test('storm: targeted strikes land near the target point', () => {
  const s = createStorm();
  updateStorm(s, METEOR.START_AT, 0.016, null, () => 0.5);
  const target = { x: 10, z: -5 };
  const ev = updateStorm(s, METEOR.START_AT + METEOR.FIRST_DELAY, METEOR.FIRST_DELAY + 0.01, () => target, () => 0.5);
  const m = ev.spawned[0];
  assert.ok(Math.hypot(m.x - target.x, m.z - target.z) <= METEOR.TARGET_JITTER * 2);
});

test('impact: players inside the kill radius die, shockwave knocks others down', () => {
  const players = [
    mkPlayer(1.0, 0),                       // dead (d < KILL_RADIUS)
    mkPlayer(METEOR.KILL_RADIUS + 0.5, 0),  // downed
    mkPlayer(0, METEOR.DOWN_RADIUS + 2),    // safe
    mkPlayer(0.5, 0.5, false),              // already dead — skipped
  ];
  const { killed, downed } = resolveImpact(0, 0, players);
  assert.deepEqual(killed, [players[0]]);
  assert.deepEqual(downed, [players[1]]);
});

test('impact: nobody hit on an empty strike', () => {
  const { killed, downed } = resolveImpact(0, 0, [mkPlayer(30, 20), mkPlayer(-40, -25)]);
  assert.equal(killed.length, 0);
  assert.equal(downed.length, 0);
});
