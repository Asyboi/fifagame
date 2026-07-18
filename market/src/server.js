// Market server: HTTP + Server-Sent Events, no dependencies.
//
// Clients receive state over SSE (native auto-reconnect, survives a phone
// locking its screen) and send bets as ordinary POSTs. Nothing here needs
// bidirectional transport, so nothing here uses WebSockets.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join as pathJoin, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMatchMarket,
  applyEvent,
  placeBet,
  join,
  snapshot,
  traderView,
  currentFair,
  currentPrice,
  pushFeed,
} from './market.js';
import { spawnBots, runBotRound } from './bots.js';
import { startMatchSim } from './matchSim.js';

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = pathJoin(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// The simulator drives the match unless the real game is feeding us events.
// Any inbound POST /event from the game switches us over permanently.
const USE_SIM = process.env.USE_SIM !== 'false';

const BOT_ROUND_MS = 400;
const BROADCAST_MS = 250;
const MAX_BET = 25;
const RESET_TOKEN = process.env.RESET_TOKEN || '';

// Mutable so /reset can swap in a fresh match without restarting the process.
// On a hosted box a restart is a 30-60s cold start, which is not something you
// want to do in front of a room between demos.
let market = createMatchMarket();
let bots = spawnBots(market);
const clients = new Set();

let gameConnected = false;
let sim = null;

// ---------------------------------------------------------------- broadcasting

function broadcast() {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify(snapshot(market))}\n\n`;
  for (const res of clients) {
    // A phone that walked out of range leaves a dead socket; drop it rather
    // than letting write errors take down the tick loop.
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// ------------------------------------------------------------------ match loop

function handleEvent(event) {
  applyEvent(market, event);
  if (event.type === 'final' && sim) sim.stop();
}

function startSim() {
  if (!USE_SIM || gameConnected) return;
  sim = startMatchSim(handleEvent);
  console.log('[market] simulated match started');
}

setInterval(() => {
  if (market.match.status !== 'live') return;
  runBotRound(market, bots, {
    fair: currentFair(market),
    price: currentPrice(market),
  });
}, BOT_ROUND_MS);

setInterval(broadcast, BROADCAST_MS);

// --------------------------------------------------------------------- routing

const server = createServer(async (req, res) => {
  // The phone client is served from the same origin, but the game may not be,
  // so events and bets have to be allowed cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return end(res, 204, '');

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/stream') return stream(req, res, url);
    if (req.method === 'POST' && url.pathname === '/event') return await postEvent(req, res);
    if (req.method === 'POST' && url.pathname === '/join') return await postJoin(req, res);
    if (req.method === 'POST' && url.pathname === '/bet') return await postBet(req, res);
    if (req.method === 'POST' && url.pathname === '/reset') return await postReset(req, res);
    // Cheap endpoint for an uptime pinger to hit, so a free-tier host does not
    // spin the service down while nobody is betting.
    if (req.method === 'GET' && url.pathname === '/healthz') return end(res, 200, 'ok');
    if (req.method === 'GET' && url.pathname === '/state') return json(res, 200, snapshot(market));
    if (req.method === 'GET' && url.pathname === '/me') {
      // Clients track their own position between bets, but settlement rewrites
      // cash server-side, so they need a way to re-sync at the whistle.
      return json(res, 200, { me: traderView(market, url.searchParams.get('traderId')) });
    }
    if (req.method === 'GET') return await serveStatic(url, res);
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[market] request failed', err);
    return json(res, 500, { error: 'internal' });
  }
});

function stream(req, res, url) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx and friends buffer SSE by default, which stalls the feed behind a
    // proxy. This is the header that stops that.
    'X-Accel-Buffering': 'no',
  });

  const traderId = url.searchParams.get('traderId');
  res.write(`data: ${JSON.stringify(snapshot(market))}\n\n`);
  if (traderId) {
    const view = traderView(market, traderId);
    if (view) res.write(`event: me\ndata: ${JSON.stringify(view)}\n\n`);
  }

  clients.add(res);
  req.on('close', () => clients.delete(res));
}

async function postEvent(req, res) {
  const event = await body(req);
  if (!event?.type) return json(res, 400, { error: 'missing type' });

  // First real event from the game wins: stop the simulator and hand over.
  if (!gameConnected) {
    gameConnected = true;
    if (sim) { sim.stop(); sim = null; }
    console.log('[market] real game connected, simulator stopped');
    pushFeed(market, { type: 'system', text: 'Live game connected' });
  }

  handleEvent(event);
  return json(res, 200, { ok: true });
}

// Start a fresh match, keeping connected clients attached. Their phones simply
// see a new match appear rather than having to rescan the QR code.
//
// Guarded by RESET_TOKEN so a curious audience member with the URL cannot wipe
// the market mid-demo.
async function postReset(req, res) {
  const { token } = (await body(req)) ?? {};
  if (RESET_TOKEN && token !== RESET_TOKEN) return json(res, 403, { error: 'bad token' });

  // Carry the audience over to the new match with a fresh $100 each. Without
  // this their phones keep a trader id the new market has never heard of, and
  // every bet comes back rejected until they reload -- which is not something
  // you can talk a room through mid-demo.
  const humans = [...market.ledger.traders.values()]
    .filter((t) => t.kind === 'human')
    .map(({ id, name }) => ({ id, name }));

  if (sim) { sim.stop(); sim = null; }
  gameConnected = false;
  market = createMatchMarket();
  bots = spawnBots(market);
  for (const h of humans) join(market, { ...h, kind: 'human' });

  pushFeed(market, { type: 'system', text: 'New match — everyone back to $100' });
  broadcast();
  console.log('[market] reset');
  return json(res, 200, { ok: true });
}

async function postJoin(req, res) {
  const { id, name } = (await body(req)) ?? {};
  if (!id) return json(res, 400, { error: 'missing id' });

  const trader = join(market, {
    id,
    name: (name || 'anon').slice(0, 16),
    kind: 'human',
  });
  if (market.match.status === 'pending') startSim();

  return json(res, 200, { trader: traderView(market, trader.id) });
}

async function postBet(req, res) {
  const { traderId, team, amount } = (await body(req)) ?? {};
  if (!traderId || !['ARG', 'ESP'].includes(team)) {
    return json(res, 400, { error: 'bad bet' });
  }

  const budget = Math.min(Number(amount) || 0, MAX_BET);
  const fill = placeBet(market, { traderId, team, budget });
  if (!fill) return json(res, 200, { filled: false, me: traderView(market, traderId) });

  return json(res, 200, {
    filled: true,
    shares: fill.shares,
    spent: fill.spent,
    price: fill.avgPrice,
    me: traderView(market, traderId),
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  // Nothing outside public/ is servable, whatever the path claims.
  if (rel.includes('..')) return json(res, 403, { error: 'nope' });

  try {
    const file = await readFile(pathJoin(PUBLIC_DIR, rel));
    return end(res, 200, file, MIME[extname(rel)] || 'application/octet-stream');
  } catch {
    return json(res, 404, { error: 'not found' });
  }
}

// ---------------------------------------------------------------------- helpers

function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // A malformed or hostile client must not be able to exhaust memory.
      if (raw.length > 1e5) { raw = ''; req.destroy(); resolve(null); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function json(res, code, payload) {
  return end(res, code, JSON.stringify(payload), 'application/json');
}

function end(res, code, payload, type = 'text/plain') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(payload);
}

server.listen(PORT, () => {
  console.log(`[market] listening on http://localhost:${PORT}`);
  console.log(`[market] simulator ${USE_SIM ? 'armed' : 'disabled'}`);
});
