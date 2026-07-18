// Game + /generate-avatar endpoint on ONE dev server.
// Avatar logic lives in scripts/lib/avatar_service.mjs (shared with
// the Vercel serverless function in api/generate-avatar.js).
import { defineConfig } from 'vite';
import { generateAvatarCached, MAX_BODY } from './scripts/lib/avatar_service.mjs';

function avatarMiddleware(req, res, next) {
  if (req.url !== '/generate-avatar' || req.method !== 'POST') return next();
  res.setHeader('Content-Type', 'application/json');

  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY && !aborted) {
      aborted = true;
      res.statusCode = 413;
      res.end(JSON.stringify({ error: 'image too large (10 MB max)' }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (aborted) return;
    if (!process.env.CEREBRAS_API_KEY) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'CEREBRAS_API_KEY not set on the server' }));
      return;
    }
    try {
      const { image } = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      res.end(JSON.stringify(await generateAvatarCached(image)));
    } catch (err) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
  });
}

const avatarPlugin = {
  name: 'cerebras-avatar-codegen',
  configureServer(server) { server.middlewares.use(avatarMiddleware); },
  configurePreviewServer(server) { server.middlewares.use(avatarMiddleware); },
};

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
  plugins: [avatarPlugin],
});
