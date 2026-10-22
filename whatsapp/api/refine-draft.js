// POST {subject, body, instruction} -> {subject, body}. Rewrites a venue enquiry with Claude; never sends anything.
export const config = { maxDuration: 30 };
const ORIGINS = ['https://open-venue-db.vercel.app'];
const cors = (o) => ({ 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' });
const json = (d, s, o) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...cors(o) } });
export function OPTIONS(req) { return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) }); }
export async function POST(req) {
  const o = req.headers.get('origin');
  let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, o); }
  const subject = String(b.subject || '').slice(0, 200), body = String(b.body || '').slice(0, 3000), instruction = String(b.instruction || '').slice(0, 300);
  if (!body || !instruction) return json({ error: 'body and instruction required' }, 400, o);
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return json({ error: 'agent not configured' }, 503, o);
  const system = 'You rewrite short venue-hire enquiry emails for London community organisers. Follow the user instruction for tone and content, in polite, concise British English. Keep every fact unchanged: venue name, address, dates, times, headcount, budget, equipment and any fee or minimum-spend rule. Never invent prices, amounts, dates or details that are not in the draft or instruction. Keep the sign-off name as it is. Keep the body under 1200 characters. Reply with only JSON: {"subject": "...", "body": "..."}.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 900, system, messages: [{ role: 'user', content: `Instruction: ${instruction}\n\nSubject: ${subject}\n\nBody:\n${body}` }] }) });
    if (!r.ok) return json({ error: 'agent error ' + r.status }, 502, o);
    const t = (await r.json()).content?.[0]?.text || ''; const m = t.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : t);
    return json({ subject: String(out.subject || subject).slice(0, 200), body: String(out.body || body).slice(0, 2000) }, 200, o);
  } catch (e) { return json({ error: 'agent failed' }, 502, o); }
}
