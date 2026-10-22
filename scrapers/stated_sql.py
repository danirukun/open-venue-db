"""data/london/site_*.json -> supabase/london/stated_all.sql (stated capacity from venue sites, high confidence)."""
import json, glob
q=lambda s:"null" if s is None else (str(s) if isinstance(s,(int,float)) else "'"+str(s).replace("'","''")+"'")
R=list({r["id"]:r for f in sorted(glob.glob("data/london/site_*.json")) for r in json.load(open(f)) if r["cap"]}.values())
open("supabase/london/stated_all.sql","w").write("insert into venue_features(venue_id,capacity_standing,capacity_seated,capacity_method,capacity_confidence) values "+",".join(f"({q(r['id'])},{q(r['cap']['standing'])},{q(r['cap']['seated'])},{q('stated on venue site ('+r['cap']['source_url']+')')},'high')" for r in R)+" on conflict (venue_id) do update set capacity_standing=excluded.capacity_standing,capacity_seated=excluded.capacity_seated,capacity_method=excluded.capacity_method,capacity_confidence='high';")
print(len(R))
