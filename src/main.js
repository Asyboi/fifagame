// ── FABLE CUP bootstrap: onboarding → lineup → match → results ──
import * as THREE from 'three';
import { Match } from './game/match.js';
import { Input } from './game/input.js';
import { MatchAudio } from './game/audio.js';
import { Onboarding } from './ui/onboarding.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { MarketHub } from './market/market.js';
import { MarketPanel } from './ui/marketPanel.js';
import { MATCH } from './config.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 500);
const input = new Input();
const audio = new MatchAudio();
const hud = new Hud(uiRoot);
const screens = new Screens(uiRoot);
const marketHub = new MarketHub();
const marketPanel = new MarketPanel(uiRoot, marketHub);

function setMarketVisible(visible) {
  marketPanel.chip.style.display = visible ? 'flex' : 'none';
  if (!visible) marketPanel.toggle(false);
}

let scene = null;
let match = null;
let matchConfig = null;

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function startOnboarding() {
  hud.hide();
  marketHub.voidOpenMarkets('Match abandoned');
  setMarketVisible(false);
  disposeMatch();
  new Onboarding(uiRoot, (config) => {
    matchConfig = config;
    audio.init(); // user gesture just happened
    startMatch();
  });
}

function disposeMatch() {
  if (scene) {
    scene.traverse((o) => {
      o.geometry?.dispose?.();
    });
  }
  scene = null;
  match = null;
}

function startMatch() {
  disposeMatch();
  scene = new THREE.Scene();
  match = new Match(scene, camera, {
    userProfile: matchConfig.profile,
    homeTeamDef: matchConfig.homeTeamDef,
    awayTeamDef: matchConfig.awayTeamDef,
    difficulty: matchConfig.difficulty,
    audio,
    events: {
      onGoal: (side, scorer, m) => {
        screens.goalBanner(scorer, side, m);
        marketHub.onGoal(side, !!scorer?.isUser);
        marketHub.onTotalGoals(m.score.home + m.score.away);
      },
      onScore: (score) => hud.setScore(score),
      onClock: (text, half) => hud.setClock(text, half),
      onCommentary: (text) => hud.toast(text),
      onState: (state) => {
        if (state === 'halftime') screens.halftime(match, () => match.resumeSecondHalf());
        if (state === 'fulltime') {
          hud.hide();
          marketHub.onFullTime(match.score);
          screens.results(match, startMatch, startOnboarding);
        }
      },
    },
  });
  hud.setTeams(match.homeTeam, match.awayTeam);
  hud.setScore(match.score);
  hud.setClock('00:00', 1);

  marketHub.startMatch({
    homeName: match.homeTeam.name,
    homeShort: match.homeTeam.short,
    awayName: match.awayTeam.name,
    awayShort: match.awayTeam.short,
    userName: matchConfig.profile.name,
    userRole: matchConfig.profile.position,
    difficulty: matchConfig.difficulty,
  });
  setMarketVisible(true);

  screens.lineup(match, () => {
    hud.show();
    match.beginMatch();
    hud.toast('Kick-off!', 1500);
  });
}

// ── main loop ───────────────────────────────────────────────────
const clock = new THREE.Clock();
let marketTickAcc = 0;

function tickMarket(dt) {
  if (!match || match.state !== 'play') return;
  marketTickAcc += dt;
  if (marketTickAcc < 1) return;
  marketTickAcc = 0;
  const tFrac =
    ((match.half - 1) + Math.min(match.elapsed / MATCH.halfLengthSeconds, 1)) / 2;
  marketHub.tick({
    scoreHome: match.score.home,
    scoreAway: match.score.away,
    tFrac,
    ballTilt: (match.ball.pos.x * match.homeTeam.attackDir) / 52.5,
    possession: match._possessionSide(),
  });
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const snap = input.poll(dt);

  if (match) {
    for (const ev of snap.events) {
      if (ev.type === 'pause') {
        if (match.state === 'paused') {
          screens.dismiss();
          match.resume();
        } else if (match.state === 'play' || match.state === 'kickoff') {
          match.pause();
          screens.pauseMenu(
            () => match.resume(),
            () => startMatch(),
            () => startOnboarding()
          );
        }
      }
    }
    match.update(dt, snap);
    tickMarket(dt);
    hud.setPower(snap.shootCharge);
    hud.setPadConnected(input.gamepadConnected);
    if (match.state === 'play' || match.state === 'kickoff') hud.drawRadar(match);
  }
  if (scene) renderer.render(scene, camera);
}
frame();

startOnboarding();

// Debug/testing hook (used by the automated smoke test).
window.__fable = {
  get match() { return match; },
  get market() { return marketHub; },
};
