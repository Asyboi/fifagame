// Capture visual-check screenshots: onboarding + goal celebration.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173';

// 64x64 test "face": draw a simple face-like image via canvas in-page instead
const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#play-btn');

  // generate a synthetic face photo and hand it to the app in-page
  const tmp = path.join(os.tmpdir(), 'fable-face2.png');
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#d9a066'; x.fillRect(0, 0, 200, 200);
    x.fillStyle = '#3d2314';
    x.beginPath(); x.arc(70, 80, 12, 0, 7); x.fill();
    x.beginPath(); x.arc(130, 80, 12, 0, 7); x.fill();
    x.strokeStyle = '#3d2314'; x.lineWidth = 6;
    x.beginPath(); x.arc(100, 120, 35, 0.3, Math.PI - 0.3); x.stroke();
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(tmp, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const input = await page.$('#photo-input');
  await input.uploadFile(tmp);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: 'tests/shot-onboarding.png' });

  // enter match, then teleport ball into the net to trigger goal flow
  await page.click('#play-btn');
  await page.waitForSelector('#kickoff-btn');
  await page.click('#kickoff-btn');
  await page.waitForFunction(() => window.__fable?.match?.state === 'play', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    const m = window.__fable.match;
    const u = m.userPlayer;
    m.ball.lastTouch = u;
    m.ball.lastTouchTeam = 'home';
    m.ball.owner = null;
    m.ball.pos.set(53.2, 1, 0);
    m.ball.vel.set(5, 0, 0);
  });
  await new Promise((r) => setTimeout(r, 1600));
  await page.screenshot({ path: 'tests/shot-goal.png' });
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: 'tests/shot-replay.png' });
  await browser.close();
  console.log('screenshots written');
};
run().catch((e) => { console.error(e); process.exit(1); });
