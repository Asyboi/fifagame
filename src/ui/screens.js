// Onboarding + menu screens (DOM overlays on #ui).
// Flow: Title → Photo upload (or skip) → Customize avatar → Your team →
// Opponent → Match settings → Match. Plus pause + result screens.

import * as THREE from 'three';
import { TEAMS, teamById } from '../teams.js';
import {
  POSITIONS, SKIN_TONES, HAIR_COLORS, HAIR_STYLES,
  MATCH_LENGTHS, DIFFICULTY, CONTROLS_KEYBOARD_HTML, CONTROLS_GAMEPAD_HTML,
} from '../config.js';
import { fileToImageData, samplePortrait } from '../avatar/sampler.js';
import { buildPlayer } from '../game/rig.js';

const WSC_KIT = { pattern: 'solid', primary: '#12324a', secondary: '#12324a', trim: '#22d3ee', shorts: '#0b1226', number: '#22d3ee' };

function dots(step) {
  return `<div class="step-dots">${[1, 2, 3, 4].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
}

function shirtStyle(kit) {
  if (kit.pattern === 'stripes') {
    return `background: repeating-linear-gradient(90deg, ${kit.primary} 0 8px, ${kit.secondary} 8px 16px);`;
  }
  return `background: ${kit.primary}; box-shadow: inset 0 -8px 0 rgba(0,0,0,0.22), inset 0 6px 0 ${kit.trim};`;
}

// ---------- 3D avatar preview ----------
function createAvatarPreview(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    container.innerHTML = '<div style="display:grid;place-items:center;height:100%;font-size:80px">★</div>';
    return { update() {}, dispose() {} };
  }
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 50);
  cam.position.set(0, 1.35, 3.1);
  cam.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight('#cfe0ff', '#223018', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);

  let rig = null;
  let raf = 0;
  let t = 0;
  const loop = () => {
    t += 0.016;
    if (rig) rig.group.rotation.y = Math.sin(t * 0.7) * 0.55;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    update(profile) {
      if (rig) scene.remove(rig.group);
      rig = buildPlayer({
        kit: WSC_KIT, skin: profile.skin, hair: profile.hair,
        hairStyle: profile.hairStyle, number: profile.number, name: profile.name,
      });
      scene.add(rig.group);
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ---------- screens ----------

export function showTitle(app) {
  app.ui.innerHTML = `
    <div class="screen">
      <div class="wsc-logo">
        <div class="starball"></div>
        <h1>World Stars Cup</h1>
        <div class="tag">Be the star</div>
      </div>
      <div class="btn-row">
        <button class="btn" id="create">Create your star</button>
        <button class="btn ghost" id="quick">Quick match</button>
      </div>
      <div class="panel" style="max-width:560px;text-align:center;font-size:14px;line-height:2">${CONTROLS_KEYBOARD_HTML}<br/>${CONTROLS_GAMEPAD_HTML}</div>
    </div>`;
  app.ui.querySelector('#create').onclick = () => { app.audio.ensure(); app.audio.ui(); showUpload(app); };
  app.ui.querySelector('#quick').onclick = () => { app.audio.ensure(); app.audio.ui(); showTeamSelect(app, 'home'); };
}

export function showUpload(app) {
  app.ui.innerHTML = `
    <div class="screen">
      ${dots(1)}
      <h2>Upload your <em>photo</em></h2>
      <div class="sub">A clear, front-facing portrait works best</div>
      <div class="dropzone" id="dz">
        <div class="big">📷</div>
        <p>Drop a photo here or <u>browse</u> — we'll detect your skin tone &amp; hair color</p>
        <input type="file" id="file" accept="image/*" hidden />
      </div>
      <div class="privacy">🔒 Your photo never leaves this browser. Everything runs locally.</div>
      <div class="btn-row">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn ghost" id="skip">Skip — pick a look</button>
        <button class="btn" id="use" disabled>Use this photo</button>
      </div>
    </div>`;
  const dz = app.ui.querySelector('#dz');
  const file = app.ui.querySelector('#file');
  const use = app.ui.querySelector('#use');
  let sampled = null;

  dz.onclick = () => file.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); read(e.dataTransfer.files[0]); };
  file.onchange = () => read(file.files[0]);

  async function read(f) {
    if (!f || !f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    dz.innerHTML = `<img class="preview" src="${url}" alt="your photo" /><p>Looking good?</p>`;
    const img = await fileToImageData(f);
    sampled = img ? samplePortrait(img) : null;
    use.disabled = false;
    app.audio.ui();
  }

  app.ui.querySelector('#back').onclick = () => { app.audio.ui(); showTitle(app); };
  app.ui.querySelector('#skip').onclick = () => { app.audio.ui(); app.sampled = null; showCustomize(app); };
  use.onclick = () => {
    app.audio.ui();
    app.sampled = sampled;
    if (sampled) {
      if (sampled.skinOk) app.profile.skin = sampled.skin;
      if (sampled.hairOk) app.profile.hair = sampled.hair;
    }
    showCustomize(app);
  };
}

export function showCustomize(app) {
  const p = app.profile;
  const detected = app.sampled
    ? (app.sampled.skinOk || app.sampled.hairOk
      ? `✨ Detected from your photo: ${[app.sampled.skinOk && 'skin tone', app.sampled.hairOk && 'hair color'].filter(Boolean).join(' + ')}`
      : "Couldn't auto-detect colors from that photo — pick your look below!")
    : '';

  app.ui.innerHTML = `
    <div class="screen">
      ${dots(2)}
      <h2>Make it <em>you</em></h2>
      <div class="customize-wrap">
        <div id="avatar-preview"></div>
        <div class="panel form-grid">
          <label>Name</label><input type="text" id="name" maxlength="12" value="${p.name}" />
          <label>Number</label><input type="number" id="number" min="1" max="99" value="${p.number}" />
          <label>Position</label>
          <div class="chips" id="pos">${POSITIONS.map((x) => `<button class="chip ${x.id === p.position ? 'on' : ''}" data-v="${x.id}">${x.label}</button>`).join('')}</div>
          <label>Hair style</label>
          <div class="chips" id="hairstyle">${HAIR_STYLES.map((s) => `<button class="chip ${s === p.hairStyle ? 'on' : ''}" data-v="${s}">${s}</button>`).join('')}</div>
          <label>Hair color</label>
          <div class="swatches" id="hair">${HAIR_COLORS.map((c) => `<div class="swatch ${c === p.hair ? 'on' : ''}" data-v="${c}" style="background:${c}"></div>`).join('')}</div>
          <label>Skin tone</label>
          <div class="swatches" id="skin">${SKIN_TONES.map((c) => `<div class="swatch ${c.toLowerCase() === String(p.skin).toLowerCase() ? 'on' : ''}" data-v="${c}" style="background:${c}"></div>`).join('')}</div>
          ${detected ? `<div></div><div class="detected-note">${detected}</div>` : ''}
        </div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn" id="next">Continue</button>
      </div>
    </div>`;

  const preview = createAvatarPreview(app.ui.querySelector('#avatar-preview'));
  preview.update(p);
  const cleanup = () => preview.dispose();

  app.ui.querySelector('#name').oninput = (e) => { p.name = e.target.value || 'YOU'; preview.update(p); };
  app.ui.querySelector('#number').oninput = (e) => {
    p.number = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 9));
    preview.update(p);
  };
  const pick = (id, fn) => {
    app.ui.querySelector(`#${id}`).onclick = (e) => {
      const v = e.target.dataset?.v;
      if (!v) return;
      fn(v);
      app.audio.ui();
      app.ui.querySelectorAll(`#${id} [data-v]`).forEach((n) => n.classList.toggle('on', n.dataset.v === v));
      preview.update(p);
    };
  };
  pick('pos', (v) => { p.position = v; });
  pick('hairstyle', (v) => { p.hairStyle = v; });
  pick('hair', (v) => { p.hair = v; });
  pick('skin', (v) => { p.skin = v; });

  app.ui.querySelector('#back').onclick = () => { cleanup(); app.audio.ui(); showUpload(app); };
  app.ui.querySelector('#next').onclick = () => { cleanup(); app.audio.ui(); showTeamSelect(app, 'home'); };
}

export function showTeamSelect(app, which) {
  const isHome = which === 'home';
  const taken = isHome ? null : app.homeTeamId;
  app.ui.innerHTML = `
    <div class="screen">
      ${dots(3)}
      <h2>${isHome ? 'Choose <em>your</em> team' : 'Choose the <em>opponent</em>'}</h2>
      <div class="sub">${isHome ? 'You always play left to right' : teamById(app.homeTeamId).name + ' vs …'}</div>
      <div class="team-grid">
        ${TEAMS.map((t) => `
          <div class="team-card ${t.id === taken ? 'disabled' : ''}" data-id="${t.id}" style="${t.id === taken ? 'opacity:0.25;pointer-events:none' : ''}">
            <div class="shirt" style="${shirtStyle(t.kit)}"></div>
            <div class="name">${t.name}</div>
            <div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
          </div>`).join('')}
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="back">Back</button>
      </div>
    </div>`;
  app.ui.querySelectorAll('.team-card').forEach((card) => {
    card.onclick = () => {
      app.audio.ui();
      if (isHome) { app.homeTeamId = card.dataset.id; showTeamSelect(app, 'away'); }
      else { app.awayTeamId = card.dataset.id; showSettings(app); }
    };
  });
  app.ui.querySelector('#back').onclick = () => {
    app.audio.ui();
    if (isHome) showCustomize(app);
    else showTeamSelect(app, 'home');
  };
}

export function showSettings(app) {
  const s = app.settings;
  app.ui.innerHTML = `
    <div class="screen">
      ${dots(4)}
      <h2>Match <em>settings</em></h2>
      <div class="panel settings-grid">
        <label>Match length</label>
        <div class="chips" id="len">${MATCH_LENGTHS.map((m) => `<button class="chip ${m.value === s.duration ? 'on' : ''}" data-v="${m.value}">${m.label}</button>`).join('')}</div>
        <label>Difficulty</label>
        <div class="chips" id="diff">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="chip ${k === s.difficulty ? 'on' : ''}" data-v="${k}">${d.label}</button>`).join('')}</div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn" id="kickoff">Kick off</button>
      </div>
    </div>`;
  const pick = (id, fn) => {
    app.ui.querySelector(`#${id}`).onclick = (e) => {
      const v = e.target.dataset?.v;
      if (!v) return;
      fn(v);
      app.audio.ui();
      app.ui.querySelectorAll(`#${id} [data-v]`).forEach((n) => n.classList.toggle('on', n.dataset.v === v));
    };
  };
  pick('len', (v) => { s.duration = parseInt(v, 10); });
  pick('diff', (v) => { s.difficulty = v; });
  app.ui.querySelector('#back').onclick = () => { app.audio.ui(); showTeamSelect(app, 'away'); };
  app.ui.querySelector('#kickoff').onclick = () => { app.audio.ui(); app.startMatch(); };
}

export function showIntro(app, onDone) {
  const home = teamById(app.homeTeamId);
  const away = teamById(app.awayTeamId);
  app.ui.innerHTML = `
    <div class="screen">
      <div class="matchup-banner">
        <span><span class="dot" style="background:${home.kit.primary}"></span>${home.code}</span>
        <span class="vs-badge">VS</span>
        <span><span class="dot" style="background:${away.kit.primary}"></span>${away.code}</span>
      </div>
      <div class="sub" style="margin-top:6px">${app.profile.name} · #${app.profile.number} · ${home.name}</div>
      <div class="loading-bar"><i></i></div>
    </div>`;
  setTimeout(onDone, 1500);
}

export function showPause(app, { onResume, onRestart, onQuit }) {
  app.ui.innerHTML = `
    <div class="screen" style="background:rgba(5,8,18,0.82)">
      <h2>Paused</h2>
      <div class="panel menu-panel">
        <button class="btn" id="resume">Resume</button>
        <button class="btn ghost" id="restart">Restart match</button>
        <button class="btn ghost" id="mute">${app.audio.muted ? 'Sound: off' : 'Sound: on'} (M)</button>
        <button class="btn ghost" id="quit">Quit to title</button>
      </div>
      <div class="sub" style="margin-top:4px">${CONTROLS_KEYBOARD_HTML}<br/>${CONTROLS_GAMEPAD_HTML}</div>
    </div>`;
  app.ui.querySelector('#resume').onclick = () => { app.audio.ui(); onResume(); };
  app.ui.querySelector('#restart').onclick = () => { app.audio.ui(); onRestart(); };
  app.ui.querySelector('#quit').onclick = () => { app.audio.ui(); onQuit(); };
  app.ui.querySelector('#mute').onclick = (e) => {
    app.audio.toggleMuted();
    e.target.textContent = app.audio.muted ? 'Sound: off (M)' : 'Sound: on (M)';
  };
}

export function showResult(app, result, { onRematch, onChangeTeams, onTitle }) {
  const home = teamById(app.homeTeamId);
  const away = teamById(app.awayTeamId);
  const h = result.homeScore; const a = result.awayScore;
  const headline = h > a ? 'You win!' : h < a ? 'You lose' : 'Draw';
  const scorers = result.scorers.length
    ? result.scorers.map((s) => `<div>${s.minute}' ${s.name} <span style="color:var(--wsc-dim)">(${s.side === 'home' ? home.code : away.code})</span></div>`).join('')
    : '<div style="color:var(--wsc-dim)">No goals — a tactical masterpiece.</div>';
  app.ui.innerHTML = `
    <div class="screen">
      <h2>${headline}</h2>
      <div class="result-score">${home.code} ${h} – ${a} ${away.code}</div>
      <div class="panel" style="text-align:center;line-height:1.9;min-width:280px">${scorers}</div>
      <div class="btn-row">
        <button class="btn" id="rematch">Rematch</button>
        <button class="btn ghost" id="teams">Change teams</button>
        <button class="btn ghost" id="title">Title screen</button>
      </div>
    </div>`;
  app.ui.querySelector('#rematch').onclick = () => { app.audio.ui(); onRematch(); };
  app.ui.querySelector('#teams').onclick = () => { app.audio.ui(); onChangeTeams(); };
  app.ui.querySelector('#title').onclick = () => { app.audio.ui(); onTitle(); };
}
