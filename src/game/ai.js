// ── Match AI: outfield brains, pass selection, goalkeeping ──────
import * as THREE from 'three';
import { PITCH, MATCH } from '../config.js';
import { clamp } from './rules.js';

const HALF_L = PITCH.length / 2;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** World-space spot this player should occupy given ball position. */
export function formationSpot(player, ball, hasPossession) {
  const dir = player.team.attackDir; // +1 attacks +x
  const push = hasPossession ? 10 * dir : -6 * dir;
  let x = player.homeSpot.x + ball.pos.x * 0.42 + push;
  let z = player.homeSpot.z + ball.pos.z * 0.28;
  x = clamp(x, -HALF_L + 2, HALF_L - 2);
  z = clamp(z, -PITCH.width / 2 + 2, PITCH.width / 2 - 2);
  return { x, z };
}

/** Score how good a pass to `mate` is. Higher = better. */
function passScore(from, mate, opponents, preferDir) {
  const d = tmpA.set(mate.pos.x - from.pos.x, 0, mate.pos.z - from.pos.z);
  const dist = d.length();
  if (dist < 2 || dist > 42) return -Infinity;
  let score = 30 - Math.abs(dist - 14) * 0.8;
  // openness: penalize opponents near passing lane / receiver
  const dirN = d.clone().normalize();
  for (const opp of opponents) {
    const toOpp = tmpB.set(opp.pos.x - from.pos.x, 0, opp.pos.z - from.pos.z);
    const proj = toOpp.dot(dirN);
    if (proj > 0 && proj < dist) {
      const lateral = Math.sqrt(Math.max(0, toOpp.lengthSq() - proj * proj));
      if (lateral < 2.2) score -= (2.2 - lateral) * 14;
    }
    const nearRecv = opp.pos.distanceTo(mate.pos);
    if (nearRecv < 5) score -= (5 - nearRecv) * 3;
  }
  // prefer forward progress
  score += (mate.pos.x - from.pos.x) * from.team.attackDir * 0.9;
  // prefer requested direction (user aim)
  if (preferDir && preferDir.lengthSq() > 0.01) {
    score += dirN.dot(preferDir) * 18;
  }
  return score;
}

/** Best teammate to pass to. preferDir optional (user's stick direction). */
export function findPassTarget(player, teammates, opponents, preferDir = null, through = false) {
  let best = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate === player) continue;
    let score = passScore(player, mate, opponents, preferDir);
    if (through) {
      // through balls favour forward runners
      score += (mate.pos.x - player.pos.x) * player.team.attackDir * 1.6;
      if (mate.isGK) score -= 100;
    }
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return best;
}

/** Execute a pass from player to mate (lead the runner if through). */
export function executePass(player, mate, ball, through = false) {
  const lead = through ? 6.5 : 1.2;
  const target = tmpA.set(
    mate.pos.x + mate.vel.x * 0.35 + player.team.attackDir * (through ? lead : 0),
    0,
    mate.pos.z + mate.vel.z * 0.35
  );
  const dir = target.sub(player.pos);
  const dist = dir.length();
  const speed = clamp(
    (through ? MATCH.throughPassSpeed : MATCH.passSpeed) * (0.55 + dist / 30),
    10, 30
  );
  player.kickBall(ball, dir, speed, dist > 24 ? 0.28 : 0.06, 'pass');
}

export function executeShot(player, ball, power = 0.7, audio = null) {
  const goalX = player.team.attackDir * HALF_L;
  const dist = Math.abs(goalX - player.pos.x);
  // aim inside a post with small error, low driven or slightly lofted
  const aimZ = (Math.random() - 0.5) * (PITCH.goalWidth - 1.2);
  const err = (1 - power) * 2.2 + dist * 0.03;
  const dir = tmpA.set(goalX - player.pos.x, 0, aimZ - player.pos.z + (Math.random() - 0.5) * err);
  const speed = MATCH.shotSpeedMin + (MATCH.shotSpeedMax - MATCH.shotSpeedMin) * power;
  player.kickBall(ball, dir, speed, 0.1 + power * 0.14, 'shoot');
  audio?.kick(1);
}

// ── outfield AI ──────────────────────────────────────────────────
export function updateOutfieldAI(player, ctx, dt) {
  const { ball, teammates, opponents, possession, match } = ctx;
  const myTeamHasBall = possession === player.teamSide;
  const iHaveBall = ball.owner === player;
  const speed = player.maxSpeed;

  if (iHaveBall) {
    aiWithBall(player, ctx);
    return;
  }

  // loose ball: closest 1-2 players chase
  if (!ball.owner) {
    const chasers = [...teammates].sort(
      (a, b) => a.pos.distanceTo(ball.pos) - b.pos.distanceTo(ball.pos)
    );
    const rank = chasers.indexOf(player);
    if (rank >= 0 && rank < 2 && !player.busy) {
      // intercept point: lead the rolling ball a bit
      tmpA.copy(ball.pos).addScaledVector(ball.vel, 0.25);
      player.seek(tmpA, player.sprintMax);
      return;
    }
  }

  if (myTeamHasBall) {
    // support: go to formation spot, strikers make runs beyond the ball
    const spot = formationSpot(player, ball, true);
    if (['ST', 'LW', 'RW'].includes(player.role) && ball.owner && ball.owner !== player) {
      const beyond = ball.pos.x * player.team.attackDir > spot.x * player.team.attackDir;
      if (beyond) spot.x = ball.pos.x + player.team.attackDir * 8;
    }
    player.seek(tmpA.set(spot.x, 0, spot.z), speed * 0.9);
  } else {
    // defending
    const dToBall = player.pos.distanceTo(ball.pos);
    const pressers = [...teammates]
      .filter((p) => !p.isGK)
      .sort((a, b) => a.pos.distanceTo(ball.pos) - b.pos.distanceTo(ball.pos));
    const isPresser = pressers.indexOf(player) < (match.difficulty === 'hard' ? 3 : 2);
    if (isPresser) {
      // press the ball / carrier, tackle when close
      player.seek(ball.pos, player.sprintMax);
      const carrier = ball.owner;
      if (carrier && carrier.teamSide !== player.teamSide && dToBall < 1.6 && player.tackleCooldown <= 0) {
        if (Math.random() < (match.difficulty === 'easy' ? 0.25 : 0.55)) {
          player.startTackle();
        }
      }
    } else {
      // hold defensive shape between ball and own goal
      const spot = formationSpot(player, ball, false);
      player.seek(tmpA.set(spot.x, 0, spot.z), speed * 0.85);
    }
  }
}

function aiWithBall(player, ctx) {
  const { ball, teammates, opponents, match, audio } = ctx;
  const goalX = player.team.attackDir * HALF_L;
  const distToGoal = tmpA.set(goalX - player.pos.x, 0, -player.pos.z).length();
  const pressure = Math.min(...opponents.map((o) => o.pos.distanceTo(player.pos)));
  const diff = match.difficulty;
  const shootRange = diff === 'hard' ? 26 : diff === 'normal' ? 22 : 18;

  // decide roughly every 0.25s to avoid jitter
  player._decisionT = (player._decisionT ?? 0) - ctx.dt;
  if (player._decisionT > 0) {
    // keep dribbling toward goal, slight weave
    const weave = Math.sin(performance.now() / 400 + player.id) * 6;
    player.seek(tmpA.set(goalX, 0, player.pos.z * 0.4 + weave), player.maxSpeed);
    return;
  }
  player._decisionT = 0.25;

  if (distToGoal < shootRange && Math.random() < (diff === 'easy' ? 0.35 : 0.65)) {
    executeShot(player, ball, 0.6 + Math.random() * 0.35, audio);
    return;
  }
  const shouldPass =
    pressure < 3.2 || (Math.random() < 0.12 && distToGoal > 30);
  if (shouldPass) {
    const through = Math.random() < 0.25;
    const mate = findPassTarget(player, teammates, opponents, null, through);
    if (mate) {
      executePass(player, mate, ball, through);
      audio?.kick(0.5);
      return;
    }
  }
  // dribble on
  const weave = Math.sin(performance.now() / 400 + player.id) * 6;
  player.seek(tmpA.set(goalX, 0, player.pos.z * 0.4 + weave), player.maxSpeed);
}

// ── goalkeeper AI ────────────────────────────────────────────────
export function updateGoalkeeperAI(gk, ctx, dt) {
  const { ball, teammates, opponents, audio } = ctx;
  const dir = gk.team.attackDir;          // we defend -dir goal
  const goalX = -dir * HALF_L;
  const boxEdge = goalX + dir * PITCH.boxLength;

  if (ball.owner === gk) {
    // distribute after a short hold
    gk._holdT = (gk._holdT ?? 0) + dt;
    if (gk._holdT > 1.0) {
      gk._holdT = 0;
      const mate = findPassTarget(gk, teammates, opponents) ??
        teammates.find((p) => p !== gk);
      if (mate) executePass(gk, mate, ball);
      else gk.kickBall(ball, tmpA.set(dir, 0, 0), 26, 0.5, 'pass');
      audio?.kick(0.6);
    }
    return;
  }
  gk._holdT = 0;

  const ballInBox =
    Math.abs(ball.pos.z) < PITCH.boxWidth / 2 &&
    (ball.pos.x - goalX) * dir >= 0 &&
    Math.abs(ball.pos.x - goalX) < PITCH.boxLength;

  // shot incoming? ball fast and heading at our goal
  const headingIn =
    ball.speed > 12 &&
    Math.sign(ball.vel.x) === Math.sign(goalX - ball.pos.x) &&
    Math.abs(ball.pos.x - goalX) < 26;
  if (headingIn && !gk.busy) {
    // predicted z at goal line
    const t = Math.abs((goalX - ball.pos.x) / (ball.vel.x || 0.01));
    const zAtLine = ball.pos.z + ball.vel.z * t;
    if (Math.abs(zAtLine) < PITCH.goalWidth / 2 + 1.5 && t < 0.85) {
      const relZ = zAtLine - gk.pos.z;
      if (Math.abs(relZ) > 0.9) gk.dive(relZ);
      return;
    }
    // shuffle across
    gk.seek(tmpA.set(gk.pos.x, 0, clamp(zAtLine, -3.4, 3.4)), gk.sprintMax);
    return;
  }

  // loose slow ball in our box: collect it
  if (ballInBox && !ball.owner && ball.speed < 9 && !gk.busy) {
    gk.seek(ball.pos, gk.sprintMax);
    return;
  }

  // positioning: on a small arc between ball and goal centre
  const toBall = tmpA.set(ball.pos.x - goalX, 0, ball.pos.z).normalize();
  const depth = clamp(Math.abs(ball.pos.x - goalX) * 0.06, 0.8, 4.5);
  const px = goalX + toBall.x * depth;
  const pz = clamp(toBall.z * depth * 2.2, -3.2, 3.2);
  gk.seek(tmpB.set(clamp(px, Math.min(goalX, boxEdge), Math.max(goalX, boxEdge)), 0, pz), gk.maxSpeed * 0.9);
}
