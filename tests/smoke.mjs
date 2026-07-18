// ── Headless end-to-end smoke test ──────────────────────────────
// Drives the real UI in Edge: onboarding → photo upload → kickoff →
// simulated play with keyboard input → asserts no runtime errors.
// Usage: start `npm run dev` first, then `node tests/smoke.mjs`.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173';

// tiny 8x8 orange PNG as the "photo"
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVQYlWP8z8Dwn4EIwESMolGF5CsEAFf9Ah/msLShAAAAAElFTkSuQmCC';

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

const run = async () => {
  const tmpPng = path.join(os.tmpdir(), 'fable-face.png');
  fs.writeFileSync(tmpPng, Buffer.from(PNG_B64, 'base64'));

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  console.log('1. loading', URL);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#play-btn', { timeout: 15000 });

  console.log('2. uploading photo + customizing');
  const input = await page.$('#photo-input');
  await input.uploadFile(tmpPng);
  await page.waitForFunction(
    () => document.querySelector('#photo-tuning')?.style.display !== 'none',
    { timeout: 5000 }
  );
  await page.$eval('#name', (el) => { el.value = ''; });
  await page.type('#name', 'Smokey');
  await page.select('#position', 'ST');

  console.log('3. entering the match');
  await page.click('#play-btn');
  await page.waitForSelector('#kickoff-btn', { timeout: 10000 });
  await page.click('#kickoff-btn');

  await page.waitForFunction(
    () => window.__fable?.match && ['kickoff', 'play'].includes(window.__fable.match.state),
    { timeout: 10000 }
  );

  console.log('4. simulating gameplay (move / pass / shoot / tackle / switch)');
  const holdKey = async (code, ms) => {
    await page.keyboard.down(code);
    await new Promise((r) => setTimeout(r, ms));
    await page.keyboard.up(code);
  };
  await new Promise((r) => setTimeout(r, 2000)); // let kickoff resolve
  await holdKey('KeyW', 600);
  await holdKey('KeyD', 800);
  await page.keyboard.press('Space');       // pass
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.press('KeyQ');        // switch
  await holdKey('KeyF', 700);               // charge + release shot
  await page.keyboard.press('KeyR');        // tackle
  await holdKey('KeyA', 500);
  await page.keyboard.press('KeyE');        // through ball
  await new Promise((r) => setTimeout(r, 4000)); // AI plays on

  const state = await page.evaluate(() => ({
    matchState: window.__fable.match.state,
    score: window.__fable.match.score,
    clockRunning: window.__fable.match.elapsed > 0,
    players: window.__fable.match.allPlayers.length,
    userName: window.__fable.match.userPlayer?.name,
    userControllable: !!window.__fable.match.controlled,
    ballOnPitch: Math.abs(window.__fable.match.ball.pos.x) < 80,
  }));
  console.log('   state:', JSON.stringify(state));

  console.log('5. pause / resume');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  const paused = await page.evaluate(() => window.__fable.match.state === 'paused');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  const resumed = await page.evaluate(() => window.__fable.match.state === 'play');
  if (!resumed) fail('resume after pause failed');

  console.log('6. fast-forward to halftime');
  await page.evaluate(() => { window.__fable.match.elapsed = 9999; });
  await page.waitForFunction(
    () => window.__fable.match.state === 'halftime',
    { timeout: 15000 }
  );
  await page.waitForSelector('#resume-btn', { timeout: 5000 });
  await page.click('#resume-btn');
  await page.waitForFunction(
    () => ['kickoff', 'play'].includes(window.__fable.match.state),
    { timeout: 10000 }
  );
  const half = await page.evaluate(() => window.__fable.match.half);
  if (half !== 2) fail('second half did not start');

  console.log('7. fast-forward to full time + rematch');
  await page.evaluate(() => { window.__fable.match.elapsed = 9999; });
  await page.waitForFunction(
    () => window.__fable.match.state === 'fulltime',
    { timeout: 15000 }
  );
  await page.waitForSelector('#r-rematch', { timeout: 5000 });
  await page.click('#r-rematch');
  await page.waitForSelector('#kickoff-btn', { timeout: 10000 });
  await page.click('#kickoff-btn');
  await page.waitForFunction(
    () => ['kickoff', 'play'].includes(window.__fable.match.state),
    { timeout: 10000 }
  );

  await page.screenshot({ path: 'tests/smoke-match.png' });
  await browser.close();

  if (!state.clockRunning) fail('match clock never ran');
  if (state.players !== 22) fail(`expected 22 players, got ${state.players}`);
  if (state.userName !== 'Smokey') fail(`user player name wrong: ${state.userName}`);
  if (!state.userControllable) fail('no controlled player');
  if (!state.ballOnPitch) fail('ball escaped the stadium');
  if (!paused) fail('pause did not engage');
  const realErrors = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  if (realErrors.length) fail('runtime errors:\n' + realErrors.join('\n'));

  console.log('SMOKE TEST PASSED — full flow: onboarding -> match -> fulltime -> rematch');
  process.exit(0);
};

run().catch((e) => fail(e.stack ?? String(e)));
