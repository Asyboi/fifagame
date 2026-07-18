// Match orchestrator: players, ball, AI, referee flow, camera, HUD, audio,
// market feed. One Match = one game; dispose() on exit.

import * as THREE from 'three';
import { PITCH, BALL, PLAYER, METEOR, DIFFICULTY, POSITIONS, SKIN_TONES, HAIR_COLORS, HAIR_STYLES } from '../config.js';
import { clamp, damp, lerp, rand, angleLerp, randPick } from '../utils.js';
import { createBall, stepBall, kickBall, giveBall, ballSpeed, ballSpeedXZ, predictCrossing } from './ball.js';
import { crossedGoalLine, outOfBounds, classifyRestart, restartSpot, createReferee, tickClock, awardGoal, decideWinner } from './referee.js';
import { pickPassTarget, pickSwitchTarget, formationAnchor, inShootingRange, shootAim, shotVelocity, aiShouldShoot } from './aicore.js';
import { createStorm, updateStorm, resolveImpact } from './meteors.js';
import { createMeteorFx } from './meteorfx.js';
import { buildPlayer, animateRig, disposeRig } from './rig.js';
import { buildCustomOrStandard } from '../avatar/generated.js';
import { buildStadium, buildBallMesh, spinBall } from './stadium.js';
import { createMarketFeed } from '../market.js';
import { namePool, defaultNumber } from './names.js';

const FORMATION = [
  { role: 'GK', x: -44, z: 0 },
  { role: 'DEF', x: -30, z: -9 },
  { role: 'DEF', x: -30, z: 9 },
  { role: 'MID', x: -16, z: -14 },
  { role: 'MID', x: -12, z: 0 },
  { role: 'MID', x: -16, z: 14 },
  { role: 'FWD', x: -4, z: 5 },
];

const GL = PITCH.LENGTH / 2;
const TL = PITCH.WIDTH / 2;

export function createMatch({ config, hud, audio, input, marketUrl, onExit, onPauseToggle }) {
  const { profile, homeTeam, awayTeam, duration } = config;
  const diff = DIFFICULTY[config.difficulty] || DIFFICULTY.pro;

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1026');
  scene.fog = new THREE.Fog('#0a1026', 120, 260);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
  camera.position.set(0, 42, 60);

  const hemi = new THREE.HemisphereLight('#bcd4ff', '#1c2a18', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dd', 1.6);
  sun.position.set(30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -62; sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const stadium = buildStadium();
  scene.add(stadium.group);
  const ballMesh = buildBallMesh();
  scene.add(ballMesh);

  const storm = createStorm();
  const meteorFx = createMeteorFx(scene);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 28),
    new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  // ---------- players ----------
  const players = [];
  let pid = 0;
  const mkSide = (side, team) => {
    const mirror = side === 'away' ? -1 : 1;
    const pool = namePool(team.id);
    FORMATION.forEach((slot, i) => {
      const isUserSlot = side === 'home' && i === (POSITIONS.find((p) => p.id === profile.position)?.formationIndex ?? 6);
      const p = {
        id: pid++,
        side, team, role: slot.role, slot: i,
        base: { x: slot.x * mirror, z: slot.z * mirror },
        pos: { x: slot.x * mirror, z: slot.z * mirror },
        vel: { x: 0, z: 0 },
        facing: side === 'home' ? Math.PI / 2 : -Math.PI / 2,
        attackDir: side === 'home' ? 1 : -1,
        stamina: PLAYER.STAMINA_MAX,
        user: isUserSlot, controlled: false,
        alive: true, deadT: 0,
        name: isUserSlot ? profile.name : pool[i + (side === 'away' ? 5 : 0) % pool.length],
        number: isUserSlot ? profile.number : defaultNumber(slot.role, i),
        kickT: 0, kickCd: 0, stumbleT: 0, downT: 0, slideT: 0,
        slideVel: { x: 0, z: 0 }, diveT: 0, diveDir: 0, gkHoldT: 0, reactT: 0,
        thinkT: Math.random() * 0.3, target: { x: slot.x * mirror, z: slot.z * mirror },
        wantSprint: false, badTouchT: 0,
      };
      p.rig = isUserSlot
        ? buildCustomOrStandard(THREE, {
          kit: team.kit, skin: profile.skin, hair: profile.hair, hairStyle: profile.hairStyle,
          number: p.number, name: p.name, gk: false, avatarCode: profile.avatarCode,
        })
        : buildPlayer({
          kit: team.kit,
          skin: SKIN_TONES[(p.id * 2 + 1) % SKIN_TONES.length],
          hair: HAIR_COLORS[(p.id * 3) % HAIR_COLORS.length],
          hairStyle: HAIR_STYLES[p.id % (HAIR_STYLES.length - 1)], // keep 'bald' rare
          number: p.number, name: null, gk: slot.role === 'GK',
        });

      p.rig.group.position.set(p.pos.x, 0, p.pos.z);
      scene.add(p.rig.group);
      players.push(p);
    });
  };
  mkSide('home', homeTeam);
  mkSide('away', awayTeam);

  const homePlayers = players.filter((p) => p.side === 'home');
  const awayPlayers = players.filter((p) => p.side === 'away');
  const userPlayer = players.find((p) => p.user);
  const gkOf = (side) => players.find((p) => p.side === side && p.role === 'GK' && p.alive);
  const aliveOf = (side) => (side === 'home' ? homePlayers : awayPlayers).filter((p) => p.alive);
  const aliveCount = (side) => (side === 'home' ? homePlayers : awayPlayers).reduce((n, p) => n + (p.alive ? 1 : 0), 0);

  // ---------- state ----------
  const ball = createBall();
  const ref = createReferee({ homeId: homeTeam.id, awayId: awayTeam.id, duration });
  const feed = createMarketFeed({ url: marketUrl, homeCode: homeTeam.code, awayCode: awayTeam.code, durationSec: duration });
  let phase = 'countdown';
  let phaseT = 2.4;
  let paused = false;
  let elapsed = 0;
  let possT = { home: 1e-6, away: 1e-6 };
  let controlled = null;
  let chargeT = -1;
  let switchCd = 0;
  let lastKicker = null;
  let celebrateP = null;
  let restartInfo = null;
  let restartGiver = null;
  let countShown = 4;
  let exitSent = false;
  let excitement = 0;
  let camShake = 0;
  let finalResult = null;
  const camPos = new THREE.Vector3(0, 42, 60);
  const camLook = new THREE.Vector3(0, 0, 0);
  const prevBall = { x: 0, y: BALL.R, z: 0 };
  let time = 0;

  hud.setTeams(homeTeam.code, awayTeam.code, homeTeam.kit.primary, awayTeam.kit.primary);
  hud.setScore(0, 0);
  hud.setAlive(aliveCount('home'), aliveCount('away'));
  resetKickoff('home');

  // ---------- helpers ----------
  function setControlled(p) {
    if (!p || controlled === p) return;
    if (controlled) controlled.controlled = false;
    controlled = p;
    p.controlled = true;
    const posLabel = POSITIONS.find((x) => x.formationIndex === p.slot)?.label || p.role;
    hud.setPlayer(p.name, posLabel + (p.user ? ' · YOU' : ''), p.number);
  }

  function switchPlayer() {
    if (switchCd > 0 || !controlled) return;
    switchCd = PLAYER.SWITCH_COOLDOWN;
    const pick = pickSwitchTarget(aliveOf('home'), ball.pos, controlled.id);
    if (pick) setControlled(pick);
  }

  function matesOf(p) { return (p.side === 'home' ? homePlayers : awayPlayers).filter((q) => q.alive); }
  function oppsOf(p) { return (p.side === 'home' ? awayPlayers : homePlayers).filter((q) => q.alive); }

  // ---------- meteors ----------
  function killPlayer(p) {
    if (!p.alive) return;
    p.alive = false;
    p.deadT = 1.6; // body lies on the pitch briefly, then disappears
    p.vel.x = 0; p.vel.z = 0;
    if (ball.owner === p) kickBall(ball, rand(-3, 3), 5, rand(-3, 3), p.side, p.id);
    hud.toast(`☄ ${p.name} was crushed by a meteor!`, 1800);
    if (controlled === p) {
      const next = pickSwitchTarget(aliveOf('home'), ball.pos, p.id);
      if (next) setControlled(next);
    }
  }

  function applyImpact(m) {
    meteorFx.impact(m);
    audio.boom();
    camShake = Math.min(1.4, camShake + 0.9);
    const { killed, downed } = resolveImpact(m.x, m.z, players);
    for (const p of downed) p.downT = Math.max(p.downT, 1.1);
    for (const p of killed) killPlayer(p);
    // blast a loose ball out of the crater
    if (!ball.owner) {
      const dx = ball.pos.x - m.x; const dz = ball.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3 && d < METEOR.DOWN_RADIUS + 1) {
        const sp = METEOR.BALL_BLAST / Math.max(1, d);
        kickBall(ball, (dx / d) * sp, 6, (dz / d) * sp, ball.lastTouch || 'home');
      }
    }
    hud.setAlive(aliveCount('home'), aliveCount('away'));
    if (phase === 'play' && (aliveCount('home') === 0 || aliveCount('away') === 0)) endMatch('annihilation');
  }

  function meteorStep(dt) {
    // half the strikes land near a random player; the rest hit open pitch
    const targetPos = () => {
      if (Math.random() > METEOR.TARGET_PLAYER_CHANCE) return null;
      const alive = players.filter((p) => p.alive);
      if (!alive.length) return null;
      const p = alive[(Math.random() * alive.length) | 0];
      return { x: p.pos.x, z: p.pos.z };
    };
    const ev = updateStorm(storm, elapsed, dt, targetPos);
    if (ev.started) {
      hud.toast('☄ METEOR STORM ☄', 3000);
      audio.groan();
    }
    for (const m of ev.spawned) { meteorFx.spawn(m); audio.whoosh(); }
    for (const m of ev.impacted) applyImpact(m);
  }

  function executePass(p, dx, dz, error = 0) {
    const pick = pickPassTarget(matesOf(p), oppsOf(p), p, dx, dz);
    if (!pick) return false;
    const t = pick.p;
    const dist = Math.hypot(t.pos.x - ball.pos.x, t.pos.z - ball.pos.z);
    const speed = pick.lob ? PLAYER.PASS_LOB_SPEED : clamp(dist * 1.25, 11, PLAYER.PASS_SPEED + dist * 0.12);
    const tof = dist / speed;
    let ax = t.pos.x + t.vel.x * tof * 0.6 - ball.pos.x;
    let az = t.pos.z + t.vel.z * tof * 0.6 - ball.pos.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    if (error > 0) {
      const a = Math.atan2(ax, az) + (Math.random() - 0.5) * error * 2;
      ax = Math.sin(a); az = Math.cos(a);
    }
    const vy = pick.lob ? clamp(BALL.GRAVITY * tof * 0.42, 2.5, 8.5) : 0;
    kickBall(ball, ax * speed, vy, az * speed, p.side, p.id);
    p.kickT = 0.25;
    audio.kick(pick.lob ? 0.55 : 0.4);
    t.target = { x: t.pos.x + ax * dist * 0.4, z: t.pos.z + az * dist * 0.4 };
    t.thinkT = Math.max(t.thinkT, 0.15);
    if (p.side === 'home' && p.controlled) setControlled(t);
    return true;
  }

  function executeShoot(p, charge, biasZ) {
    const gk = gkOf(p.side === 'home' ? 'away' : 'home');
    const aim = shootAim(p.attackDir, biasZ, charge, gk ? gk.pos.z : 0);
    const dist = Math.hypot(aim.x - ball.pos.x, aim.z - ball.pos.z);
    const speed = clamp(PLAYER.SHOOT_MIN + charge * (PLAYER.SHOOT_MAX - PLAYER.SHOOT_MIN) + dist * 0.12, PLAYER.SHOOT_MIN, 32);
    const v = shotVelocity(ball.pos, aim, speed, BALL.GRAVITY);
    kickBall(ball, v.vx, v.vy, v.vz, p.side, p.id);
    ball.shotT = 0;
    p.kickT = 0.3;
    audio.kick(0.65 + charge * 0.35);
    lastKicker = p;
    const pc = predictCrossing(ball, aim.x);
    const onTarget = Boolean(pc) && Math.abs(pc.z) < PITCH.GOAL_WIDTH / 2 && pc.y < PITCH.GOAL_HEIGHT;
    feed.shot(p.side, onTarget, elapsed);
  }

  function tryTackle(p) {
    if (p.kickCd > 0 || p.downT > 0) return;
    p.kickCd = 0.7;
    p.kickT = 0.22;
    const carrier = ball.owner;
    if (!carrier || carrier.side === p.side) return;
    const d = Math.hypot(carrier.pos.x - p.pos.x, carrier.pos.z - p.pos.z);
    if (d > 1.9) return;
    const fx = Math.sin(p.facing); const fz = Math.cos(p.facing);
    const dot = ((carrier.pos.x - p.pos.x) * fx + (carrier.pos.z - p.pos.z) * fz) / (d || 1);
    if (d > 0.9 && dot < 0) return; // must roughly face him unless on top
    const chance = p.controlled ? 0.78 : diff.tackleWin;
    if (Math.random() < chance) {
      kickBall(ball, carrier.vel.x * 0.25 + fx * 4, 1.5, carrier.vel.z * 0.25 + fz * 4, p.side, carrier.id);
      carrier.stumbleT = 0.55;
      audio.thud();
    } else {
      p.stumbleT = 0.35;
    }
  }

  function slideTackle(p) {
    if (p.slideT > 0 || p.downT > 0 || p.role === 'GK') return;
    p.slideT = 0.45;
    const fx = Math.sin(p.facing); const fz = Math.cos(p.facing);
    p.slideVel.x = fx * 13; p.slideVel.z = fz * 13;
    audio.thud();
  }

  // ---------- referee flow ----------
  function resetKickoff(kickSide) {
    for (const p of players) {
      if (!p.alive) continue; // the dead stay dead
      p.pos.x = p.base.x; p.pos.z = p.base.z;
      p.vel.x = 0; p.vel.z = 0;
      p.stumbleT = p.downT = p.slideT = p.diveT = 0;
      p.facing = p.side === 'home' ? Math.PI / 2 : -Math.PI / 2;
    }
    ball.pos.x = 0; ball.pos.z = 0; ball.pos.y = BALL.R;
    ball.vel.x = 0; ball.vel.y = 0; ball.vel.z = 0;
    const kicker = players.find((p) => p.side === kickSide && p.role === 'FWD' && p.alive)
      || players.find((p) => p.side === kickSide && p.alive);
    if (!kicker) return; // side wiped out — annihilation already ended the match
    giveBall(ball, kicker, kickSide);
    lastKicker = null;
    const homePick = (userPlayer.alive ? userPlayer : null) || aliveOf('home')[0];
    if (!homePick) return;
    if (kickSide === 'home') setControlled(kicker.user ? kicker : homePick);
    else setControlled(homePick);
  }

  function onGoal(scoringSide) {
    const scorer = lastKicker && lastKicker.side === scoringSide ? lastKicker : null;
    const name = scorer ? scorer.name : 'Own goal';
    awardGoal(ref, scoringSide, name);
    hud.setScore(ref.score.home, ref.score.away);
    celebrateP = scorer;
    phase = 'goal';
    phaseT = 3.4;
    excitement = 1;
    const minute = ref.scorers[ref.scorers.length - 1].minute;
    hud.overlay(`<div class="big-call">GOAL<small>${name} · ${minute}'</small></div>`, 3000);
    audio.cheer(1);
    audio.whistle(1);
    feed.goal(scoringSide, elapsed);
    chargeT = -1;
    hud.power(null);
  }

  function onOut(kind) {
    const r = classifyRestart(kind, ball.lastTouch);
    const spot = restartSpot(r.type, r.forSide, ball.pos);
    phase = 'restart';
    phaseT = 1.1;
    restartInfo = r;
    ball.pos.x = spot.x; ball.pos.z = spot.z; ball.pos.y = BALL.R;
    ball.vel.x = 0; ball.vel.y = 0; ball.vel.z = 0;
    ball.owner = null;
    // nearest available player of the restarting side goes to the ball
    const mates = aliveOf(r.forSide);
    let best = null; let bd = Infinity;
    for (const p of mates) {
      if (r.type !== 'goalkick' && p.role === 'GK') continue;
      if (r.type === 'goalkick' && p.role !== 'GK') continue;
      const d = (p.pos.x - spot.x) ** 2 + (p.pos.z - spot.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { // nobody left to take it — play on with a loose ball
      restartInfo = null;
      phase = 'play';
      return;
    }
    restartGiver = best;
    const inset = r.type === 'throwin' ? Math.sign(spot.z) * 0.9 : 0;
    best.pos.x = spot.x; best.pos.z = spot.z - inset;
    best.vel.x = 0; best.vel.z = 0;
    best.facing = Math.atan2(-best.pos.x * 0.2, -Math.sign(spot.z) || 1);
    audio.whistle(1);
    hud.toast(r.type === 'throwin' ? 'THROW-IN' : r.type === 'corner' ? 'CORNER KICK' : 'GOAL KICK');
  }

  function finishRestart() {
    const r = restartInfo;
    if (!r) { phase = 'play'; return; }
    if (!restartGiver || !restartGiver.alive) {
      // the taker was crushed while lining it up — loose ball, play on
      restartInfo = null;
      restartGiver = null;
      phase = 'play';
      return;
    }
    if (r.type === 'corner') {
      const atk = r.forSide === 'home' ? 1 : -1;
      giveBall(ball, restartGiver, r.forSide);
      const tx = atk * (GL - 9); const tz = rand(-5, 5);
      const dx = tx - ball.pos.x; const dz = tz - ball.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const tof = d / 13;
      kickBall(ball, (dx / d) * 13, clamp(BALL.GRAVITY * tof * 0.45, 3, 9), (dz / d) * 13, r.forSide, restartGiver.id);
      restartGiver.kickT = 0.3;
      audio.kick(0.7);
    } else if (r.type === 'goalkick') {
      giveBall(ball, restartGiver, r.forSide);
      restartGiver.gkHoldT = 0.6;
    } else {
      giveBall(ball, restartGiver, r.forSide);
      if (r.forSide === 'home') setControlled(restartGiver.role === 'GK' ? userPlayer : restartGiver);
      else executePass(restartGiver, restartGiver.attackDir, 0, diff.passError);
    }
    restartInfo = null;
    phase = 'play';
  }

  function endMatch(reason = 'goals') {
    phase = 'full';
    phaseT = 2.2;
    storm.meteors.length = 0;
    meteorFx.clear();
    const homeAlive = aliveCount('home');
    const awayAlive = aliveCount('away');
    let winner; let decidedBy;
    if (reason === 'annihilation') {
      winner = homeAlive > 0 && awayAlive === 0 ? 'home'
        : awayAlive > 0 && homeAlive === 0 ? 'away' : null;
      decidedBy = 'annihilation';
    } else {
      ({ winner, decidedBy } = decideWinner(ref, homeAlive, awayAlive));
    }
    finalResult = {
      homeScore: ref.score.home, awayScore: ref.score.away, scorers: ref.scorers,
      homeAlive, awayAlive, winner, decidedBy,
    };
    audio.whistle(3);
    audio.cheer(0.6);
    const line = `${homeTeam.code} ${ref.score.home} – ${ref.score.away} ${awayTeam.code}`;
    hud.overlay(reason === 'annihilation'
      ? `<div class="big-call">ANNIHILATION!<small>${line}</small></div>`
      : `<div class="big-call">FULL TIME<small>${line}</small></div>`, 2100);
    feed.final(ref.score.home, ref.score.away);
  }

  // ---------- AI ----------
  function aiThink(p) {
    const mates = matesOf(p); const opps = oppsOf(p);
    const myBall = ball.owner && ball.owner.side === p.side;
    const carrier = ball.owner;

    if (p.role === 'GK') return; // GK runs its own continuous logic

    if (carrier === p) {
      // --- I have the ball ---
      const gk = gkOf(p.side === 'home' ? 'away' : 'home');
      const gkDist = gk ? Math.hypot(gk.pos.x - p.pos.x, gk.pos.z - p.pos.z) : 99;
      if (aiShouldShoot(p, p.attackDir, gkDist, diff) && Math.random() < 0.55) {
        executeShoot(p, rand(0.35, 1.0), rand(-0.4, 0.4) + diff.shootErr * rand(-1, 1));
        return;
      }
      const nearestOpp = opps.reduce((m, o) => Math.min(m, Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z)), 99);
      if (nearestOpp < 2.8 || Math.random() < 0.3) {
        if (executePass(p, p.attackDir, rand(-0.4, 0.4), diff.passError)) return;
      }
      p.target = {
        x: clamp(p.pos.x + p.attackDir * 8, -GL + 2, GL - 2),
        z: clamp(p.pos.z * 0.9 + rand(-3, 3), -TL + 2, TL - 2),
      };
      p.wantSprint = nearestOpp > 3 && p.stamina > 20;
      return;
    }

    if (myBall) {
      // --- teammate has it: hold shape / make a run ---
      const a = formationAnchor(p.base, p.role, ball.pos.x, ball.pos.z, p.attackDir, true);
      if ((p.role === 'FWD' || (p.role === 'MID' && p.slot === 4)) && Math.random() < 0.5) {
        p.target = {
          x: clamp(ball.pos.x + p.attackDir * 13, -GL + 2, GL - 2),
          z: clamp(p.base.z + rand(-4, 4), -TL + 2, TL - 2),
        };
        p.wantSprint = p.stamina > 30;
      } else {
        p.target = a;
        p.wantSprint = false;
      }
      return;
    }

    // --- we don't have it ---
    const pressD = p.side === 'home' ? diff.pressRadius : diff.pressRadius;
    const distBall = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
    // the two nearest defenders press
    const sorted = opps.length ? [...mates].filter((q) => q.role !== 'GK')
      .sort((a, b) => ((a.pos.x - ball.pos.x) ** 2 + (a.pos.z - ball.pos.z) ** 2) - ((b.pos.x - ball.pos.x) ** 2 + (b.pos.z - ball.pos.z) ** 2)) : [];
    const presserRank = sorted.indexOf(p);
    if (presserRank >= 0 && presserRank < 2 && distBall < pressD + 8) {
      p.target = { x: ball.pos.x + ball.vel.x * 0.15, z: ball.pos.z + ball.vel.z * 0.15 };
      p.wantSprint = true;
      // AI tackle when close to a human carrier
      if (carrier && carrier.side !== p.side && distBall < 1.7 && p.kickCd <= 0) tryTackle(p);
    } else {
      const a = formationAnchor(p.base, p.role, ball.pos.x, ball.pos.z, p.attackDir, false);
      p.target = a;
      p.wantSprint = false;
    }
  }

  function gkLogic(p, dt) {
    const ownX = -p.attackDir * GL;
    const holder = ball.owner;
    if (holder === p) {
      p.gkHoldT -= dt;
      if (p.gkHoldT <= 0) {
        const mates = matesOf(p).filter((q) => q.role === 'DEF' || q.role === 'MID');
        const far = mates.sort((a, b) => (b.pos.x * p.attackDir) - (a.pos.x * p.attackDir))[0];
        if (far) {
          const dx = far.pos.x - p.pos.x; const dz = far.pos.z - p.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const tof = d / 16;
          kickBall(ball, (dx / d) * 16, clamp(BALL.GRAVITY * tof * 0.45, 3, 9), (dz / d) * 16, p.side, p.id);
          p.kickT = 0.3;
          audio.kick(0.75);
        }
      }
      return;
    }

    // shot incoming?
    const shotAtMe = ball.shotT < 1.6 && !holder && ball.vel.x * p.attackDir < -3;
    if (shotAtMe && p.diveT <= 0) {
      const pc = predictCrossing(ball, ownX);
      if (pc && pc.t < 1.15 && Math.abs(pc.z) < PITCH.GOAL_WIDTH / 2 + 1.2 && pc.y < PITCH.GOAL_HEIGHT + 0.6) {
        p.reactT += dt;
        if (p.reactT > diff.gkReact) {
          p.diveT = 0.55;
          p.diveDir = Math.abs(pc.z - p.pos.z) < 0.7 ? 0 : Math.sign(pc.z - p.pos.z);
          p.reactT = 0;
        }
      }
    } else {
      p.reactT = 0;
    }

    if (p.diveT > 0) {
      p.diveT -= dt;
      p.vel.z = (p.diveDir || 0) * 9;
      p.vel.x = 0;
    } else {
      // positioning: hold the line, track ball z; rush a loose ball in the box
      const inBox = Math.abs(ball.pos.x - ownX) < PITCH.BOX_DEPTH && Math.abs(ball.pos.z) < PITCH.BOX_WIDTH / 2;
      const loose = !holder && ballSpeedXZ(ball) < 7;
      if (inBox && loose) {
        p.target = { x: ball.pos.x, z: ball.pos.z };
        p.wantSprint = true;
        steer(p, dt, diff.aiSpeed);
      } else {
        p.target = {
          x: ownX + p.attackDir * (1.1 + Math.min(2, Math.abs(ball.pos.z) * 0.06)),
          z: clamp(ball.pos.z * 0.45, -PITCH.GOAL_WIDTH / 2 + 0.6, PITCH.GOAL_WIDTH / 2 - 0.6),
        };
        p.wantSprint = false;
        steer(p, dt, diff.aiSpeed);
      }
    }

    // save attempt
    if (!holder) {
      const d = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
      const reach = (p.diveT > 0 ? 1.8 : 1.2) * diff.gkSave;
      if (d < reach && ball.pos.y < 2.1 && ball.lockId !== p.id) {
        const sp = ballSpeed(ball);
        if (sp < 13) {
          giveBall(ball, p, p.side);
          p.gkHoldT = 0.9;
          audio.thud();
        } else if (sp < 30) {
          ball.vel.x = -ball.vel.x * 0.35;
          ball.vel.z = (Math.random() < 0.5 ? -1 : 1) * rand(4, 9);
          ball.vel.y = Math.max(ball.vel.y * 0.3, 3.5);
          ball.shotT = 99;
          ball.lockId = p.id; ball.lockT = 0.4;
          audio.thud();
          audio.groan();
        }
      }
    }
  }

  // ---------- movement ----------
  function steer(p, dt, speedScale = 1) {
    if (p.downT > 0 || p.slideT > 0 || p.stumbleT > 0) return;
    const hasBall = ball.owner === p;
    const max = (p.wantSprint && p.stamina > 0 ? PLAYER.SPRINT_SPEED : PLAYER.MAX_SPEED)
      * speedScale * (hasBall ? 0.92 : 1);
    const dx = p.target.x - p.pos.x; const dz = p.target.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const slow = clamp(d / 2.5, 0, 1);
    const wx = d > 0.05 ? (dx / d) * max * slow : 0;
    const wz = d > 0.05 ? (dz / d) * max * slow : 0;
    const acc = PLAYER.ACCEL * dt;
    p.vel.x += clamp(wx - p.vel.x, -acc, acc);
    p.vel.z += clamp(wz - p.vel.z, -acc, acc);
  }

  function integrate(p, dt) {
    // timers
    p.kickT = Math.max(0, p.kickT - dt);
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.stumbleT = Math.max(0, p.stumbleT - dt);
    p.badTouchT = Math.max(0, p.badTouchT - dt);
    if (p.downT > 0) { p.downT -= dt; p.vel.x *= 0.9; p.vel.z *= 0.9; }
    if (p.slideT > 0) {
      p.slideT -= dt;
      p.vel.x = p.slideVel.x * (p.slideT / 0.45);
      p.vel.z = p.slideVel.z * (p.slideT / 0.45);
      if (p.slideT <= 0) p.downT = 0.55;
      // slide contact wins the ball
      const carrier = ball.owner;
      if (carrier && carrier.side !== p.side) {
        const d = Math.hypot(carrier.pos.x - p.pos.x, carrier.pos.z - p.pos.z);
        if (d < 1.1) {
          kickBall(ball, p.slideVel.x * 0.4, 2, p.slideVel.z * 0.4, p.side, carrier.id);
          carrier.downT = 0.8;
          audio.thud();
        }
      }
    }
    if (p.stumbleT > 0) { p.vel.x *= 0.86; p.vel.z *= 0.86; }

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    const xLim = p.role === 'GK' ? GL + 0.4 : GL - 0.4;
    p.pos.x = clamp(p.pos.x, -xLim, xLim);
    p.pos.z = clamp(p.pos.z, -TL + 0.4, TL - 0.4);

    // stamina
    const sprinting = p.wantSprint && Math.hypot(p.vel.x, p.vel.z) > PLAYER.MAX_SPEED * 0.8;
    p.stamina = clamp(p.stamina + (sprinting ? -PLAYER.STAMINA_DRAIN : PLAYER.STAMINA_REGEN) * dt, 0, PLAYER.STAMINA_MAX);

    // facing
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0.6) p.facing = angleLerp(p.facing, Math.atan2(p.vel.x, p.vel.z), Math.min(1, dt * 10));
    else if (!ball.owner) p.facing = angleLerp(p.facing, Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z), Math.min(1, dt * 4));
  }

  function separate() {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i]; const b = players[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.pos.x - a.pos.x; const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.72 * 0.72 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (0.72 - d) / 2 / d;
        a.pos.x -= dx * push; a.pos.z -= dz * push;
        b.pos.x += dx * push; b.pos.z += dz * push;
      }
    }
  }

  // ---------- possession ----------
  function tryTrap(dt) {
    if (ball.owner) return;
    let best = null; let bd = Infinity;
    for (const p of players) {
      if (!p.alive || p.downT > 0 || p.slideT > 0 || p.stumbleT > 0) continue;
      if (ball.lockId === p.id) continue;
      const isAI = !p.controlled;
      if (isAI && p.role !== 'GK' && ball.freeT < diff.reaction * 0.8) continue;
      const reach = p.role === 'GK' ? BALL.CONTROL_RADIUS * 1.15 : BALL.CONTROL_RADIUS;
      const d = (p.pos.x - ball.pos.x) ** 2 + (p.pos.z - ball.pos.z) ** 2;
      if (d < reach * reach && ball.pos.y < 1.6 && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const sp = ballSpeed(ball);
    const trapMax = best.role === 'GK' ? 13 : 10;
    if (sp > trapMax) return; // too hot — let it run
    giveBall(ball, best, best.side);
    if (best.role === 'GK') best.gkHoldT = 0.8;
    if (best.side === 'home' && !best.controlled && best.role !== 'GK' && phase === 'play') setControlled(best);
  }

  function moveOwnedBall(dt) {
    const o = ball.owner;
    if (!o) return;
    const sp = Math.hypot(o.vel.x, o.vel.z);
    const d = sp > PLAYER.MAX_SPEED * 0.95 ? 0.95 : 0.55;
    const fx = Math.sin(o.facing); const fz = Math.cos(o.facing);
    const gx = o.pos.x + fx * d; const gz = o.pos.z + fz * d;
    const k = Math.min(1, BALL.OWNER_GLUE * dt * 12);
    ball.pos.x += (gx - ball.pos.x) * k;
    ball.pos.z += (gz - ball.pos.z) * k;
    ball.pos.y = BALL.R;
    ball.vel.x = o.vel.x; ball.vel.z = o.vel.z; ball.vel.y = 0;
  }

  // ---------- per-frame ----------
  function playStep(dt) {
    elapsed += dt;
    time += dt;
    switchCd = Math.max(0, switchCd - dt);

    const snap = input.poll();

    if (snap.pause) { setPaused(true); return; }
    if (snap.mute) { audio.toggleMuted(); hud.toast(audio.muted ? 'SOUND OFF' : 'SOUND ON'); }
    if (snap.switchPl) switchPlayer();

    // --- controlled player ---
    const c = controlled;
    if (c && c.alive && c.downT <= 0 && c.slideT <= 0) {
      c.target = { x: c.pos.x + snap.mx * 3, z: c.pos.z + snap.mz * 3 };
      c.wantSprint = snap.sprint;
      steer(c, dt, 1);
      const hasBall = ball.owner === c;
      if (hasBall) {
        if (snap.pass) executePass(c, snap.mx, snap.mz, 0.03);
        if (snap.shootDown) chargeT = 0;
        if (chargeT >= 0) {
          chargeT = Math.min(1, chargeT + dt / 0.85);
          hud.power(chargeT);
          if (snap.shootUp || chargeT >= 1) {
            executeShoot(c, chargeT, snap.mz);
            chargeT = -1;
            hud.power(null);
          }
        }
      } else {
        if (chargeT >= 0) { chargeT = -1; hud.power(null); }
        if (snap.pass) tryTackle(c);
        if (snap.shootDown) slideTackle(c);
      }
    }

    // --- AI ---
    for (const p of players) {
      if (!p.alive || p.controlled) continue;
      if (p.role === 'GK') { gkLogic(p, dt); continue; }
      p.thinkT -= dt;
      if (p.thinkT <= 0) {
        aiThink(p);
        p.thinkT = diff.reaction * rand(0.8, 1.4);
      }
      steer(p, dt, diff.aiSpeed * (p.side === 'away' ? 1 : 0.96));
    }

    // --- integrate + separate ---
    for (const p of players) if (p.alive) integrate(p, dt);
    separate();

    // --- ball ---
    prevBall.x = ball.pos.x; prevBall.y = ball.pos.y; prevBall.z = ball.pos.z;
    if (ball.owner) {
      moveOwnedBall(dt);
    } else {
      const r = stepBall(ball, dt);
      if (r.hitPost) audio.post();
      tryTrap(dt);
    }

    // --- boundary events ---
    const scorer = crossedGoalLine(prevBall, ball.pos);
    if (scorer) {
      onGoal(scorer);
      return;
    }
    const out = outOfBounds(ball.pos);
    if (out) { onOut(out); return; }

    // --- clock / stats ---
    if (tickClock(ref, dt)) { endMatch(); return; }
    possT[ball.owner ? ball.owner.side : ball.lastTouch || 'home'] += dt;

    // --- meteor storm (from the 1-minute mark on) ---
    meteorStep(dt);
    if (phase !== 'play') return; // the storm may have ended the match

    // --- presentation ---
    feed.update(elapsed, possT.home / (possT.home + possT.away));
    const nearGoal = Math.max(0, 1 - Math.min(Math.abs(GL - Math.abs(ball.pos.x)) / 26, 1));
    excitement = damp(excitement, clamp(nearGoal + (ball.shotT < 1.5 ? 0.45 : 0), 0, 1), 2, dt);
  }

  function updateCamera(dt) {
    let px; let py; let pz; let lx; let ly; let lz;
    if (phase === 'goal' && celebrateP) {
      px = celebrateP.pos.x * 0.55; py = 5.2; pz = celebrateP.pos.z + Math.sign(celebrateP.pos.z || 1) * 9 + 4;
      lx = celebrateP.pos.x; ly = 1.4; lz = celebrateP.pos.z;
    } else if (phase === 'countdown') {
      const t = 1 - Math.max(0, phaseT) / 2.4;
      px = lerp(-30, ball.pos.x * 0.58, t); py = lerp(46, 20, t); pz = lerp(62, 29, t);
      lx = 0; ly = 1.4; lz = 0;
    } else {
      px = clamp(ball.pos.x * 0.58, -30, 30);
      py = 20; pz = 29;
      lx = clamp(ball.pos.x + clamp(ball.vel.x * 0.45, -6, 6), -GL, GL);
      ly = 1.4; lz = clamp(ball.pos.z * 0.32, -9, 9);
    }
    const k = phase === 'goal' ? 2.2 : 3.2;
    camPos.x = damp(camPos.x, px, k, dt);
    camPos.y = damp(camPos.y, py, k, dt);
    camPos.z = damp(camPos.z, pz, k, dt);
    camLook.x = damp(camLook.x, lx, 4.5, dt);
    camLook.y = damp(camLook.y, ly, 4.5, dt);
    camLook.z = damp(camLook.z, lz, 4.5, dt);
    if (camShake > 0) { // meteor impacts rattle the broadcast camera
      camShake = Math.max(0, camShake - dt * 1.8);
      camPos.x += (Math.random() - 0.5) * camShake * 1.6;
      camPos.y += (Math.random() - 0.5) * camShake * 1.2;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  function updateVisuals(dt) {
    ballMesh.position.set(ball.pos.x, ball.pos.y, ball.pos.z);
    if (!ball.owner) spinBall(ballMesh, ball.vel, dt);
    ring.position.x = controlled.pos.x;
    ring.position.z = controlled.pos.z;
    const pulse = 1 + Math.sin(time * 6) * 0.06;
    ring.scale.set(pulse, pulse, 1);
    for (const p of players) {
      if (!p.alive) { // corpse: lies flat for a moment, then gone
        if (p.deadT > 0) {
          p.deadT -= dt;
          if (p.deadT <= 0) p.rig.group.visible = false;
          p.rig.group.position.x = p.pos.x;
          p.rig.group.position.z = p.pos.z;
          animateRig(p.rig, dt, {
            speed01: 0, kick: 0, celebrate: 0, dive: 0, down: 1, idleBreath: 0,
          });
        }
        continue;
      }
      p.rig.group.position.x = p.pos.x;
      p.rig.group.position.z = p.pos.z;
      p.rig.group.rotation.y = p.facing;
      animateRig(p.rig, dt, {
        speed01: clamp(Math.hypot(p.vel.x, p.vel.z) / PLAYER.SPRINT_SPEED, 0, 1),
        kick: p.kickT > 0 ? 1 - p.kickT / 0.3 : 0,
        celebrate: phase === 'goal' && p === celebrateP ? 1 : 0,
        dive: p.diveT > 0 ? (p.diveDir || 1) : 0,
        down: p.downT > 0 || p.slideT > 0 ? 1 : 0,
        idleBreath: time,
      });
    }
  }

  function setPaused(v) {
    if (paused === v) return;
    paused = v;
    onPauseToggle?.(v);
  }

  // ---------- public ----------
  return {
    scene, camera,
    get paused() { return paused; },
    setPaused,
    get ref() { return ref; },
    get feed() { return feed; },
    // debug/test affordances (used by the headless verification harness)
    ball, players,
    get phase() { return phase; },
    get controlled() { return controlled; },

    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    update(dt) {
      if (paused) return;
      time += dt * 0.0001; // keep shader-less anims deterministic-ish
      switch (phase) {
        case 'countdown': {
          phaseT -= dt;
          const n = Math.ceil(phaseT / 0.7);
          if (n !== countShown && n > 0) { countShown = n; hud.countdown(String(n)); audio.count(false); }
          if (phaseT <= 0) {
            hud.countdown(null);
            hud.toast('KICK OFF');
            audio.count(true);
            audio.whistle(1);
            phase = 'play';
          }
          break;
        }
        case 'play':
          playStep(dt);
          break;
        case 'goal':
          phaseT -= dt;
          if (phaseT <= 0) {
            hud.overlay(null);
            const concede = ref.scorers[ref.scorers.length - 1].side === 'home' ? 'away' : 'home';
            resetKickoff(concede);
            hud.toast('KICK OFF');
            phase = 'restart';
            phaseT = 0.9;
          }
          break;
        case 'restart':
          phaseT -= dt;
          if (phaseT <= 0) finishRestart();
          break;
        case 'full':
          phaseT -= dt;
          if (phaseT <= 0 && !exitSent) {
            exitSent = true;
            onExit(finalResult);
          }
          break;
        default: break;
      }
      updateCamera(dt);
      updateVisuals(dt);
      meteorFx.update(storm, dt);
      stadium.update(dt, excitement);
      audio.setExcitement(excitement);
      hud.setClock(ref.clock, duration);
      hud.setStamina(controlled.stamina / PLAYER.STAMINA_MAX);
    },

    render(renderer) { renderer.render(scene, camera); },

    dispose() {
      scene.traverse((o) => {
        if (o.geometry && !o.geometry._shared) o.geometry.dispose?.();
        if (o.material && !o.userData?.keepMat) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose?.();
        }
      });
      for (const p of players) disposeRig(p.rig);
    },
  };
}
