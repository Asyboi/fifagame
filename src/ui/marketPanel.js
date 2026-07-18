// ── FableMarket panel: a Polymarket-style corner exchange ───────
// Corner chip toggles a slide-in panel with live markets, bet
// slips, open positions with cash-out, and an activity feed.
import { cents } from '../market/market.js';

export class MarketPanel {
  constructor(root, hub) {
    this.hub = hub;
    this.cards = new Map(); // marketId → card element
    this._buildDom(root);
    hub.subscribe(() => this.refresh());
    this.refresh();
  }

  _buildDom(root) {
    this.chip = document.createElement('button');
    this.chip.className = 'fm-chip';
    this.chip.innerHTML = `<span class="fm-dot"></span>FABLE MARKET <b id="fm-chip-bal"></b>`;
    this.chip.onclick = () => this.toggle();
    root.appendChild(this.chip);

    this.panel = document.createElement('div');
    this.panel.className = 'fm-panel fm-closed';
    this.panel.innerHTML = `
      <div class="fm-head">
        <span class="fm-logo">FABLE<b>MARKET</b></span>
        <span class="fm-balance">Balance <b id="fm-bal"></b></span>
        <button class="fm-close" id="fm-close">&times;</button>
      </div>
      <div class="fm-scroll">
        <div id="fm-faucet-row"></div>
        <div id="fm-markets"></div>
        <h3 class="fm-h3">Your positions</h3>
        <div id="fm-positions" class="fm-positions"></div>
        <h3 class="fm-h3">Activity</h3>
        <div id="fm-activity" class="fm-activity"></div>
        <p class="fm-fine">FableCoins (FC) are fictional fun-money. Odds move with the match.</p>
      </div>`;
    root.appendChild(this.panel);
    this.panel.querySelector('#fm-close').onclick = () => this.toggle(false);
    this.marketsEl = this.panel.querySelector('#fm-markets');
  }

  toggle(force) {
    const open = force ?? this.panel.classList.contains('fm-closed');
    this.panel.classList.toggle('fm-closed', !open);
  }

  // ── rendering ─────────────────────────────────────────────────
  refresh() {
    const hub = this.hub;
    this.panel.querySelector('#fm-bal').textContent = `${hub.balance.toFixed(0)} FC`;
    this.chip.querySelector('#fm-chip-bal').textContent = `${hub.balance.toFixed(0)} FC`;

    // faucet
    const faucetRow = this.panel.querySelector('#fm-faucet-row');
    if (hub.balance < 10) {
      if (!faucetRow.firstChild) {
        faucetRow.innerHTML = `<button class="fm-faucet">You're broke — claim 500 FC</button>`;
        faucetRow.firstChild.onclick = () => hub.faucet();
      }
    } else {
      faucetRow.innerHTML = '';
    }

    // markets: create/update cards in hub order
    for (const m of hub.markets) {
      let card = this.cards.get(m.id);
      if (!card) {
        card = this._createCard(m);
        this.cards.set(m.id, card);
        this.marketsEl.appendChild(card); // attach once; moving nodes would blur inputs
      }
      this._updateCard(card, m);
    }
    // drop cards for markets that no longer exist (new match)
    for (const [id, card] of this.cards) {
      if (!hub.markets.find((m) => m.id === id)) {
        card.remove();
        this.cards.delete(id);
      }
    }

    this._renderPositions();
    this._renderActivity();
  }

  _createCard(m) {
    const card = document.createElement('div');
    card.className = 'fm-card';
    card.dataset.id = m.id;
    card.innerHTML = `
      <div class="fm-q">${m.question} <span class="fm-badge"></span></div>
      <div class="fm-outcomes"></div>
      <div class="fm-slip-holder"></div>`;
    const box = card.querySelector('.fm-outcomes');
    for (const o of m.outcomes) {
      const row = document.createElement('div');
      row.className = 'fm-row';
      row.dataset.outcome = o.id;
      row.innerHTML = `
        <span class="fm-oname">${o.label}</span>
        <canvas class="fm-spark" width="64" height="20"></canvas>
        <span class="fm-delta"></span>
        <button class="fm-yes"></button>
        <button class="fm-no"></button>`;
      row.querySelector('.fm-yes').onclick = () => this._openSlip(card, m.id, o.id, 'yes');
      row.querySelector('.fm-no').onclick = () => this._openSlip(card, m.id, o.id, 'no');
      box.appendChild(row);
    }
    return card;
  }

  _updateCard(card, m) {
    const badge = card.querySelector('.fm-badge');
    card.classList.toggle('fm-done', m.status !== 'open');
    badge.textContent = m.status === 'resolved' ? 'RESOLVED' : m.status === 'void' ? 'VOID' : 'LIVE';
    badge.className = `fm-badge fm-badge-${m.status}`;

    for (const o of m.outcomes) {
      const row = card.querySelector(`.fm-row[data-outcome="${o.id}"]`);
      if (!row) continue;
      const yes = row.querySelector('.fm-yes');
      const no = row.querySelector('.fm-no');
      yes.textContent = `YES ${cents(o.price)}`;
      no.textContent = `NO ${cents(1 - o.price)}`;
      yes.disabled = no.disabled = m.status !== 'open';
      const delta = row.querySelector('.fm-delta');
      const d = Math.round((o.price - o.prev) * 100);
      delta.textContent = d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '';
      delta.className = `fm-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`;
      this._drawSpark(row.querySelector('.fm-spark'), o.history, o.price);
    }
    // live-update an open bet slip's numbers
    const slip = card.querySelector('.fm-slip');
    if (slip) this._updateSlipMath(slip, m);
  }

  _drawSpark(canvas, history, price) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const data = history.length > 1 ? history : [price, price];
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = (i / (data.length - 1)) * (W - 2) + 1;
      const y = H - 2 - p * (H - 4);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = data[data.length - 1] >= data[0] ? '#27c07d' : '#e35d6a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── bet slip ──────────────────────────────────────────────────
  _openSlip(card, marketId, outcomeId, side) {
    // one slip at a time
    this.panel.querySelectorAll('.fm-slip').forEach((s) => s.remove());
    const holder = card.querySelector('.fm-slip-holder');
    const slip = document.createElement('div');
    slip.className = 'fm-slip';
    slip.dataset.market = marketId;
    slip.dataset.outcome = outcomeId;
    slip.dataset.side = side;
    slip.innerHTML = `
      <div class="fm-slip-title"></div>
      <div class="fm-slip-amounts">
        <input type="number" min="1" step="1" value="50" class="fm-amount" />
        ${[10, 50, 100].map((v) => `<button class="fm-quick" data-v="${v}">${v}</button>`).join('')}
      </div>
      <div class="fm-slip-math"></div>
      <div class="fm-slip-actions">
        <button class="fm-place ${side === 'yes' ? 'buy-yes' : 'buy-no'}">PLACE BET</button>
        <button class="fm-cancel">Cancel</button>
      </div>
      <div class="fm-slip-err"></div>`;
    holder.appendChild(slip);

    const m = this.hub.markets.find((x) => x.id === marketId);
    this._updateSlipMath(slip, m);
    slip.querySelector('.fm-amount').oninput = () => this._updateSlipMath(slip, m);
    slip.querySelectorAll('.fm-quick').forEach((b) => {
      b.onclick = () => {
        slip.querySelector('.fm-amount').value = b.dataset.v;
        this._updateSlipMath(slip, m);
      };
    });
    slip.querySelector('.fm-cancel').onclick = () => slip.remove();
    slip.querySelector('.fm-place').onclick = () => {
      const amount = parseFloat(slip.querySelector('.fm-amount').value);
      const res = this.hub.buy(marketId, outcomeId, side, amount);
      if (typeof res === 'string') {
        slip.querySelector('.fm-slip-err').textContent = res;
      } else {
        slip.remove();
      }
    };
  }

  _updateSlipMath(slip, m) {
    const o = m.outcomes.find((x) => x.id === slip.dataset.outcome);
    const side = slip.dataset.side;
    const price = side === 'yes' ? o.price : 1 - o.price;
    slip.querySelector('.fm-slip-title').textContent =
      `${side.toUpperCase()} · ${o.label} @ ${cents(price)}`;
    const amount = parseFloat(slip.querySelector('.fm-amount').value) || 0;
    const shares = price > 0 ? amount / price : 0;
    slip.querySelector('.fm-slip-math').textContent =
      `${shares.toFixed(1)} shares — pays ${shares.toFixed(0)} FC if correct ` +
      `(+${Math.max(0, shares - amount).toFixed(0)} profit)`;
  }

  // ── positions & activity ──────────────────────────────────────
  _renderPositions() {
    const el = this.panel.querySelector('#fm-positions');
    const hub = this.hub;
    if (!hub.positions.length) {
      el.innerHTML = '<p class="fm-empty">No bets yet. Pick a side.</p>';
      return;
    }
    el.innerHTML = '';
    const sorted = [...hub.positions].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1));
    for (const pos of sorted.slice(0, 12)) {
      const row = document.createElement('div');
      row.className = `fm-pos fm-pos-${pos.status}`;
      const value = pos.status === 'open' ? hub.positionValue(pos) : (pos.payout ?? 0);
      const pnl = value - pos.cost;
      row.innerHTML = `
        <span class="fm-pos-label">${pos.label}</span>
        <span class="fm-pos-num">${pos.cost} FC → <b>${value.toFixed(0)} FC</b>
          <i class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}</i></span>
        <span class="fm-pos-state">${pos.status.toUpperCase()}</span>`;
      if (pos.status === 'open') {
        const btn = document.createElement('button');
        btn.className = 'fm-cashout';
        btn.textContent = 'CASH OUT';
        btn.onclick = () => hub.cashOut(pos.id);
        row.appendChild(btn);
      }
      el.appendChild(row);
    }
  }

  _renderActivity() {
    const el = this.panel.querySelector('#fm-activity');
    el.innerHTML = this.hub.activity
      .slice(0, 8)
      .map((a) => `<div class="fm-act">${a.text}</div>`)
      .join('') || '<p class="fm-empty">Quiet in here.</p>';
  }
}
