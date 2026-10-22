// Open Venue DB — WhatsApp Cloud API webhook for the venue agent. MIT. Zero deps (Node 20).
// Replies ONLY to the inbound sender, inside the 24h service window. No templates, no other outbound. Never contacts venues.
import crypto from 'node:crypto';
import { runAgent, llmConfig, filterResults } from './agent.js';
export { llmConfig };

const PORT = +process.env.PORT || 8787;
const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v23.0'}`;
const TOKEN = process.env.WHATSAPP_TOKEN, PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID, APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const DRY = !TOKEN || !PHONE_ID;
export const DRY_RUN = DRY;
const SB_URL = process.env.SUPABASE_URL || 'https://bwkxqyhycuwqpuieggbt.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62';
const MAP_URL = 'https://open-venue-db.vercel.app';
const TYPES = { meetup: null, show: ['pub','bar','event_venue','theatre','music_venue','arts_centre','nightclub'], popup: ['cafe','pub','bar'] };
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0,200)}`); return t ? JSON.parse(t) : null;
}
const ZONES = { 'east london': 'Hackney', 'west london': 'Hammersmith', 'north london': 'Camden', 'south london': 'Brixton', 'central london': 'Soho' };
async function geocode(area) {
  if (!area) return { lat: 51.524, lng: -0.08, label: 'Shoreditch (default)' };
  area = ZONES[area.toLowerCase().trim()] || area; const pc = area.replace(/\s+/g, '');
  try {
    if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?(\d[A-Za-z]{2})?$/.test(pc)) {
      const j = await (await fetch(`https://api.postcodes.io/${pc.length > 4 ? 'postcodes' : 'outcodes'}/${pc}`)).json();
      if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: area.toUpperCase() };
    }
    const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(area + ', London')}`, { headers: { 'User-Agent': 'open-venue-db-hackathon/0.1' } })).json();
    if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name.split(',').slice(0, 2).join(',') };
  } catch (e) { log('geocode', e.message); }
  return { lat: 51.524, lng: -0.08, label: `${area} (not found, using Shoreditch)` };
}
const search = async p => filterResults(await rpc('search_venues', { q: p.q || null, lat: p.lat, lng: p.lng, radius_m: p.radius_m || 3000, min_capacity: p.min_capacity ?? null, max_budget: p.max_budget ?? null, weekday: p.weekday || 'Wed', slot: p.slot || 'evening', types: p.types ?? null, lim: 6 })).slice(0, 3);
const uid = wa => `wa:${wa}`;
const exec = wa => ({
  geocode,
  search: async a => { const g = await geocode(a.area); return search({ ...a, lat: g.lat, lng: g.lng, radius_m: 5000 }); },
  createAndSearch: async p => {
    const g = await geocode(p.area);
    const requestId = await rpc('create_venue_request', { p_discord_user_id: uid(wa), p_event_type: p.event_type, p_headcount: p.headcount, p_budget: p.budget,
      p_date_from: p.date, p_flexible_days: p.date ? null : [p.weekday], p_slot: p.slot, p_lat: g.lat, p_lng: g.lng, p_area: g.label, p_must_have: p.must_haves, p_radius_m: 3000 });
    if (p.deal_type) await rpc('set_request_deal', { p_request_id: requestId, p_discord_user_id: uid(wa), p_deal_type: p.deal_type }).catch(() => {});
    const base = { lat: g.lat, lng: g.lng, min_capacity: p.headcount, max_budget: p.budget, weekday: p.weekday, slot: p.slot };
    let results = await search({ ...base, types: TYPES[p.event_type] }); if (!results?.length) results = await search(base);
    return { requestId, results: results || [], geo: g };
  },
  shortlist: (rid, vid) => rpc('shortlist_venue', { p_request_id: rid, p_discord_user_id: uid(wa), p_venue_id: vid }),
  draft: (rid, vid) => rpc('create_outreach_draft', { p_request_id: rid, p_discord_user_id: uid(wa), p_venue_id: vid }),
});

export const sent = []; // dry-run outbox (for tests)
async function graph(body) {
  if (DRY) { sent.push(body); log('DRY-RUN send', JSON.stringify(body).slice(0, 600)); return { dry: true }; }
  const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) log('graph error', r.status, t.slice(0, 300)); return t;
}
const sendText = (to, body) => graph({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: body.replace(/\*\*/g, '*').slice(0, 4096) } });
const markRead = id => graph({ messaging_product: 'whatsapp', status: 'read', message_id: id });

const isExample = v => /example|demo|sample/i.test(`${v.id} ${v.name}`);
function venueText(v, i, p) {
  const tot = v.price_est_mid != null && p.headcount ? `\nEst. total ~£${Math.round(v.price_est_mid * p.headcount)} vs £${p.budget} budget (not a quote)` : '';
  return `*${i + 1}. ${v.name}*${isExample(v) ? ' ⚠️ EXAMPLE (demo data)' : ''}\n${v.type || 'venue'} · ${v.distance_m != null ? (v.distance_m / 1000).toFixed(1) + ' km' : ''} · likely free ${v.likely_free != null ? Math.round(v.likely_free * 100) + '%' : '?'} (estimate)\n` +
    `Capacity ${v.capacity ? '~' + v.capacity : 'unknown'} · ${v.fee_label || 'fee unknown'}\n${v.price_label || 'price unknown (not a quote)'}${tot}` + (v.source_url ? `\n${v.source_url}` : '');
}

// Session store: Supabase (wa_sessions via key-guarded RPC) when WA_SESSION_KEY is set, else in-memory.
const mem = new Map();
const SESSION_KEY = process.env.WA_SESSION_KEY;
async function loadSession(from) {
  if (SESSION_KEY) { try { const st = await rpc('wa_get_session', { p_key: SESSION_KEY, p_sender: from }); if (st) return st; } catch (e) { log('session load', e.message); } return { state: {} }; }
  const c = mem.get(from); return c && Date.now() - c.ts < 30 * 60e3 ? c : { state: {} };
}
async function saveSession(from, c) {
  c.ts = Date.now();
  if (SESSION_KEY) { const st = { ...c.state }; if (st.am) st.am = st.am.slice(-16); if (st.messages) st.messages = st.messages.slice(-16);
    return rpc('wa_save_session', { p_key: SESSION_KEY, p_sender: from, p_state: { state: st, ts: c.ts } }).catch(e => log('session save', e.message)); }
  mem.set(from, c);
}

export async function handleMessage(m) {
  const from = m.from; await markRead(m.id);
  if (m.type === 'interactive' && m.interactive?.button_reply) {
    const [kind, rid, vid] = m.interactive.button_reply.id.split('|');
    try {
      if (kind === 'sl') return sendText(from, (await exec(from).shortlist(rid, vid)) ? '⭐ Added to your shortlist.' : 'Could not shortlist (request not found).');
      if (kind === 'od') { const id = await exec(from).draft(rid, vid); return sendText(from, `✉️ Outreach draft #${id} saved as *pending approval*. Nothing has been sent to the venue.`); }
    } catch (e) { log('button', e.message); return sendText(from, 'Sorry, that did not work.'); }
    return;
  }
  if (m.type !== 'text') return sendText(from, 'Send me a text like: "40-person meetup Wed evening in Shoreditch, free, need a projector".');
  let c = await loadSession(from); if (!c.state || c.state.done || /^(new|reset)$/i.test(m.text.body.trim())) c = { state: {} };
  const out = await runAgent(c.state, m.text.body, exec(from));
  if (out.followup || !out.results) await saveSession(from, c);
  log('agent', out.via, JSON.stringify(out.parsed || {}), out.followup ? 'FOLLOWUP' : '');
  if (out.followup || !out.results) return sendText(from, out.text || 'How many people, and which area/day?');
  c.state.done = true; await saveSession(from, c);
  const p = out.parsed || {};
  const head = `📍 VenueRequest: ${p.headcount} people · ${p.event_type} · £${p.budget} · ${p.date || p.weekday} ${p.slot} · near ${out.geo?.label || p.area}` +
    (p.must_haves?.length ? ` · needs ${p.must_haves.join(', ')}` : '') + (p.deal_type ? ` · ${p.deal_type.replace('_', ' ')}` : '') +
    (out.text ? `\n\n${out.text}` : '') + `\n\nAvailability, capacity and prices are estimates. Map: ${MAP_URL}`;
  await sendText(from, head);
  if (!out.results.length) return sendText(from, 'No matches yet — try a bigger area.');
  for (const [i, v] of out.results.slice(0, 3).entries()) {
    await graph({ messaging_product: 'whatsapp', recipient_type: 'individual', to: from, type: 'interactive', interactive: { type: 'button',
      body: { text: venueText(v, i, p).slice(0, 1024) }, footer: { text: 'Open Venue DB · not a quote' },
      action: { buttons: [ { type: 'reply', reply: { id: `sl|${out.requestId}|${v.id}`.slice(0, 256), title: 'Shortlist' } },
                           { type: 'reply', reply: { id: `od|${out.requestId}|${v.id}`.slice(0, 256), title: 'Draft outreach' } } ] } } });
  }
}

export function validSig(raw, header, secret = APP_SECRET) {
  if (!secret) return true;
  if (!header?.startsWith('sha256=')) return false;
  const exp = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(header); return exp.length === got.length && crypto.timingSafeEqual(exp, got);
}
const seen = new Set();
export function extractMessages(body) {
  const out = [];
  for (const e of body.entry || []) for (const ch of e.changes || []) for (const m of ch.value?.messages || []) {
    if (seen.has(m.id)) continue; seen.add(m.id); if (seen.size > 5000) seen.clear();
    if (m.timestamp && Date.now() / 1000 - +m.timestamp > 23 * 3600) { log('skip stale message'); continue; } // 24h service window
    out.push(m);
  }
  return out;
}
