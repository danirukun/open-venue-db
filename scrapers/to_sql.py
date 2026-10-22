"""Generate supabase/seed.sql from local data files."""
import json, sys
sys.path.insert(0,"scrapers"); from matcher import EXAMPLE_RULES
def q(x):
    if x is None: return "null"
    if isinstance(x,(int,float)): return str(x)
    if isinstance(x,list): return "array["+",".join(q(i) for i in x)+"]::text[]" if x else "null"
    return "'"+str(x).replace("'","''")+"'"
W=json.load(open("web/data.json")); ids={w["id"] for w in W}; byosm={w.get("osm_id"):w["id"] for w in W if w.get("osm_id")}
L=[]
ex=[("example-pub-backroom","EXAMPLE Pub back room","pub",51.5265,-0.0795,60),("example-cafe","EXAMPLE Cafe (evening popup)","cafe",51.5245,-0.0775,30),("example-small-theatre","EXAMPLE Small theatre","music",51.5255,-0.0760,100)]
rows=[f"({q(w['id'])},{q(w['name'])},{q(w['type'])},{q(w.get('address'))},{q(w.get('postcode'))},{w['lat']},{w['lng']},{q(w.get('osm_id'))},{q(w.get('opening_hours'))},{q(w['url'])},{q(w['basis'])},{w['events']},{q(json.dumps(w['free']))}::jsonb,{q(w['fee_label'])})" for w in W]
rows+=[f"({q(i)},{q(n)},{q(t)},'EXAMPLE DATA',null,{a},{b},null,null,null,'example',0,'{{}}'::jsonb,'example')" for i,n,t,a,b,c in ex]
L.append("insert into venues(id,name,type,address,postcode,lat,lng,osm_id,opening_hours,source_url,basis,event_count,free_grid,fee_label) values\n"+",\n".join(rows)+";")
L.append("insert into venue_features(venue_id,capacity_standing,popup_friendly,min_booking_days,max_booking_days) values "+",".join(f"({q(i)},{c},{'true' if t=='cafe' else 'false'},null,null)" for i,n,t,a,b,c in ex)+";")
L.append("insert into venue_features(venue_id,popup_friendly,min_booking_days,max_booking_days) values "+",".join(f"({q(w['id'])},true,1,2)" for w in W if w['type']=='cafe')+";")
E=[e for e in json.load(open("data/venue_events.json")) if e["venue_id"] in ids]
L.append("insert into venue_events(venue_id,source,source_url,title,starts_at,ends_at,weekday,slot) values "+",".join(f"({q(e['venue_id'])},{q(e['source'])},{q(e['url'])},{q(e['title'])},{q(e['start'])},{q(e['end'])},{q(e['weekday'])},{q(e['slot'])})" for e in E)+" on conflict do nothing;")
R=[r for r in json.load(open("data/pricing_rules_extracted.json")) if r["osm_id"] in byosm]
L.append("insert into pricing_rules(venue_id,kind,condition_type,threshold,snippet,source_url,confidence,is_example) values "+",".join(f"({q(byosm[r['osm_id']])},'waive','min_spend',{q(r['threshold'])},{q(r['snippet'])},{q(r['source_url'])},{r['confidence']},false)" for r in R)+";")
L.append("insert into pricing_rules(venue_id,kind,condition_type,threshold,applies_days,time_window,fallback_fee,discount_pct,cap,per_head,confidence,is_example) values "+",".join(f"({q(r['venue_id'])},{q(r['kind'])},{q(r['condition_type'])},{r['threshold']},{q(r['applies_days'])},{q(r['time_window'])},{r['fallback_fee']},{q(r.get('discount_pct'))},{q(r.get('cap'))},{q(r.get('per_head'))},1,true)" for r in EXAMPLE_RULES)+";")
A=[]
for v in json.load(open("data/venues.json")):
    if v["id"] in ids: A+= [f"({q(v['id'])},{q(a['date'])},{q(a['slot'])},{a['likely_free']},{'true' if a['known_event'] else 'false'})" for a in v["availability_inferred"]]
L.append("insert into availability_inferred(venue_id,date,slot,likely_free,known_event) values "+",".join(A)+";")
open("supabase/seed.sql","w").write("\n".join(L)); print(len(W)+3,len(E),len(R),len(A))
