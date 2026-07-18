// Vercel serverless function: POST /api/generate-avatar
// Same brain as the dev middleware; see scripts/lib/avatar_service.mjs.
import { generateAvatarCached } from '../scripts/lib/avatar_service.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!process.env.CEREBRAS_API_KEY) {
    return res.status(503).json({ error: 'CEREBRAS_API_KEY not set on the server' });
  }
  try {
    const result = await generateAvatarCached(req.body?.image);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
