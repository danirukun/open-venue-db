// Simulated webhook payloads against the running server (dry-run). Usage: node test.js [baseUrl]
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8787';
const vt = process.env.WHATSAPP_VERIFY_TOKEN || fs.readFileSync(new URL('./.verify_token', import.meta.url), 'utf8').trim();
const v = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=${vt}&hub.challenge=12345`); console.log('verify', v.status, await v.text());
const bad = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`); console.log('bad verify', bad.status);
const msg = (id, text, extra) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messaging_product: 'whatsapp',
  messages: [{ from: '447700900123', id, timestamp: String(Math.floor(Date.now() / 1000)), ...(extra || { type: 'text', text: { body: text } }) }] } }] }] });
for (const [id, t] of [['wamid.T1', 'want to do a weekend coffee pop-up'], ['wamid.T2', 'about 25 people around Hackney, budget £150']]) {
  const r = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg(id, t)) }); console.log('post', id, r.status);
  await new Promise(r => setTimeout(r, 9000));
}
