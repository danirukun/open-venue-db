// Free-text VenueRequest agent. Provider-agnostic: any OpenAI-compatible chat/completions endpoint with tool calling.
// Config: LLM_API_KEY/LLM_BASE_URL/LLM_MODEL, or auto-detect OPENAI/XAI/GROQ/OPENROUTER/AI_GATEWAY keys.
// With no key, a rule-based parser is used so the bot still works (clearly labelled).
const PROVIDERS = [
  ['LLM_API_KEY', process.env.LLM_BASE_URL || 'https://api.openai.com/v1', process.env.LLM_MODEL || 'gpt-4o-mini'],
  ['AI_GATEWAY_API_KEY', 'https://ai-gateway.vercel.sh/v1', process.env.LLM_MODEL || 'xai/grok-4-fast-non-reasoning'],
  ['OPENAI_API_KEY', 'https://api.openai.com/v1', 'gpt-4o-mini'],
  ['XAI_API_KEY', 'https://api.x.ai/v1', 'grok-3-mini'],
  ['GROQ_API_KEY', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
  ['OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'],
];
export function llmConfig() {
  if (process.env.ANTHROPIC_API_KEY) return { anthropic: true, key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', via: 'ANTHROPIC_API_KEY' };
  for (const [k, base, model] of PROVIDERS) if (process.env[k]) return { key: process.env[k], base, model: process.env.LLM_MODEL || model, via: k };
  return null;
}
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DEALS = ['door_split','guarantee','flat_hire','bar_minimum','promoter_split'];
const ZONES = { 'east london': 'Hackney', 'west london': 'Hammersmith', 'north london': 'Camden', 'south london': 'Brixton', 'central london': 'Soho', 'london': 'Soho' };
const MUST = ['PA','projector','mics','bar','step-free','box office','wifi','stage','food'];

const TOOLS = [
  { name: 'geocode', description: 'Resolve a London area or postcode to lat/lng', parameters: { type: 'object', properties: { area: { type: 'string' } }, required: ['area'] } },
  { name: 'create_venue_request', description: 'Save the structured VenueRequest and search for top 3 venues. Call once key fields are known.',
    parameters: { type: 'object', properties: {
      event_type: { type: 'string', enum: ['meetup','show','popup'] }, date: { type: 'string', description: 'YYYY-MM-DD if specific' },
      weekday: { type: 'string', enum: DAYS }, slot: { type: 'string', enum: ['morning','afternoon','evening','late'] },
      headcount: { type: 'integer' }, budget: { type: 'number', description: 'max venue fee GBP, 0 if free/none' },
      must_haves: { type: 'array', items: { type: 'string', enum: MUST } }, area: { type: 'string' },
      deal_type: { type: 'string', enum: DEALS, description: 'e.g. "door split" -> door_split' } },
      required: ['event_type','headcount'] } },
  { name: 'search_venues', description: 'Ad-hoc venue search without saving a request', parameters: { type: 'object', properties: {
      q: { type: 'string' }, area: { type: 'string' }, min_capacity: { type: 'integer' }, max_budget: { type: 'number' }, weekday: { type: 'string', enum: DAYS } } } },
  { name: 'shortlist', description: 'Shortlist a venue id on the current request', parameters: { type: 'object', properties: { venue_id: { type: 'string' } }, required: ['venue_id'] } },
  { name: 'create_outreach_draft', description: 'Create an outreach DRAFT (pending_approval). Never sends anything.', parameters: { type: 'object', properties: { venue_id: { type: 'string' } }, required: ['venue_id'] } },
  { name: 'ask_followup', description: 'Ask the organiser ONE short question when headcount or area/date is missing', parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
].map(f => ({ type: 'function', function: f }));

const SYSTEM = `You are kanichan, the Open Venue DB assistant for London community organisers and show runners.
Turn free-text requests into a VenueRequest. event_type: meetup (talks, hack nights), show (gig, comedy, theatre), popup (1-2 day pop-up, often cafes).
Always use the ask_followup tool (never plain text) to ask questions. Required before create_venue_request: headcount AND (area OR date/weekday). If missing, call ask_followup ONCE with a single combined question; if still missing after that, assume area Shoreditch / weekday Wed.
Default slot evening (afternoon for popups), budget 0 if "free"/"no budget", budget null-equivalent 0 if unstated. Today is ${new Date().toISOString().slice(0,10)}.
Never contact venues; outreach is drafts awaiting approval. After results, you may mention the estimated total (price_est_mid x headcount, given as est_total_gbp) vs the budget, always saying it is an estimate, not a quote. Keep replies to 1-2 sentences; venue cards are shown separately.`;

// state: { messages, request: {id,...}, asked }
// Profanity filter on venue names (applies to every channel using this agent)
const BAD = /\b(f+u+c+k\w*|fuk\w*|sh[i1!]t\w*|c+u+n+t\w*|b[i1]tch\w*|wank\w*|twat\w*|bollock\w*|arse(hole)?|asshole|dick(head)?|prick|bastard|slut|whore|piss\w*|cock\w*|nigg\w*|fag\w*)/i;
export const cleanName = n => !BAD.test(String(n || '').replace(/[^a-z0-9 ]/gi, ' ')) && !BAD.test(String(n || ''));
export const filterResults = rs => (rs || []).filter(v => cleanName(v.name));
function withFilter(exec) {
  return { ...exec,
    search: async a => filterResults(await exec.search(a)),
    createAndSearch: async p => { const r = await exec.createAndSearch(p); return { ...r, results: filterResults(r.results) }; } };
}
export async function runAgent(state, userText, exec) {
  exec = withFilter(exec);
  const cfg = llmConfig();
  if (!cfg || state.mode === 'rule') return ruleAgent(state, userText, exec);
  try { return await (cfg.anthropic ? anthropicAgent : llmAgent)(state, userText, exec, cfg); }
  catch (e) { console.error('LLM failed, using rule parser:', e.message.slice(0, 160)); state.mode = 'rule'; return ruleAgent(state, userText, exec); }
}
async function llmAgent(state, userText, exec, cfg) {
  if (!state.messages) state.messages = [{ role: 'system', content: SYSTEM }];
  state.messages.push({ role: 'user', content: userText });
  const out = { text: '', results: null, requestId: state.request?.id || null, followup: false, parsed: null, via: cfg.via };
  for (let step = 0; step < 6; step++) {
    const r = await fetch(`${cfg.base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: state.messages, tools: TOOLS, temperature: 0 }) });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0,200)}`);
    const msg = (await r.json()).choices[0].message;
    state.messages.push(msg);
    if (!msg.tool_calls?.length) { out.text = msg.content || ''; return out; }
    for (const tc of msg.tool_calls) {
      let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
      let res;
      if (tc.function.name === 'ask_followup') {
        if (state.asked) res = { error: 'already asked once; use defaults' };
        else { state.asked = true; out.text = args.question; out.followup = true; res = { ok: true, note: 'question shown; wait for reply' }; }
      } else {
        try { res = await execTool(tc.function.name, args, state, exec, out); } catch (e) { res = { error: e.message }; }
      }
      state.messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res).slice(0, 4000) });
    }
    if (out.followup) return out;
  }
  return out;
}

async function execTool(name, a, state, exec, out) {
  if (name === 'geocode') return exec.geocode(a.area);
  if (name === 'create_venue_request') {
    const p = normalise(a); out.parsed = p;
    const { requestId, results, geo } = await exec.createAndSearch(p);
    state.request = { id: requestId, ...p }; out.requestId = requestId; out.results = results; out.geo = geo;
    return { request_id: requestId, results: results.map(v => ({ id: v.id, name: v.name, type: v.type, fee: v.fee_label, likely_free: v.likely_free, price_label: v.price_label, est_total_gbp: v.price_est_mid != null ? Math.round(v.price_est_mid * p.headcount) : null })), budget_gbp: p.budget };
  }
  if (name === 'search_venues') { const r = await exec.search(a); out.results = r; return r.map(v => ({ id: v.id, name: v.name })); }
  if (!state.request?.id) return { error: 'no request yet' };
  if (name === 'shortlist') return { ok: await exec.shortlist(state.request.id, a.venue_id) };
  if (name === 'create_outreach_draft') return { draft_id: await exec.draft(state.request.id, a.venue_id), status: 'pending_approval' };
  return { error: 'unknown tool' };
}

function normalise(a) {
  let weekday = DAYS.includes(a.weekday) ? a.weekday : null; const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : null;
  if (date) weekday = DAYS[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7];
  return { event_type: ['meetup','show','popup'].includes(a.event_type) ? a.event_type : 'meetup', date, weekday: weekday || 'Wed',
    slot: a.slot || (a.event_type === 'popup' ? 'afternoon' : 'evening'), deal_type: DEALS.includes(a.deal_type) ? a.deal_type : null, headcount: Math.max(1, parseInt(a.headcount) || 30), budget: Math.max(0, Number(a.budget) || 0),
    must_haves: (a.must_haves || []).filter(m => MUST.includes(m)), area: ZONES[(a.area || '').toLowerCase().trim()] || a.area || null };
}

// ---- no-key fallback: deterministic parser ----
export function ruleParse(t) {
  const s = t.toLowerCase(); const p = {};
  p.event_type = /\b(gig|comedy|stand-?up|show|concert|band|theatre|open mic|dj)\b/.test(s) ? 'show' : /\b(pop-?up|popup|market|stall|residency)\b/.test(s) ? 'popup' : 'meetup';
  const hc = s.match(/(\d{1,5})\s*(?:-|to)?\s*(?:\d{1,5}\s*)?(?:people|ppl|pax|guests|attendees|seated|standing|person|capacity|heads)/) || s.match(/(?:for|capacity|cap)\s*(?:of\s*)?~?(\d{1,5})\b/);
  if (hc) p.headcount = +hc[1];
  if (/\b(free|no budget|zero budget|£0|0 budget)\b/.test(s)) p.budget = 0;
  const b = s.match(/£\s?(\d[\d,]*)/) || s.match(/budget (?:of |is )?(\d[\d,]*)/); if (b) p.budget = +b[1].replace(/,/g, '');
  const full = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const d = s.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/); if (d) p.weekday = full[d[1]];
  if (/\bweekend\b/.test(s) && !p.weekday) p.weekday = 'Sat';
  const dt = s.match(/\b(20\d\d-\d\d-\d\d)\b/); if (dt) p.date = dt[1];
  p.slot = /\bmorning\b/.test(s) ? 'morning' : /\b(afternoon|daytime|lunch)\b/.test(s) ? 'afternoon' : /\b(late|after midnight)\b/.test(s) ? 'late' : /\b(evening|night|tonight)\b/.test(s) ? 'evening' : null;
  p.deal_type = /door[- ]?split/.test(s) ? 'door_split' : /guarantee/.test(s) ? 'guarantee' : /min(imum)? spend|bar min/.test(s) ? 'bar_minimum' : /flat (fee|hire)/.test(s) ? 'flat_hire' : /\d+\s*\/\s*\d+ split|promoter/.test(s) ? 'promoter_split' : null;
  const m = [['PA',/\b(pa|sound system|speakers)\b/],['projector',/projector|screen/],['mics',/\bmics?\b|microphone/],['bar',/\bbar\b|drinks/],
    ['step-free',/step[- ]free|wheelchair|accessib/],['box office',/box office|ticket(ing)? desk|tickets? office/],['wifi',/wi-?fi/],['stage',/\bstage\b/],['food',/\bfood|kitchen|pizza\b/]];
  p.must_haves = m.filter(([, r]) => r.test(s)).map(([k]) => k);
  const pc = t.match(/\b([A-Z]{1,2}\d[A-Z\d]?(?:\s*\d[A-Z]{2})?)\b/); 
  const area = t.match(/\b(?:in|near|around|at)\s+((?:[A-Z][a-zA-Z']+)(?:\s+[A-Z][a-zA-Z']+)*)/);
  if (pc) p.area = pc[1]; else if (area && !/^(The|A)$/.test(area[1])) p.area = area[1];
  else { const ez = s.match(/\b(east|west|north|south|central) london\b/); if (ez) p.area = { east: 'Hackney', west: 'Hammersmith', north: 'Camden', south: 'Brixton', central: 'Soho' }[ez[1]]; }
  return p;
}
async function ruleAgent(state, text, exec) {
  const prev = state.partial || {}; const now = ruleParse(text);
  const merged = { ...prev }; for (const [k, v] of Object.entries(now)) if (v != null && !(Array.isArray(v) && !v.length) && !(k === 'event_type' && prev.event_type && v === 'meetup') ) merged[k] = v;
  state.partial = merged;
  const missing = [!merged.headcount && 'how many people', !(merged.area || merged.date || merged.weekday) && 'which area or day'].filter(Boolean);
  if (missing.length && !state.asked) { state.asked = true; return { text: `Quick one: ${missing.join(' and ')}?`, followup: true, via: 'rule-parser', parsed: merged }; }
  const p = normalise({ ...merged, area: merged.area || 'Shoreditch' });
  const { requestId, results, geo } = await exec.createAndSearch(p);
  state.request = { id: requestId, ...p };
  return { text: '', results, requestId, geo, parsed: p, via: 'rule-parser (no LLM key set)' };
}

async function anthropicAgent(state, userText, exec, cfg) {
  if (!state.am) state.am = [];
  state.am.push({ role: 'user', content: userText });
  const tools = TOOLS.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  const out = { text: '', results: null, requestId: state.request?.id || null, followup: false, parsed: null, via: `anthropic:${cfg.model}`, tools: [] };
  for (let step = 0; step < 6; step++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1024, system: SYSTEM, tools, messages: state.am, temperature: 0 }) });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0,200)}`);
    const msg = await r.json();
    state.am.push({ role: 'assistant', content: msg.content });
    const uses = msg.content.filter(c => c.type === 'tool_use');
    const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
    if (!uses.length) { if (!out.followup) { out.text = text; if (!out.results) out.followup = true; } return out; }
    const results = [];
    for (const u of uses) {
      out.tools.push(u.name); let res;
      if (u.name === 'ask_followup') {
        if (state.asked) res = { error: 'already asked once; use defaults' };
        else { state.asked = true; out.text = u.input.question; out.followup = true; res = { ok: true, note: 'question shown; wait for reply' }; }
      } else { try { res = await execTool(u.name, u.input || {}, state, exec, out); } catch (e) { res = { error: e.message }; } }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(res).slice(0, 4000) });
    }
    state.am.push({ role: 'user', content: results });
    if (out.followup) return out;
  }
  return out;
}
