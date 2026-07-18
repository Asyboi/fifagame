// ── In-match HUD: scoreboard, clock, radar, power bar, toasts ───
import { PITCH } from '../config.js';

export class Hud {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="scoreboard">
        <span class="sb-team" id="sb-home">HOM</span>
        <span class="sb-score" id="sb-score">0 - 0</span>
        <span class="sb-team" id="sb-away">AWY</span>
        <span class="sb-clock" id="sb-clock">00:00</span>
        <span class="sb-half" id="sb-half">1ST</span>
      </div>
      <canvas class="radar" id="radar" width="220" height="150"></canvas>
      <div class="powerbar hidden" id="powerbar"><div id="powerfill"></div></div>
      <div class="toast hidden" id="toast"></div>
      <div class="pad-status" id="pad-status">KEYBOARD</div>
      <div class="controls-hint" id="controls-hint">
        WASD move · SHIFT sprint · SPACE pass · E through · F shoot (hold) · R tackle · Q switch · C knock-on · ESC pause
      </div>`;
    root.appendChild(this.el);
    this.radarCtx = this.el.querySelector('#radar').getContext('2d');
    this._toastTimer = null;
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  setTeams(home, away) {
    this.el.querySelector('#sb-home').textContent = home.short;
    this.el.querySelector('#sb-home').style.borderColor = home.kit;
    this.el.querySelector('#sb-away').textContent = away.short;
    this.el.querySelector('#sb-away').style.borderColor = away.kit;
  }

  setScore(score) {
    this.el.querySelector('#sb-score').textContent = `${score.home} - ${score.away}`;
  }

  setClock(text, half) {
    this.el.querySelector('#sb-clock').textContent = text;
    this.el.querySelector('#sb-half').textContent = half === 1 ? '1ST' : '2ND';
  }

  setPower(charge) {
    const bar = this.el.querySelector('#powerbar');
    if (charge > 0.01) {
      bar.classList.remove('hidden');
      this.el.querySelector('#powerfill').style.width = `${Math.round(charge * 100)}%`;
    } else {
      bar.classList.add('hidden');
    }
  }

  setPadConnected(connected) {
    const el = this.el.querySelector('#pad-status');
    el.textContent = connected ? 'GAMEPAD' : 'KEYBOARD';
    el.classList.toggle('pad-on', connected);
  }

  toast(text, ms = 1800) {
    const t = this.el.querySelector('#toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  drawRadar(match) {
    const ctx = this.radarCtx;
    const W = 220, H = 150;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10, 40, 15, 0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.beginPath();
    ctx.moveTo(W / 2, 4);
    ctx.lineTo(W / 2, H - 4);
    ctx.stroke();

    const px = (x) => ((x + PITCH.length / 2) / PITCH.length) * (W - 12) + 6;
    const pz = (z) => ((z + PITCH.width / 2) / PITCH.width) * (H - 12) + 6;

    const dot = (x, z, color, r = 3) => {
      ctx.beginPath();
      ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    for (const p of match.homeTeam.players) {
      dot(p.pos.x, p.pos.z, p === match.controlled ? '#ffe600' : match.homeTeam.kit, p.isUser ? 4 : 3);
      if (p.isUser) {
        ctx.strokeStyle = '#41ead4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(p.pos.x), pz(p.pos.z), 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const p of match.awayTeam.players) dot(p.pos.x, p.pos.z, match.awayTeam.kit);
    dot(match.ball.pos.x, match.ball.pos.z, '#ffffff', 2.5);
  }
}
