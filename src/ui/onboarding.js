// ── Onboarding: photo upload, customization, rotatable preview ──
import * as THREE from 'three';
import { TEAMS, POSITIONS, SKIN_TONES, HAIR_STYLES, HAIR_COLORS } from '../config.js';
import { buildPlayerMesh } from '../game/playerMesh.js';
import { renderFaceCanvas, faceTextureFromCanvas, loadImageFile } from '../avatar/face.js';

const STORAGE_KEY = 'fablecup.savedPhoto';

export class Onboarding {
  constructor(root, onDone) {
    this.onDone = onDone;
    this.profile = {
      name: 'You', number: 10, teamId: TEAMS[0].id, opponentId: TEAMS[1].id,
      position: 'ST', skinTone: SKIN_TONES[1], hairStyle: 'short',
      hairColor: HAIR_COLORS[0], kitVariant: 'home', difficulty: 'normal',
      image: null, zoom: 1, offsetX: 0, offsetY: 0, saveFace: false,
    };
    this.faceCanvas = document.createElement('canvas');
    this.faceTexture = null;
    this._buildDom(root);
    this._buildPreview();
    this._restoreSavedPhoto();
    this._refreshAll();
  }

  _buildDom(root) {
    this.el = document.createElement('div');
    this.el.className = 'screen onboarding';
    this.el.innerHTML = `
      <h1 class="logo">FABLE&nbsp;CUP</h1>
      <p class="tagline">Create your player and take the field</p>
      <div class="ob-grid">
        <div class="ob-form">
          <label class="upload-zone" id="upload-zone">
            <input type="file" id="photo-input" accept="image/*" hidden />
            <span id="upload-label"> Upload a clear front-facing photo</span>
          </label>
          <div class="slider-row" id="photo-tuning" style="display:none">
            <label>Zoom <input type="range" id="zoom" min="0.6" max="2.6" step="0.02" value="1"></label>
            <label>↔ <input type="range" id="offx" min="-0.6" max="0.6" step="0.02" value="0"></label>
            <label>↕ <input type="range" id="offy" min="-0.6" max="0.6" step="0.02" value="0"></label>
            <label class="check"><input type="checkbox" id="save-face"> Keep photo in this browser</label>
          </div>
          <div class="field-row">
            <label>Name <input type="text" id="name" maxlength="14" value="You"></label>
            <label>Number <input type="number" id="number" min="1" max="99" value="10"></label>
          </div>
          <div class="field-row">
            <label>Team <select id="team"></select></label>
            <label>Opponent <select id="opponent"></select></label>
          </div>
          <div class="field-row">
            <label>Position <select id="position"></select></label>
            <label>Kit <select id="kit">
              <option value="home">Primary</option><option value="away">Alternate</option>
            </select></label>
            <label>Difficulty <select id="difficulty">
              <option value="easy">Easy</option>
              <option value="normal" selected>Normal</option>
              <option value="hard">Hard</option>
            </select></label>
          </div>
          <div class="swatch-group">Skin <span id="skin-swatches"></span></div>
          <div class="field-row"><label>Hair <select id="hair"></select></label></div>
          <div class="swatch-group">Hair colour <span id="hairc-swatches"></span></div>
          <button id="play-btn" class="big-btn">ENTER THE FABLE CUP →</button>
        </div>
        <div class="ob-preview">
          <canvas id="preview-canvas" width="340" height="420"></canvas>
          <p class="hint">drag to rotate</p>
        </div>
      </div>`;
    root.appendChild(this.el);

    const $ = (id) => this.el.querySelector('#' + id);
    const teamSel = $('team');
    const oppSel = $('opponent');
    for (const t of TEAMS) {
      teamSel.add(new Option(t.name, t.id));
      oppSel.add(new Option(t.name, t.id));
    }
    oppSel.value = TEAMS[1].id;
    const posSel = $('position');
    for (const p of POSITIONS) posSel.add(new Option(p, p));
    const hairSel = $('hair');
    for (const h of HAIR_STYLES) hairSel.add(new Option(h, h));

    const swatches = (containerId, colors, key) => {
      const box = $(containerId);
      colors.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = c;
        b.onclick = () => {
          this.profile[key] = c;
          box.querySelectorAll('.swatch').forEach((s) => s.classList.remove('sel'));
          b.classList.add('sel');
          this._refreshAll();
        };
        box.appendChild(b);
      });
      box.children[colors.indexOf(this.profile[key])]?.classList.add('sel');
    };
    swatches('skin-swatches', SKIN_TONES, 'skinTone');
    swatches('hairc-swatches', HAIR_COLORS, 'hairColor');

    $('photo-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.profile.image = await loadImageFile(file);
      $('upload-label').textContent = ' Photo loaded — tune the crop below';
      $('photo-tuning').style.display = 'flex';
      this._persistPhotoMaybe();
      this._refreshAll();
    };
    $('upload-zone').onclick = () => $('photo-input').click();

    const bind = (id, key, num = true) => {
      $(id).oninput = (e) => {
        this.profile[key] = num ? parseFloat(e.target.value) : e.target.value;
        this._refreshAll();
      };
    };
    bind('zoom', 'zoom');
    bind('offx', 'offsetX');
    bind('offy', 'offsetY');
    bind('name', 'name', false);
    $('number').oninput = (e) => {
      this.profile.number = Math.max(1, Math.min(99, parseInt(e.target.value) || 10));
      this._refreshAll();
    };
    bind('position', 'position', false);
    bind('hair', 'hairStyle', false);
    bind('kit', 'kitVariant', false);
    bind('difficulty', 'difficulty', false);
    teamSel.onchange = (e) => {
      this.profile.teamId = e.target.value;
      if (this.profile.opponentId === this.profile.teamId) {
        this.profile.opponentId = TEAMS.find((t) => t.id !== this.profile.teamId).id;
        oppSel.value = this.profile.opponentId;
      }
      this._refreshAll();
    };
    oppSel.onchange = (e) => {
      this.profile.opponentId = e.target.value;
      if (this.profile.opponentId === this.profile.teamId) {
        oppSel.value = this.profile.opponentId = TEAMS.find((t) => t.id !== this.profile.teamId).id;
      }
    };
    $('save-face').onchange = (e) => {
      this.profile.saveFace = e.target.checked;
      this._persistPhotoMaybe();
    };
    $('play-btn').onclick = () => this._finish();
  }

  // ── preview scene ─────────────────────────────────────────────
  _buildPreview() {
    const canvas = this.el.querySelector('#preview-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 340 / 420, 0.1, 20);
    this.camera.position.set(0, 1.15, 3.1);
    this.camera.lookAt(0, 0.95, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
    key.position.set(2, 3, 3);
    this.scene.add(key);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 32),
      new THREE.MeshStandardMaterial({ color: 0x1d4d21 })
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);

    this.rotY = 0.4;
    let dragging = false;
    let lastX = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.rotY += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    window.addEventListener('pointerup', () => (dragging = false));

    this._animate = () => {
      if (this.done) return;
      requestAnimationFrame(this._animate);
      if (!dragging) this.rotY += 0.004;
      if (this.avatar) this.avatar.rotation.y = this.rotY;
      this.renderer.render(this.scene, this.camera);
    };
    this._animate();
  }

  _refreshAll() {
    // face texture
    if (this.profile.image) {
      renderFaceCanvas(this.faceCanvas, this.profile);
      this.faceTexture = faceTextureFromCanvas(this.faceCanvas, this.faceTexture);
    }
    // rebuild avatar mesh
    if (this.avatar) this.scene.remove(this.avatar);
    const team = TEAMS.find((t) => t.id === this.profile.teamId);
    const flip = this.profile.kitVariant === 'away';
    const built = buildPlayerMesh({
      kitColor: flip ? team.kit2 : team.kit,
      kit2Color: flip ? team.kit : team.kit2,
      skinTone: this.profile.skinTone,
      hairStyle: this.profile.hairStyle,
      hairColor: this.profile.hairColor,
      number: this.profile.number,
      faceTexture: this.profile.image ? this.faceTexture : null,
    });
    this.avatar = built.root;
    this.avatar.rotation.y = this.rotY;
    this.scene.add(this.avatar);
  }

  _persistPhotoMaybe() {
    try {
      if (this.profile.saveFace && this.profile.image) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const s = Math.max(256 / this.profile.image.width, 256 / this.profile.image.height);
        c.getContext('2d').drawImage(
          this.profile.image,
          128 - (this.profile.image.width * s) / 2,
          128 - (this.profile.image.height * s) / 2,
          this.profile.image.width * s,
          this.profile.image.height * s
        );
        localStorage.setItem(STORAGE_KEY, c.toDataURL('image/jpeg', 0.85));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* storage may be unavailable; photo stays session-only */ }
  }

  _restoreSavedPhoto() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;
      const img = new Image();
      img.onload = () => {
        this.profile.image = img;
        this.profile.saveFace = true;
        this.el.querySelector('#save-face').checked = true;
        this.el.querySelector('#upload-label').textContent = ' Saved photo restored';
        this.el.querySelector('#photo-tuning').style.display = 'flex';
        this._refreshAll();
      };
      img.src = data;
    } catch { /* ignore */ }
  }

  _finish() {
    this.done = true;
    this.renderer.dispose();
    this.el.remove();
    const team = TEAMS.find((t) => t.id === this.profile.teamId);
    const opp = TEAMS.find((t) => t.id === this.profile.opponentId);
    const flip = this.profile.kitVariant === 'away';
    const teamDef = flip ? { ...team, kit: team.kit2, kit2: team.kit } : team;
    this.onDone({
      profile: {
        name: this.profile.name.trim() || 'You',
        number: this.profile.number,
        position: this.profile.position,
        skinTone: this.profile.skinTone,
        hairStyle: this.profile.hairStyle,
        hairColor: this.profile.hairColor,
        faceTexture: this.profile.image ? this.faceTexture : null,
      },
      homeTeamDef: teamDef,
      awayTeamDef: opp,
      difficulty: this.profile.difficulty,
    });
  }
}
