// ── Match orchestrator: teams, states, rules, control, camera ───
import * as THREE from 'three';
import { PITCH, MATCH, FORMATION, generateName, makeRng, hashString } from '../config.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { buildStadium } from './stadium.js';
import { CameraRig } from './cameraRig.js';
import { ReplayRecorder } from './replay.js';
import {
  updateOutfieldAI, updateGoalkeeperAI, findPassTarget, executePass, executeShot,
} from './ai.js';
import {
  checkGoal, checkOut, matchClock, isHalfOver, createScore, addGoal,
} from './rules.js';

const HALF_L = PITCH.length / 2;
const tmp = new THREE.Vector3();

function makeMarkerSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeText(text, 128, 38);
  ctx.fillText(text, 128, 38);
  // triangle
  ctx.beginPath();
  ctx.moveTo(112, 56);
  ctx.lineTo(144, 56);
  ctx.lineTo(128, 84);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.6, 1, 1);
  return sprite;
}

export class Match {
  /**
   * opts: { userProfile, homeTeamDef, awayTeamDef, difficulty, audio, events }
   * events: { onState, onGoal, onClock, onScore, onCommentary }
   */
  constructor(scene, camera, opts) {
    this.scene = scene;
    this.opts = opts;
    this.audio = opts.audio;
    this.events = opts.events ?? {};
    this.difficulty = opts.difficulty ?? 'normal';

    this.stadium = buildStadium(scene);
    this.ball = new Ball(scene);
    this.cameraRig = new CameraRig(camera);

    this.homeTeam = this._buildTeam(opts.homeTeamDef, 'home', 1, opts.userProfile);
    this.awayTeam = this._buildTeam(opts.awayTeamDef, 'away', -1, null);
    this.allPlayers = [...this.homeTeam.players, ...this.awayTeam.players];
    for (const p of this.allPlayers) p.difficulty = this.difficulty;

    this.userPlayer = this.homeTeam.players.find((p) => p.isUser) ?? null;
    this.controlled = this.userPlayer;

    this.score = createScore();
    this.half = 1;
    this.elapsed = 0;
    this.state = 'intro';
    this.stateTime = 0;
    this.crowdTime = 0;
    this.excitement = 0;
    this.replay = new ReplayRecorder(this.allPlayers, this.ball);
    this._pendingKickoff = 'home';

    // markers
    this.controlMarker = makeMarkerSprite('', '#ffe600');
    scene.add(this.controlMarker);
    if (this.userPlayer) {
      this.userMarker = makeMarkerSprite(this.userPlayer.name.toUpperCase(), '#41ead4');
      scene.add(this.userMarker);
    }

    this.cameraRig.setMode('intro');
  }

  _buildTeam(def, side, attackDir, userProfile) {
    const rng = makeRng(hashString(def.id));
    const team = { def, side, attackDir, players: [], name: def.name, short: def.short, kit: def.kit, gk: def.gk };
    const userRole = userProfile?.position;
    let userSlotUsed = false;
    FORMATION.forEach((slot, i) => {
      const home = this._slotToWorld(slot, attackDir);
      const isUserSlot = !userSlotUsed && userProfile && slot.role === userRole;
      if (isUserSlot) userSlotUsed = true;
      const p = new Player(this.scene, {
        name: isUserSlot ? userProfile.name : generateName(rng),
        number: isUserSlot ? userProfile.number : (slot.role === 'GK' ? 1 : i + 2),
        role: slot.role,
        teamSide: side,
        team,
        isUser: isUserSlot,
        homeSpot: home,
        skinTone: isUserSlot ? userProfile.skinTone : ['#f6d3b3', '#eab98c', '#c98a5b', '#9c6644', '#6f4e37'][(rng() * 5) | 0],
        hairStyle: isUserSlot ? userProfile.hairStyle : ['short', 'buzz', 'afro', 'long', 'bald'][(rng() * 5) | 0],
        hairColor: isUserSlot ? userProfile.hairColor : ['#161311', '#3b2a20', '#7b5334'][(rng() * 3) | 0],
        faceTexture: isUserSlot ? userProfile.faceTexture : null,
      });
      team.players.push(p);
    });
    // if user's chosen role wasn't in the XI (shouldn't happen), make ST the user — guard anyway
    if (userProfile && !userSlotUsed) {
      const st = team.players.find((p) => p.role === 'ST');
      st.isUser = true;
      st.name = userProfile.name;
    }
    return team;
  }

  _slotToWorld(slot, attackDir) {
    // slot.x: 0 own goal .. ~0.75 forward, in own-half-biased coordinates
    const x = attackDir * (-HALF_L + slot.x * PITCH.length);
    const z = slot.z * (PITCH.width / 2) * 0.92;
    return { x, z };
  }

  // ── state machine ─────────────────────────────────────────────
  setState(s) {
    this.state = s;
    this.stateTime = 0;
    this.events.onState?.(s, this);
  }

  startKickoff(kickingSide) {
    this._pendingKickoff = kickingSide;
    for (const p of this.allPlayers) p.resetToHome();
    this.ball.place(0, 0.11, 0);
    // kicking team's striker takes the kickoff spot
    const team = kickingSide === 'home' ? this.homeTeam : this.awayTeam;
    const st = team.players.find((p) => p.role === 'ST');
    st.pos.set(-team.attackDir * 0.8, 0, 0.4);
    const cm = team.players.find((p) => p.role === 'CM');
    cm.pos.set(-team.attackDir * 2.2, 0, -1.6);
    this.replay.clear();
    this.controlled = this.userPlayer;
    this.setState('kickoff');
    this.audio?.whistle();
  }

  beginMatch() {
    this.cameraRig.setMode('broadcast');
    this.startKickoff('home');
  }

  pause() {
    if (this.state === 'play' || this.state === 'kickoff') {
      this._resumeState = this.state;
      this.setState('paused');
    }
  }

  resume() {
    if (this.state === 'paused') this.setState(this._resumeState ?? 'play');
  }

  // ── main update ───────────────────────────────────────────────
  update(dt, inputSnapshot) {
    this.stateTime += dt;
    this.crowdTime += dt;
    this.excitement = Math.max(0, this.excitement - dt * 0.4);
    if (this.excitement > 0.15 || this.state === 'goal') {
      this.stadium.exciteCrowd(this.crowdTime, Math.max(this.excitement, this.state === 'goal' ? 1 : 0));
    }

    switch (this.state) {
      case 'intro':
        this.cameraRig.update(dt, this.ball, null);
        return;
      case 'paused':
        return;
      case 'kickoff': {
        for (const p of this.allPlayers) p.update(dt, this.ball);
        this._updateMarkers();
        if (this.stateTime > 1.2) {
          this.setState('play');
          // kicking team plays a first pass
          const team = this._pendingKickoff === 'home' ? this.homeTeam : this.awayTeam;
          const st = team.players.find((p) => p.role === 'ST');
          this.ball.owner = st;
          this.ball.touch(st);
        }
        this.cameraRig.update(dt, this.ball, null);
        return;
      }
      case 'goal': {
        this._updateCelebration(dt);
        this.cameraRig.update(dt, this.ball, this._scorer);
        if (this.stateTime > 2.8) {
          if (this.replay.start()) {
            this.setState('replay');
            this.cameraRig.setMode('replay');
          } else {
            this._afterGoal();
          }
        }
        return;
      }
      case 'replay': {
        if (!this.replay.step(dt)) this._afterGoal();
        this.cameraRig.update(dt, this.ball, null);
        return;
      }
      case 'halftime':
      case 'fulltime':
        this.cameraRig.update(dt, this.ball, null);
        return;
    }

    // ── state === 'play' ──
    this.elapsed += dt;
    this.events.onClock?.(matchClock(this.elapsed, this.half), this.half);

    this._updateControl(dt, inputSnapshot);
    this._updateAI(dt);
    this._updatePhysics(dt);
    this._updateRules();
    this._updateMarkers();
    this.replay.record(dt);
    this.cameraRig.update(dt, this.ball, this.controlled);

    if (isHalfOver(this.elapsed)) {
      if (this.half === 1) {
        this.half = 2;
        this.elapsed = 0;
        this._swapSides();
        this.audio?.whistle(true);
        this.setState('halftime');
      } else {
        this.audio?.whistle(true);
        this.setState('fulltime');
        this.events.onScore?.(this.score);
      }
    }
  }

  resumeSecondHalf() {
    this.startKickoff('away');
  }

  _swapSides() {
    for (const team of [this.homeTeam, this.awayTeam]) {
      team.attackDir *= -1;
      for (const p of team.players) {
        p.homeSpot.x *= -1;
        p.homeSpot.z *= -1;
      }
    }
  }

  // ── user control ──────────────────────────────────────────────
  _updateControl(dt, snap) {
    if (!snap || !this.controlled) return;
    const p = this.controlled;
    const teammates = this.homeTeam.players;
    const opponents = this.awayTeam.players;

    for (const ev of snap.events) {
      switch (ev.type) {
        case 'switch': {
          this._switchPlayer();
          break;
        }
        case 'pass': {
          if (this.ball.owner === p) {
            const dir = snap.move.x || snap.move.z ? tmp.set(snap.move.x, 0, snap.move.z).clone() : null;
            const mate = findPassTarget(p, teammates, opponents, dir);
            if (mate) {
              executePass(p, mate, this.ball);
              this.audio?.kick(0.5);
              this._autoSwitchTo = mate;
            }
          }
          break;
        }
        case 'through': {
          if (this.ball.owner === p) {
            const dir = snap.move.x || snap.move.z ? tmp.set(snap.move.x, 0, snap.move.z).clone() : null;
            const mate = findPassTarget(p, teammates, opponents, dir, true);
            if (mate) {
              executePass(p, mate, this.ball, true);
              this.audio?.kick(0.7);
              this._autoSwitchTo = mate;
            }
          }
          break;
        }
        case 'shootRelease': {
          if (this.ball.owner === p) {
            executeShot(p, this.ball, Math.max(0.35, ev.power), this.audio);
            this.excitement = Math.max(this.excitement, 0.5);
          }
          break;
        }
        case 'tackle': {
          if (this.ball.owner !== p) {
            p.startTackle();
            this.audio?.kick(0.3);
          }
          break;
        }
        case 'skill': {
          if (this.ball.owner === p) {
            // knock-on: push ball forward and sprint after it
            const f = p.forward();
            p.kickBall(this.ball, f, 11, 0.05, 'pass');
            p.controlCooldown = 0.25;
          }
          break;
        }
      }
    }

    // movement
    const move = tmp.set(snap.move.x, 0, snap.move.z);
    const speed = snap.sprint ? p.sprintMax : p.maxSpeed;
    if (!p.busy) p.steer(move, move.lengthSq() > 0.001 ? speed : 0);

    // auto-switch to pass receiver once ball is en route
    if (this._autoSwitchTo && !this.ball.owner) {
      if (this.ball.pos.distanceTo(this._autoSwitchTo.pos) < 6) {
        if (!this._autoSwitchTo.isGK) this.controlled = this._autoSwitchTo;
        this._autoSwitchTo = null;
      }
    }
  }

  _switchPlayer() {
    const candidates = this.homeTeam.players.filter((p) => !p.isGK);
    let best = null;
    let bestD = Infinity;
    for (const p of candidates) {
      if (p === this.controlled) continue;
      const d = p.pos.distanceTo(this.ball.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) this.controlled = best;
    this.audio?.click();
  }

  // ── AI ────────────────────────────────────────────────────────
  _possessionSide() {
    if (this.ball.owner) return this.ball.owner.teamSide;
    return this.ball.lastTouchTeam ?? 'home';
  }

  _updateAI(dt) {
    const possession = this._possessionSide();
    for (const team of [this.homeTeam, this.awayTeam]) {
      const opponents = team === this.homeTeam ? this.awayTeam.players : this.homeTeam.players;
      const ctx = {
        ball: this.ball,
        teammates: team.players,
        opponents,
        possession,
        match: this,
        audio: this.audio,
        dt,
      };
      for (const p of team.players) {
        if (p === this.controlled) continue; // user drives this one
        if (p.isGK) updateGoalkeeperAI(p, ctx, dt);
        else updateOutfieldAI(p, ctx, dt);
      }
    }
  }

  // ── physics & possession ──────────────────────────────────────
  _updatePhysics(dt) {
    for (const p of this.allPlayers) p.update(dt, this.ball);
    this.ball.update(dt);

    // player separation (cheap O(n²) on 22 players is fine)
    for (let i = 0; i < this.allPlayers.length; i++) {
      for (let j = i + 1; j < this.allPlayers.length; j++) {
        const a = this.allPlayers[i];
        const b = this.allPlayers[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.6 * 0.6 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.6 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }

    // ball pickup / interception
    if (!this.ball.owner) {
      for (const p of this.allPlayers) {
        if (!p.canControl(this.ball)) continue;
        if (this.ball.speed > 17 && !p.isGK) {
          // too hot to control: deflect
          this.ball.vel.multiplyScalar(0.5);
          this.ball.touch(p);
          continue;
        }
        this.ball.owner = p;
        this.ball.touch(p);
        if (p.teamSide === 'home' && !p.isGK && p !== this.controlled) {
          // auto-switch control to receiver on user's team
          this.controlled = p;
        }
        break;
      }
    }

    // tackles knock the ball loose
    for (const p of this.allPlayers) {
      if (p.state !== 'tackle') continue;
      const carrier = this.ball.owner;
      if (carrier && carrier.teamSide !== p.teamSide && p.pos.distanceTo(this.ball.pos) < 1.3) {
        this.ball.owner = null;
        this.ball.touch(p);
        const f = p.forward();
        this.ball.vel.set(f.x * 7, 2, f.z * 7);
        carrier.stunned = 0.5;
        this.audio?.kick(0.4);
      }
    }
  }

  // ── rules ─────────────────────────────────────────────────────
  _updateRules() {
    const goal = checkGoal(this.ball.pos);
    if (goal) {
      this.score = addGoal(this.score, goal);
      this.events.onScore?.(this.score);
      this._scorer = this.ball.lastTouch && this.ball.lastTouch.teamSide === goal
        ? this.ball.lastTouch
        : null;
      this._concededBy = goal === 'home' ? 'away' : 'home';
      this._scorer?.celebrate();
      this.events.onGoal?.(goal, this._scorer, this);
      this.audio?.goal();
      this.excitement = 1;
      this.cameraRig.setMode('goal');
      this.setState('goal');
      return;
    }

    const out = checkOut(this.ball.pos, this.ball.lastTouchTeam ?? 'home');
    if (out) {
      this.ball.place(out.restart.x, out.restart.y, out.restart.z);
      // nearest player of awarded side takes it
      const team = out.side === 'home' ? this.homeTeam : this.awayTeam;
      let taker = null;
      let bd = Infinity;
      for (const p of team.players) {
        if (p.isGK && out.type !== 'goalKick') continue;
        const d = p.pos.distanceTo(this.ball.pos);
        if (d < bd) {
          bd = d;
          taker = p;
        }
      }
      if (taker) {
        taker.pos.set(out.restart.x - team.attackDir * 0.6, 0, out.restart.z);
        this.ball.owner = taker;
        this.ball.touch(taker);
        for (const p of this.allPlayers) {
          if (p !== taker) p.controlCooldown = Math.max(p.controlCooldown, 0.8);
        }
        if (taker.teamSide === 'home' && !taker.isGK) this.controlled = taker;
      }
      this.events.onCommentary?.(
        out.type === 'throwIn' ? 'Throw-in' : out.type === 'corner' ? 'Corner' : 'Goal kick'
      );
    }
  }

  _updateCelebration(dt) {
    for (const p of this.allPlayers) p.animate(dt);
  }

  _afterGoal() {
    this.cameraRig.setMode('broadcast');
    this.startKickoff(this._concededBy ?? 'home');
  }

  // ── markers ───────────────────────────────────────────────────
  _updateMarkers() {
    if (this.controlled) {
      this.controlMarker.visible = true;
      this.controlMarker.position.set(this.controlled.pos.x, 2.5, this.controlled.pos.z);
    } else {
      this.controlMarker.visible = false;
    }
    if (this.userMarker && this.userPlayer) {
      const showBoth = this.controlled !== this.userPlayer;
      this.userMarker.visible = showBoth;
      this.userMarker.position.set(this.userPlayer.pos.x, 2.6, this.userPlayer.pos.z);
    }
  }
}
