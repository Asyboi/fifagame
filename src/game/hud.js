// DOM HUD: scorebug, clock, controlled-player tag, stamina, shot power,
// center overlays (GOAL / KICK OFF / FULL TIME), toasts, countdown.

import { formatClock } from '../utils.js';

export function createHud(root) {
  root.innerHTML = `
    <div class="scorebug">
      <div class="wsc-chip">WSC</div>
      <div class="team home"><span class="dot"></span><span class="code">HOM</span></div>
      <div class="score hs">0</div>
      <div class="score as">0</div>
      <div class="team away"><span class="code">AWY</span><span class="dot"></span></div>
      <div class="clock">00:00</div>
    </div>
    <div class="player-tag">
      <div class="pname">—</div>
      <div class="ppos">—</div>
      <div class="stamina"><i></i></div>
    </div>
    <div class="power-wrap hidden"><i></i></div>
    <div class="overlay-center hidden"></div>
    <div class="countdown hidden"></div>
    <div class="toast hidden"></div>
  `;
  const el = {
    homeCode: root.querySelector('.team.home .code'),
    awayCode: root.querySelector('.team.away .code'),
    homeDot: root.querySelector('.team.home .dot'),
    awayDot: root.querySelector('.team.away .dot'),
    hs: root.querySelector('.hs'),
    as: root.querySelector('.as'),
    clock: root.querySelector('.clock'),
    tag: root.querySelector('.player-tag'),
    pname: root.querySelector('.pname'),
    ppos: root.querySelector('.ppos'),
    stamina: root.querySelector('.stamina'),
    staminaBar: root.querySelector('.stamina i'),
    power: root.querySelector('.power-wrap'),
    powerBar: root.querySelector('.power-wrap i'),
    overlay: root.querySelector('.overlay-center'),
    countdown: root.querySelector('.countdown'),
    toast: root.querySelector('.toast'),
  };
  let toastTimer = 0;
  let overlayTimer = 0;
  let lastSecond = -1;

  return {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },

    setTeams(homeCode, awayCode, homeColor, awayColor) {
      el.homeCode.textContent = homeCode;
      el.awayCode.textContent = awayCode;
      el.homeDot.style.background = homeColor;
      el.awayDot.style.background = awayColor;
    },

    setScore(h, a) { el.hs.textContent = h; el.as.textContent = a; },

    setClock(secondsLeft, duration) {
      const s = Math.ceil(secondsLeft);
      if (s === lastSecond) return;
      lastSecond = s;
      el.clock.textContent = formatClock(s);
      el.clock.classList.toggle('late', s <= 30 && s > 0);
    },

    setPlayer(name, posLabel, number) {
      el.pname.textContent = `${name} · #${number}`;
      el.ppos.textContent = posLabel;
    },

    setStamina(frac) {
      el.staminaBar.style.width = `${Math.round(frac * 100)}%`;
      el.stamina.classList.toggle('low', frac < 0.25);
    },

    power(frac) {
      if (frac == null) el.power.classList.add('hidden');
      else {
        el.power.classList.remove('hidden');
        el.powerBar.style.width = `${Math.round(frac * 100)}%`;
      }
    },

    overlay(html, ms = 0) {
      clearTimeout(overlayTimer);
      if (!html) { el.overlay.classList.add('hidden'); return; }
      el.overlay.innerHTML = html;
      el.overlay.classList.remove('hidden');
      if (ms > 0) overlayTimer = setTimeout(() => el.overlay.classList.add('hidden'), ms);
    },

    countdown(text) {
      if (!text) { el.countdown.classList.add('hidden'); return; }
      el.countdown.textContent = text;
      el.countdown.classList.remove('hidden');
    },

    toast(text, ms = 2200) {
      clearTimeout(toastTimer);
      if (!text) { el.toast.classList.add('hidden'); return; }
      el.toast.textContent = text;
      el.toast.classList.remove('hidden');
      toastTimer = setTimeout(() => el.toast.classList.add('hidden'), ms);
    },
  };
}
