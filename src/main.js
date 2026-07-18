// World Stars Cup — entry point.
// Owns the renderer, the screen flow, and the match lifecycle.

import './style.css';
import * as THREE from 'three';
import { createAudio } from './game/audio.js';
import { createInput } from './game/input.js';
import { createHud } from './game/hud.js';
import { createMatch } from './game/match.js';
import { buildStadium, buildBallMesh } from './game/stadium.js';
import { teamById } from './teams.js';
import * as screens from './ui/screens.js';

const MARKET_URL = import.meta.env?.VITE_MARKET_URL;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// ---------- menu backdrop scene (slow stadium orbit behind the screens) ----------
const menuScene = new THREE.Scene();
menuScene.background = new THREE.Color('#070b18');
menuScene.fog = new THREE.Fog('#070b18', 120, 280);
const menuCam = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
menuScene.add(new THREE.HemisphereLight('#bcd4ff', '#1c2a18', 0.8));
const menuSun = new THREE.DirectionalLight('#fff2dd', 1.3);
menuSun.position.set(30, 60, 25);
menuScene.add(menuSun);
const menuStadium = buildStadium();
menuScene.add(menuStadium.group);
const menuBall = buildBallMesh();
menuBall.position.set(0, 0.34, 0);
menuScene.add(menuBall);

// ---------- app state ----------
const audio = createAudio();
const input = createInput(window);
const hud = createHud(document.getElementById('hud'));

const app = {
  ui: document.getElementById('ui'),
  audio,
  profile: {
    name: 'YOU', number: 9, position: 'FWD',
    skin: '#d9a06b', hair: '#2e2118', hairStyle: 'short',
  },
  sampled: null,
  homeTeamId: 'arg',
  awayTeamId: 'esp',
  settings: { duration: 300, difficulty: 'pro' },
  startMatch,
};

let match = null;
let clockT = 0;

function clearUi() { app.ui.innerHTML = ''; }

function startMatch() {
  const config = {
    profile: app.profile,
    homeTeam: app.homeTeamId,
    awayTeam: app.awayTeamId,
    duration: app.settings.duration,
    difficulty: app.settings.difficulty,
  };
  screens.showIntro(app, () => {
    clearUi();
    hud.show();
    audio.ensure();
    audio.startBed();
    beginMatch(config);
  });
}

function beginMatch(config) {
  match = createMatch({
    config: {
      profile: config.profile,
      homeTeam: teamById(config.homeTeam),
      awayTeam: teamById(config.awayTeam),
      duration: config.duration,
      difficulty: config.difficulty,
    },
    hud, audio, input,
    marketUrl: MARKET_URL,
    onExit: (result) => {
      hud.hide();
      audio.stopBed();
      destroyMatch();
      screens.showResult(app, result, {
        onRematch: () => { clearUi(); hud.show(); audio.startBed(); beginMatch(config); },
        onChangeTeams: () => { screens.showTeamSelect(app, 'home'); },
        onTitle: () => { screens.showTitle(app); },
      });
    },
    onPauseToggle: (isPaused) => {
      if (isPaused) {
        screens.showPause(app, {
          onResume: () => { clearUi(); match?.setPaused(false); },
          onRestart: () => { clearUi(); destroyMatch(); hud.show(); beginMatch(config); },
          onQuit: () => { clearUi(); destroyMatch(); hud.hide(); audio.stopBed(); screens.showTitle(app); },
        });
      } else {
        clearUi();
      }
    },
  });
  match.resize(window.innerWidth, window.innerHeight);
}

function destroyMatch() {
  if (!match) return;
  match.dispose();
  match = null;
}

// pause/resume input while the pause menu owns the screen
function pollWhilePaused() {
  const snap = input.poll();
  if (snap.pause) { clearUi(); match?.setPaused(false); }
  if (snap.mute) audio.toggleMuted();
}

// ---------- boot ----------
screens.showTitle(app);

// debug/testing hook (drives the headless verification harness)
window.__wsc = { app, hud, get match() { return match; } };

document.addEventListener('visibilitychange', () => {
  if (document.hidden && match && !match.paused) match.setPaused(true);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  menuCam.aspect = window.innerWidth / window.innerHeight;
  menuCam.updateProjectionMatrix();
  match?.resize(window.innerWidth, window.innerHeight);
});

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clockT += dt;

  if (match) {
    if (match.paused) pollWhilePaused();
    else match.update(dt); // update() may end the match (full time -> onExit)
    match?.render(renderer);
  } else {
    const a = clockT * 0.08;
    menuCam.position.set(Math.sin(a) * 74, 26 + Math.sin(clockT * 0.2) * 4, Math.cos(a) * 74);
    menuCam.lookAt(0, 1, 0);
    menuStadium.update(dt, 0.15);
    renderer.render(menuScene, menuCam);
  }
}
requestAnimationFrame(frame);
