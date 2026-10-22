// Local/dev server. Production: Vercel function in ./api/webhook.js.
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs';
import { handleMessage, validSig, extractMessages, llmConfig, DRY_RUN } from './core.js';
const PORT = +process.env.PORT || 8787;
const VT_FILE = new URL('./.verify_token', import.meta.url);
let VERIFY = process.env.WHATSAPP_VERIFY_TOKEN;
if (!VERIFY) { if (!fs.existsSync(VT_FILE)) fs.writeFileSync(VT_FILE, crypto.randomBytes(24).toString('hex') + '\n', { mode: 0o600 }); VERIFY = fs.readFileSync(VT_FILE, 'utf8').trim(); }
const log = (...a) => console.log(new Date().toISOString(), ...a);
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') return res.end('ok');
  if (u.pathname !== '/webhook' && u.pathname !== '/api/webhook') { res.writeHead(404); return res.end(); }
  if (req.method === 'GET') {
    if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY) { log('webhook verified'); res.writeHead(200); return res.end(u.searchParams.get('hub.challenge') || ''); }
    res.writeHead(403); return res.end();
  }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  const chunks = []; for await (const ch of req) chunks.push(ch); const raw = Buffer.concat(chunks);
  if (!validSig(raw, req.headers['x-hub-signature-256'])) { log('bad signature'); res.writeHead(401); return res.end(); }
  res.writeHead(200); res.end('EVENT_RECEIVED');
  let body; try { body = JSON.parse(raw); } catch { return; }
  for (const m of extractMessages(body)) handleMessage(m).catch(err => log('handle error', err.message));
}).listen(PORT, () => log(`whatsapp webhook on :${PORT} ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}; agent ${llmConfig()?.via || 'rule-parser'}`));
