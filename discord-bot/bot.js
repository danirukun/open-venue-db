// Offpeak — Discord bot (kanichan). MIT.
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { runAgent, llmConfig, filterResults } from './agent.js';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SB_URL = process.env.SUPABASE_URL || 'https://bwkxqyhycuwqpuieggbt.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62';
const MAP_URL = 'https://open-venue-db.vercel.app';
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN missing'); process.exit(1); }

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SLOTS = ['morning','afternoon','evening','late'];
const MUST = ['PA','projector','mics','bar','step-free','box office','wifi','stage','food'];
const TYPES = { meetup: null, show: ['pub','bar','event_venue','theatre','music_venue','arts_centre','nightclub'], popup: ['cafe','pub','bar'] };

async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0,200)}`); return t ? JSON.parse(t) : null;
}

async function geocode(area) {
  if (!area) return { lat: 51.524, lng: -0.08, label: 'Shoreditch (default)' };
  const pc = area.replace(/\s+/g,'');
  try {
    if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?(\d[A-Za-z]{2})?$/.test(pc)) {
      const u = pc.length > 4 ? `https://api.postcodes.io/postcodes/${pc}` : `https://api.postcodes.io/outcodes/${pc}`;
      const j = await (await fetch(u)).json();
      if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: area.toUpperCase() };
    }
    const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(area + ', London')}`,
      { headers: { 'User-Agent': 'open-venue-db-hackathon/0.1 (github.com/danirukun/open-venue-db)' } })).json();
    if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name.split(',').slice(0,2).join(',') };
  } catch (e) { console.error('geocode', e.message); }
  return { lat: 51.524, lng: -0.08, label: `${area} (not found, using Shoreditch)` };
}

const isExample = v => /example|demo|sample/i.test(`${v.id} ${v.name} ${v.fee_label||''}`);
function embedFor(v, i, ctx = {}) {
  const e = new EmbedBuilder().setColor(isExample(v) ? 0xf59e0b : 0x2563eb)
    .setTitle(`${i+1}. ${v.name}${isExample(v) ? '  ⚠️ EXAMPLE' : ''}`.slice(0,256))
    .addFields(
      { name: 'Type', value: v.type || '?', inline: true },
      { name: 'Distance', value: v.distance_m != null ? `${(v.distance_m/1000).toFixed(1)} km` : '?', inline: true },
      { name: 'Likely free', value: v.likely_free != null ? `${Math.round(v.likely_free*100)}% (estimate)` : '?', inline: true },
      { name: 'Capacity', value: v.capacity ? `~${v.capacity}` : 'unknown', inline: true },
      { name: 'Fee', value: v.fee_label || 'fee unknown', inline: true },
      { name: 'Est. price', value: (v.price_label || 'price unknown').slice(0, 1000) });
  if (v.price_est_mid != null && ctx.headcount) {
    const tot = Math.round(v.price_est_mid * ctx.headcount);
    e.addFields({ name: 'Est. total', value: `~£${tot} (£${v.price_est_mid}/head mid × ${ctx.headcount})` + (ctx.budget != null ? ` vs £${ctx.budget} budget — ${tot <= ctx.budget ? 'within' : 'over'}` : '') + ' · not a quote' });
  }
  if (v.source_url && /^https?:\/\//.test(v.source_url)) e.setURL(v.source_url).addFields({ name: 'Source', value: v.source_url.slice(0,1000) });
  if (isExample(v)) e.setFooter({ text: 'Example/demo data — not a real venue offer' });
  return e;
}
function buttons(reqId, list) {
  return list.map((v, i) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sl|${reqId}|${v.id}`.slice(0,100)).setLabel(`Shortlist #${i+1}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`od|${reqId}|${v.id}`.slice(0,100)).setLabel(`Draft outreach #${i+1}`).setStyle(ButtonStyle.Secondary)));
}

const commands = [
  new SlashCommandBuilder().setName('venue-request').setDescription('Post a VenueRequest and get matched venues')
    .addStringOption(o => o.setName('event_type').setDescription('What kind of event').setRequired(true)
      .addChoices({ name: 'Meetup / talk', value: 'meetup' }, { name: 'Show / gig / comedy', value: 'show' }, { name: 'Pop-up (1–2 days)', value: 'popup' }))
    .addIntegerOption(o => o.setName('headcount').setDescription('Expected people').setRequired(true).setMinValue(1).setMaxValue(20000))
    .addNumberOption(o => o.setName('budget').setDescription('Max venue fee in £ (0 = free/bar-minimum only)').setRequired(true).setMinValue(0))
    .addStringOption(o => o.setName('area').setDescription('Postcode or area, e.g. EC2A or Shoreditch'))
    .addStringOption(o => o.setName('weekday').setDescription('Preferred weekday (or give a date)').addChoices(...DAYS.map(d => ({ name: d, value: d }))))
    .addStringOption(o => o.setName('date').setDescription('Specific date YYYY-MM-DD (overrides weekday)'))
    .addStringOption(o => o.setName('slot').setDescription('Time of day').addChoices(...SLOTS.map(s => ({ name: s, value: s }))))
    .addIntegerOption(o => o.setName('radius_km').setDescription('Search radius km (default 3)').setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder().setName('venue-search').setDescription('Quick venue search')
    .addStringOption(o => o.setName('query').setDescription('Name or keywords, e.g. "pub", "theatre"'))
    .addStringOption(o => o.setName('area').setDescription('Postcode or area'))
    .addIntegerOption(o => o.setName('capacity').setDescription('Min capacity').setMinValue(1))
    .addStringOption(o => o.setName('weekday').setDescription('Weekday').addChoices(...DAYS.map(d => ({ name: d, value: d })))),
  new SlashCommandBuilder().setName('venue-ask').setDescription('Describe your event in plain English')
    .addStringOption(o => o.setName('text').setDescription('e.g. comedy night, 80 seated, Tuesday, needs PA, East London').setRequired(true)),
].map(c => c.toJSON());

const pending = new Map(); // interaction-scoped draft requests awaiting must-haves

async function runSearch(p) {
  return filterResults(await rpc('search_venues', { q: p.q || null, lat: p.lat, lng: p.lng, radius_m: p.radius_m || 3000, min_capacity: p.min_capacity ?? null,
    max_budget: p.max_budget ?? null, weekday: p.weekday || 'Wed', slot: p.slot || 'evening', types: p.types ?? null, lim: 6 })).slice(0, 3);
}

const exec = (userId) => ({
  geocode,
  search: async a => { const g = await geocode(a.area); return runSearch({ q: a.q, lat: g.lat, lng: g.lng, min_capacity: a.min_capacity, max_budget: a.max_budget, weekday: a.weekday, radius_m: 5000 }); },
  createAndSearch: async p => {
    const g = await geocode(p.area); const radius_m = 3000;
    const requestId = await rpc('create_venue_request', { p_discord_user_id: userId, p_event_type: p.event_type, p_headcount: p.headcount, p_budget: p.budget,
      p_date_from: p.date, p_flexible_days: p.date ? null : [p.weekday], p_slot: p.slot, p_lat: g.lat, p_lng: g.lng, p_area: g.label, p_must_have: p.must_haves, p_radius_m: radius_m });
    const base = { lat: g.lat, lng: g.lng, radius_m, min_capacity: p.headcount, max_budget: p.budget, weekday: p.weekday, slot: p.slot };
    let results = await runSearch({ ...base, types: TYPES[p.event_type] }); if (!results?.length) results = await runSearch(base);
    if (p.deal_type) await rpc('set_request_deal', { p_request_id: requestId, p_discord_user_id: userId, p_deal_type: p.deal_type }).catch(() => {});
    return { requestId, results: results || [], geo: g };
  },
  shortlist: (rid, vid) => rpc('shortlist_venue', { p_request_id: rid, p_discord_user_id: userId, p_venue_id: vid }),
  draft: (rid, vid) => rpc('create_outreach_draft', { p_request_id: rid, p_discord_user_id: userId, p_venue_id: vid }),
});
const convo = new Map(); // key: thread/channel(+user) -> agent state
function agentPayload(out, userId) {
  if (out.followup || !out.results) return { content: out.text || 'Tell me headcount, area and day.' };
  const p = out.parsed || {};
  const head = `📍 <@${userId}> VenueRequest: **${p.headcount}** · **${p.event_type}** · £${p.budget} · ${p.date || p.weekday} ${p.slot} · near ${out.geo?.label || p.area}` +
    (p.must_haves?.length ? ` · needs ${p.must_haves.join(', ')}` : '') + (p.deal_type ? ` · deal ${p.deal_type.replace('_',' ')}` : '') + (out.requestId ? `\nRequest \`${String(out.requestId).slice(0,8)}\`` : '') +
    ` · estimates only · [map](${MAP_URL})` + (out.text ? `\n${out.text}` : '');
  if (!out.results.length) return { content: head + '\nNo matches yet — try a bigger area.' };
  return { content: head, embeds: out.results.slice(0,3).map((v, i) => embedFor(v, i, p)), components: out.requestId ? buttons(out.requestId, out.results.slice(0,3)) : [] };
}
async function ask(key, userId, text) {
  const st = convo.get(key) || {}; st.user = userId; st.ts = Date.now(); convo.set(key, st);
  const out = await runAgent(st, text, exec(userId));
  if (!out.followup) st.done = true;
  console.log(new Date().toISOString(), 'agent', out.via, JSON.stringify(out.parsed || {}), out.followup ? 'FOLLOWUP' : '');
  return agentPayload(out, userId);
}
setInterval(() => { for (const [k, v] of convo) if (Date.now() - v.ts > 30 * 60e3) convo.delete(k); }, 60e3);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.on('messageCreate', async (m) => {
  if (m.author.bot) return;
  const mentioned = m.mentions.users.has(client.user.id);
  const key = m.channel.isThread() ? m.channel.id : `${m.channel.id}:${m.author.id}`;
  const st = convo.get(key);
  const awaiting = st && !st.done && st.user === m.author.id;
  if (!mentioned && !awaiting) return;
  const text = m.content.replace(/<@!?\d+>/g, '').trim(); if (!text) return m.reply('Describe your event, e.g. "40-person meetup Wed in Shoreditch, free, need a projector".');
  try {
    await m.channel.sendTyping().catch(() => {});
    if (mentioned && st?.done) convo.delete(key); // new request
    const payload = await ask(key, m.author.id, text);
    await m.reply(payload);
  } catch (e) { console.error(e); m.reply('Something went wrong, try /venue-request.').catch(() => {}); }
});
client.once('clientReady', async () => {
  console.log(new Date().toISOString(), `online as ${client.user.tag}; guilds: ${client.guilds.cache.map(g => g.name).join(', ') || '(none)'}`);
  const rest = new REST().setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  for (const g of client.guilds.cache.values()) await rest.put(Routes.applicationGuildCommands(client.user.id, g.id), { body: [] }).catch(() => {});
  console.log('commands registered (global); agent:', llmConfig()?.via || 'rule-parser (no LLM key)');
});
client.on('guildCreate', g => console.log(new Date().toISOString(), 'joined guild', g.name));

client.on('interactionCreate', async (it) => {
  try {
    if (it.isChatInputCommand() && it.commandName === 'venue-search') {
      await it.deferReply();
      const g = await geocode(it.options.getString('area'));
      const res = await runSearch({ q: it.options.getString('query'), lat: g.lat, lng: g.lng, min_capacity: it.options.getInteger('capacity'),
        weekday: it.options.getString('weekday') || 'Wed', radius_m: 5000 });
      if (!res?.length) return it.editReply(`No venues found near ${g.label}. Try a bigger area or fewer filters.`);
      return it.editReply({ content: `Top ${res.length} near **${g.label}** · [map](${MAP_URL})`, embeds: res.map(embedFor) });
    }
    if (it.isChatInputCommand() && it.commandName === 'venue-ask') {
      await it.deferReply();
      const key = `${it.channelId}:${it.user.id}`; convo.delete(key);
      const payload = await ask(key, it.user.id, it.options.getString('text'));
      if (convo.get(key) && !convo.get(key).done) payload.content += '\n_(reply in this channel — no @ needed)_';
      return it.editReply(payload);
    }
    if (it.isChatInputCommand() && it.commandName === 'venue-request') {
      const o = it.options; const date = o.getString('date');
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return it.reply({ content: 'Date must be YYYY-MM-DD.', flags: MessageFlags.Ephemeral });
      const weekday = date ? DAYS[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7] : (o.getString('weekday') || 'Wed');
      const key = it.id;
      pending.set(key, { user: it.user.id, event_type: o.getString('event_type'), headcount: o.getInteger('headcount'), budget: o.getNumber('budget'),
        area: o.getString('area'), date, weekday, slot: o.getString('slot') || 'evening', radius_m: (o.getInteger('radius_km') || 3) * 1000 });
      setTimeout(() => pending.delete(key), 15 * 60e3);
      const sel = new StringSelectMenuBuilder().setCustomId(`mh|${key}`).setPlaceholder('Must-haves (pick any, or none)').setMinValues(0).setMaxValues(MUST.length)
        .addOptions(MUST.map(m => ({ label: m, value: m })));
      return it.reply({ content: `Got it: **${o.getInteger('headcount')}**-person **${o.getString('event_type')}**, £${o.getNumber('budget')} budget, ${date || weekday} ${o.getString('slot') || 'evening'}.\nLast step: what's non-negotiable?`,
        components: [new ActionRowBuilder().addComponents(sel), new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`go|${key}`).setLabel('No must-haves, search now').setStyle(ButtonStyle.Success))],
        flags: MessageFlags.Ephemeral });
    }
    if ((it.isStringSelectMenu() || it.isButton()) && /^(mh|go)\|/.test(it.customId)) {
      const key = it.customId.split('|')[1]; const p = pending.get(key);
      if (!p) return it.reply({ content: 'That request expired — run /venue-request again.', flags: MessageFlags.Ephemeral });
      if (p.user !== it.user.id) return it.reply({ content: 'Not your request.', flags: MessageFlags.Ephemeral });
      pending.delete(key);
      const must = it.isStringSelectMenu() ? it.values : [];
      await it.update({ content: `Searching… (must-haves: ${must.join(', ') || 'none'})`, components: [] });
      const g = await geocode(p.area);
      const reqId = await rpc('create_venue_request', { p_discord_user_id: p.user, p_event_type: p.event_type, p_headcount: p.headcount, p_budget: p.budget,
        p_date_from: p.date, p_flexible_days: p.date ? null : [p.weekday], p_slot: p.slot, p_lat: g.lat, p_lng: g.lng, p_area: g.label, p_must_have: must, p_radius_m: p.radius_m });
      let res = await runSearch({ lat: g.lat, lng: g.lng, radius_m: p.radius_m, min_capacity: p.headcount, max_budget: p.budget, weekday: p.weekday, slot: p.slot, types: TYPES[p.event_type] });
      if (!res?.length && TYPES[p.event_type]) res = await runSearch({ lat: g.lat, lng: g.lng, radius_m: p.radius_m, min_capacity: p.headcount, max_budget: p.budget, weekday: p.weekday, slot: p.slot });
      const head = `📍 <@${p.user}> posted a VenueRequest: **${p.headcount}** people · **${p.event_type}** · £${p.budget} · ${p.date || p.weekday} ${p.slot} · near ${g.label}` +
        (must.length ? ` · needs ${must.join(', ')}` : '') + `\nRequest \`${String(reqId).slice(0,8)}\` · availability & capacity are estimates · [map](${MAP_URL})`;
      if (!res?.length) return it.followUp(head + '\nNo matches yet — try a larger radius.');
      return it.followUp({ content: head + (must.length ? '\n_Must-haves are recorded on the request; feature data is still sparse, so confirm with the venue._' : ''),
        embeds: res.map((v, i) => embedFor(v, i, p)), components: buttons(reqId, res) });
    }
    if (it.isButton() && /^(sl|od)\|/.test(it.customId)) {
      const [kind, reqId, venueId] = it.customId.split('|');
      await it.deferReply({ flags: MessageFlags.Ephemeral });
      if (kind === 'sl') {
        const ok = await rpc('shortlist_venue', { p_request_id: reqId, p_discord_user_id: it.user.id, p_venue_id: venueId });
        return it.editReply(ok ? '⭐ Added to your shortlist.' : 'Only the person who posted this request can shortlist.');
      }
      try {
        const id = await rpc('create_outreach_draft', { p_request_id: reqId, p_discord_user_id: it.user.id, p_venue_id: venueId });
        return it.editReply(`✉️ Outreach draft #${id} created with status **pending_approval**. Nothing has been sent — an organiser must approve it first.`);
      } catch (e) { return it.editReply(/request not found/.test(e.message) ? 'Only the person who posted this request can draft outreach.' : 'Could not create draft.'); }
    }
  } catch (e) {
    console.error(new Date().toISOString(), e);
    const msg = { content: 'Something went wrong, try again.', flags: MessageFlags.Ephemeral };
    if (it.deferred || it.replied) it.followUp(msg).catch(() => {}); else if (it.isRepliable()) it.reply(msg).catch(() => {});
  }
});
process.on('unhandledRejection', e => console.error('unhandled', e));
client.login(TOKEN);
