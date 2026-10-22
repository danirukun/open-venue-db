"""Estimate capacity: stated (venue site) > OSM building footprint heuristic. Writes supabase/capacity_seed.sql."""
import json
from shapely.geometry import Point, Polygon
from pyproj import Transformer
T=Transformer.from_crs(4326,27700,always_xy=True)
W=json.load(open("web/data.json")); B=json.load(open("data/buildings.json"))
stated={s["id"]:s for s in json.load(open("data/stated_capacity.json"))}
polys=[]
for k,b in B.items():
    if len(b["geom"])<4: continue
    try: polys.append((Polygon([T.transform(lo,la) for la,lo in b["geom"]]),b["tags"]))
    except Exception: pass
USE={"cafe":0.55,"pub":0.5,"bar":0.5}
res={}
for w in W:
    if w["id"] in stated:
        s=stated[w["id"]]; res[w["id"]]=dict(smin=s["standing"],smax=s["standing"],emin=s["seated"],emax=s["seated"],m2=None,lv=None,
            method=f"stated on venue site ({s['source_url']})",conf="high"); continue
    p=Point(*T.transform(w["lng"],w["lat"]))
    cont=[(pg,t) for pg,t in polys if pg.contains(p)]
    near=cont or sorted([(pg,t) for pg,t in polys if pg.distance(p)<15],key=lambda x:x[0].distance(p))[:1]
    if not near: continue
    pg,t=min(near,key=lambda x:x[0].area); a=pg.area
    if a<15 or a>5000: continue
    try: lv=int(float(t.get("building:levels","")))
    except ValueError: lv=None
    # assume venue occupies ground floor only; levels noted but not multiplied (shared buildings)
    big=a>600  # large footprint = likely a shared/multi-unit building; cap the area and lower confidence
    u=min(a,600 if w["type"] in USE else 1500)*USE.get(w["type"],0.6)
    res[w["id"]]=dict(smin=int(u/0.5*0.6),smax=int(u/0.5),emin=int(u/1.2*0.6),emax=int(u/1.2),m2=round(a),lv=lv,
        method=("footprint contains point" if cont else "nearest footprint <15m")+("; footprint >600m2, capped (shared building?)" if big else "")+f"; usable {USE.get(w['type'],0.6):.0%}; 0.5 m2/standing, 1.2 m2/seated; ground floor only",
        conf="med" if cont and not big else "low")
q=lambda s:"null" if s is None else (str(s) if isinstance(s,(int,float)) else "'"+str(s).replace("'","''")+"'")
rows=[f"({q(k)},{q(v['smin'])},{q(v['smax'])},{q(v['emin'])},{q(v['emax'])},{q(v['m2'])},{q(v['lv'])},{q(v['method'])},{q(v['conf'])})" for k,v in res.items()]
open("supabase/capacity_seed.sql","w").write("insert into venue_features(venue_id,capacity_est_min_standing,capacity_est_max_standing,capacity_est_min_seated,capacity_est_max_seated,footprint_m2,building_levels,capacity_method,capacity_confidence) values "+",".join(rows)+
 " on conflict (venue_id) do update set capacity_est_min_standing=excluded.capacity_est_min_standing,capacity_est_max_standing=excluded.capacity_est_max_standing,capacity_est_min_seated=excluded.capacity_est_min_seated,capacity_est_max_seated=excluded.capacity_est_max_seated,footprint_m2=excluded.footprint_m2,building_levels=excluded.building_levels,capacity_method=excluded.capacity_method,capacity_confidence=excluded.capacity_confidence;")
st=[f"({q(k)},{q(v['standing'])},{q(v['seated'])})" for k,v in stated.items()]
open("supabase/capacity_seed.sql","a").write("\ninsert into venue_features(venue_id,capacity_standing,capacity_seated) values "+",".join(st)+" on conflict (venue_id) do update set capacity_standing=excluded.capacity_standing,capacity_seated=excluded.capacity_seated;")
from collections import Counter; print(len(W),"venues; estimated",len(res),Counter(v["conf"] for v in res.values()))
for w in W:
    if w["id"] in res: w["cap"]=res[w["id"]]
json.dump(W,open("web/data.json","w"))
