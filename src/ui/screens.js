// ── Overlay screens: lineup, goal, halftime, pause, results ─────
import { resultText } from '../game/rules.js';

export class Screens {
  constructor(root) {
    this.root = root;
    this.current = null;
  }

  _show(html, className = '') {
    this.dismiss();
    const el = document.createElement('div');
    el.className = `screen overlay ${className}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.current = el;
    return el;
  }

  dismiss() {
    this.current?.remove();
    this.current = null;
  }

  lineup(match, onStart) {
    const teamList = (team) => team.players
      .map((p) => `<li class="${p.isUser ? 'you' : ''}">
        <b>${p.number}</b> ${p.name} <i>${p.role}</i>${p.isUser ? ' — YOU' : ''}</li>`)
      .join('');
    const el = this._show(`
      <div class="lineup">
        <h1 class="logo small">FABLE CUP · FINAL</h1>
        <p class="venue">Fablewood Arena · 52,000 spectators</p>
        <div class="lineup-cols">
          <div class="lineup-team" style="--kit:${match.homeTeam.kit}">
            <h2>${match.homeTeam.name}</h2><ul>${teamList(match.homeTeam)}</ul>
          </div>
          <div class="lineup-vs">VS</div>
          <div class="lineup-team" style="--kit:${match.awayTeam.kit}">
            <h2>${match.awayTeam.name}</h2><ul>${teamList(match.awayTeam)}</ul>
          </div>
        </div>
        <button class="big-btn" id="kickoff-btn">KICK OFF</button>
      </div>`, 'lineup-screen');
    el.querySelector('#kickoff-btn').onclick = () => {
      this.dismiss();
      onStart();
    };
  }

  goalBanner(scorer, side, match) {
    const team = side === 'home' ? match.homeTeam : match.awayTeam;
    const el = this._show(`
      <div class="goal-banner" style="--kit:${team.kit}">
        <h1>GOAL!</h1>
        <p>${scorer ? `${scorer.name} · #${scorer.number}` : team.name}</p>
        <p class="gb-score">${match.homeTeam.short} ${match.score.home} - ${match.score.away} ${match.awayTeam.short}</p>
      </div>`, 'transparent');
    setTimeout(() => {
      if (this.current === el) this.dismiss();
    }, 2600);
  }

  halftime(match, onResume) {
    const el = this._show(`
      <div class="panel">
        <h1>HALF-TIME</h1>
        <p class="big-score">${match.homeTeam.short} ${match.score.home} - ${match.score.away} ${match.awayTeam.short}</p>
        <button class="big-btn" id="resume-btn">START 2ND HALF</button>
      </div>`);
    el.querySelector('#resume-btn').onclick = () => {
      this.dismiss();
      onResume();
    };
  }

  pauseMenu(onResume, onRestart, onQuit) {
    const el = this._show(`
      <div class="panel">
        <h1>PAUSED</h1>
        <button class="big-btn" id="p-resume">RESUME</button>
        <button class="big-btn secondary" id="p-restart">RESTART MATCH</button>
        <button class="big-btn secondary" id="p-quit">NEW PLAYER</button>
        <p class="hint">Gamepad: A pass · B shoot (hold) · Y through · X tackle · LB switch · RT sprint · LT knock-on · START pause</p>
      </div>`);
    el.querySelector('#p-resume').onclick = () => {
      this.dismiss();
      onResume();
    };
    el.querySelector('#p-restart').onclick = () => {
      this.dismiss();
      onRestart();
    };
    el.querySelector('#p-quit').onclick = () => {
      this.dismiss();
      onQuit();
    };
  }

  results(match, onRematch, onNewPlayer) {
    const s = match.score;
    const el = this._show(`
      <div class="panel results">
        <h1 class="logo small">FULL-TIME</h1>
        <p class="big-score">${match.homeTeam.short} ${s.home} - ${s.away} ${match.awayTeam.short}</p>
        <h2>${resultText(s, match.homeTeam.name, match.awayTeam.name)}</h2>
        <button class="big-btn" id="r-rematch">REMATCH</button>
        <button class="big-btn secondary" id="r-new">NEW PLAYER</button>
      </div>`);
    el.querySelector('#r-rematch').onclick = () => {
      this.dismiss();
      onRematch();
    };
    el.querySelector('#r-new').onclick = () => {
      this.dismiss();
      onNewPlayer();
    };
  }
}
