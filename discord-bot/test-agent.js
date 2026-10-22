// Offline agent test: real parsing + geocode + Supabase search, no Discord. Request rows tagged discord_user_id='agent-test'.
import { runAgent } from './agent.js';
const SB='https://bwkxqyhycuwqpuieggbt.supabase.co/rest/v1/rpc/', K='sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62';
const rpc=async(f,a)=>(await fetch(SB+f,{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify(a)})).json();
const geo=async a=>{const j=await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q='+encodeURIComponent(a+', London'),{headers:{'User-Agent':'open-venue-db-test'}})).json();return j[0]?{lat:+j[0].lat,lng:+j[0].lon,label:a}:{lat:51.524,lng:-0.08,label:'Shoreditch'}};
const exec={geocode:geo,createAndSearch:async p=>{const g=await geo(p.area);return{requestId:'dry-run',geo:g,results:await rpc('search_venues',{lat:g.lat,lng:g.lng,min_capacity:p.headcount,max_budget:p.budget,weekday:p.weekday,slot:p.slot,types:p.event_type==='popup'?['cafe','pub','bar']:p.event_type==='show'?['pub','bar','event_venue','theatre','music_venue','arts_centre','nightclub']:null,lim:3})}}};
for (const conv of [["I run a 40 person tech meetup, zero budget, need a projector and wifi on a Wednesday evening in Shoreditch"],
  ["Comedy night, 80 seated, Tuesday, door split, needs mics and a PA, East London"],
  ["want to do a weekend coffee pop-up", "about 25 people, around Hackney, budget £150"]]) {
  const st={}; for (const t of conv){const o=await runAgent(st,t,exec);console.log('>',t);console.log(o.followup?'  FOLLOWUP: '+o.text:'  PARSED: '+JSON.stringify(o.parsed)+'\n  TOP: '+(o.results||[]).map(v=>`${v.name} [${v.type}] ${v.fee_label}`).join(' | '));}
}
