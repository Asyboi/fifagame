import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossedGoalLine, outOfBounds, classifyRestart, restartSpot,
  createReferee, tickClock, awardGoal, decideWinner,
} from '../src/game/referee.js';
import { PITCH, BALL } from '../src/config.js';

const GL = PITCH.LENGTH / 2;
const TL = PITCH.WIDTH / 2;

test('goal: crossing the +x line inside the mouth scores for home', () => {
  const prev = { x: GL - 0.2, y: BALL.R, z: 0 };
  const cur = { x: GL + 0.2, y: BALL.R, z: 1 };
  assert.equal(crossedGoalLine(prev, cur), 'home');
});

test('goal: crossing the -x line scores for away', () => {
  const prev = { x: -GL + 0.2, y: 0.5, z: -2 };
  const cur = { x: -GL - 0.2, y: 0.5, z: -2 };
  assert.equal(crossedGoalLine(prev, cur), 'away');
});

test('no goal when wide of the post or over the bar', () => {
  assert.equal(crossedGoalLine(
    { x: GL - 0.2, y: BALL.R, z: PITCH.GOAL_WIDTH / 2 + 1 },
    { x: GL + 0.2, y: BALL.R, z: PITCH.GOAL_WIDTH / 2 + 1 }), null);
  assert.equal(crossedGoalLine(
    { x: GL - 0.2, y: PITCH.GOAL_HEIGHT + 0.3, z: 0 },
    { x: GL + 0.2, y: PITCH.GOAL_HEIGHT + 0.3, z: 0 }), null);
});

test('out of bounds classification', () => {
  assert.equal(outOfBounds({ x: GL + 1, z: 20, y: 0.4 }), 'goalLine-away');
  assert.equal(outOfBounds({ x: -GL - 1, z: 0, y: 0.4 }), 'goalLine-home');
  assert.equal(outOfBounds({ x: 0, z: TL + 0.5, y: 0.4 }), 'touch-top');
  assert.equal(outOfBounds({ x: 0, z: -TL - 0.5, y: 0.4 }), 'touch-bottom');
  assert.equal(outOfBounds({ x: 0, z: 0, y: 0.4 }), null);
});

test('restart: defender touches it behind own line => corner for opponent', () => {
  // home defends -x; home touches behind home line => away corner
  assert.deepEqual(classifyRestart('goalLine-home', 'home'), { type: 'corner', forSide: 'away' });
  assert.deepEqual(classifyRestart('goalLine-away', 'away'), { type: 'corner', forSide: 'home' });
});

test('restart: attacker touches it through => goal kick to defender', () => {
  assert.deepEqual(classifyRestart('goalLine-away', 'home'), { type: 'goalkick', forSide: 'away' });
  assert.deepEqual(classifyRestart('goalLine-home', 'away'), { type: 'goalkick', forSide: 'home' });
});

test('restart: throw-in goes to the opponent of the last touch', () => {
  assert.deepEqual(classifyRestart('touch-top', 'home'), { type: 'throwin', forSide: 'away' });
  assert.deepEqual(classifyRestart('touch-bottom', 'away'), { type: 'throwin', forSide: 'home' });
});

test('restart spots are on the pitch / correct halves', () => {
  const c = restartSpot('corner', 'home', { x: 40, z: -31 });
  assert.ok(c.x > 0 && Math.abs(c.z) < TL, 'home attacks +x corner near flag');
  const g = restartSpot('goalkick', 'away');
  assert.ok(g.x > 0, 'away restarts from its own (+x) end');
  const t = restartSpot('throwin', 'home', { x: 10, z: 31 });
  assert.equal(t.z, TL);
});

test('clock runs down and reports full time once', () => {
  const ref = createReferee({ homeId: 'arg', awayId: 'esp', duration: 10 });
  assert.equal(tickClock(ref, 5), false);
  assert.equal(tickClock(ref, 5), true);
  assert.equal(tickClock(ref, 5), false, 'no double full-time');
  assert.equal(ref.clock, 0);
});

test('awardGoal tracks score and football-minute scorers', () => {
  const ref = createReferee({ homeId: 'arg', awayId: 'esp', duration: 300 });
  tickClock(ref, 150); // half gone => ~45'
  awardGoal(ref, 'home', 'D. Maradona');
  assert.equal(ref.score.home, 1);
  assert.equal(ref.scorers[0].minute, 45);
  assert.equal(ref.scorers[0].side, 'home');
});

test('decideWinner: goals decide it first', () => {
  const ref = createReferee({ homeId: 'arg', awayId: 'esp', duration: 300 });
  awardGoal(ref, 'home', 'A. One');
  assert.deepEqual(decideWinner(ref, 2, 7), { winner: 'home', decidedBy: 'goals' });
  awardGoal(ref, 'away', 'B. Two');
  awardGoal(ref, 'away', 'C. Three');
  assert.deepEqual(decideWinner(ref, 7, 1), { winner: 'away', decidedBy: 'goals' });
});

test('decideWinner: level on goals -> survivors decide it', () => {
  const ref = createReferee({ homeId: 'arg', awayId: 'esp', duration: 300 });
  awardGoal(ref, 'home', 'A. One');
  awardGoal(ref, 'away', 'B. Two');
  assert.deepEqual(decideWinner(ref, 5, 3), { winner: 'home', decidedBy: 'survivors' });
  assert.deepEqual(decideWinner(ref, 1, 4), { winner: 'away', decidedBy: 'survivors' });
});

test('decideWinner: level on goals and survivors -> draw', () => {
  const ref = createReferee({ homeId: 'arg', awayId: 'esp', duration: 300 });
  assert.deepEqual(decideWinner(ref, 7, 7), { winner: null, decidedBy: 'draw' });
  assert.deepEqual(decideWinner(ref, 4, 4), { winner: null, decidedBy: 'draw' });
});
