"""Generate DRAFT outreach (never sent) for a venue_request's top N matches. Output: supabase/outreach_seed.sql.
Only published business contacts (venue website / contact page). Status = pending_approval; a human must approve."""
import json, sys, requests
SB="https://bwkxqyhycuwqpuieggbt.supabase.co"; KEY="sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62"
REQ=dict(id="00000000-0000-4000-8000-000000000001", event_type="community tech meetup", headcount=45, budget_gbp=0,
         weekday="Wed", slot="evening", lat=51.5255, lng=-0.0785, organiser="the Open Venue DB demo organiser")
N=int(sys.argv[1]) if len(sys.argv)>1 else 8
res=requests.post(SB+"/rest/v1/rpc/search_venues",headers={"apikey":KEY,"Content-Type":"application/json"},
    json=dict(lat=REQ["lat"],lng=REQ["lng"],radius_m=1500,min_capacity=REQ["headcount"],max_budget=REQ["budget_gbp"],weekday=REQ["weekday"],slot=REQ["slot"],lim=40)).json()
picks=[r for r in res if r["source_url"] and r["source_url"].startswith("http") and "lu.ma" not in r["source_url"] and "meetup.com" not in r["source_url"] and not r["name"].startswith("EXAMPLE")][:N]
q=lambda s:"null" if s is None else "'"+str(s).replace("'","''")+"'"
rows=[]
for r in picks:
    cap=f" Our estimate puts your space at {r['capacity']} people, which fits." if r.get("capacity") else ""
    body=f"""Hi {r['name']} team,

I'm organising a {REQ['event_type']} for about {REQ['headcount']} people and I'm looking for a {REQ['weekday']} {REQ['slot']} slot in the next few weeks.{cap} We'd buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we'd need: space for {REQ['headcount']}, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {{CLAIM_LINK}}

Thanks,
{{ORGANISER_NAME}}

If you'd rather not get messages like this, reply "opt out" and we'll remove your venue from outreach."""
    subj=f"Midweek event enquiry: {REQ['headcount']} people, {REQ['weekday']} {REQ['slot']}"
    rows.append(f"({q(r['id'])},{q(REQ['id'])},'website_contact',{q(r['source_url'])},{q(subj)},{q(body)},'pending_approval')")
sql=f"""insert into venue_requests(id,event_type,headcount,budget_gbp,flexible_days,lat,lng,radius_m,must_have,status)
values ({q(REQ['id'])},{q(REQ['event_type'])},{REQ['headcount']},{REQ['budget_gbp']},array['We'],{REQ['lat']},{REQ['lng']},1500,array['projector'],'open') on conflict (id) do nothing;
delete from outreach_drafts where request_id={q(REQ['id'])} and status='pending_approval';
insert into outreach_drafts(venue_id,request_id,channel,to_contact,subject,body,status) values {",".join(rows)};"""
open("supabase/outreach_seed.sql","w").write(sql); print(len(rows),"drafts"); print(picks[0]["name"] if picks else None)
