"""Add London cinemas (OSM amenity=cinema, ODbL) as type 'cinema'. Source: Geofabrik greater-london-latest.osm.pbf
(Overpass mirrors timed out). Input: /tmp/cinemas.json from an osmium pass (nodes + areas). Dedupe vs live venues by
osm_id or <80m + fuzzy name. Capacity: OSM seats/capacity tag, else own footprint (multi-screen: 1.2 m2/seat, 60% usable).
Writes data/cinemas.json + supabase/cinemas_seed.sql. Transit/crime/price enrichment runs in SQL (see seed footer)."""
import json, re, sys, math, requests
sys.path.insert(0,"scrapers")
from expand_london import existing, hav, norm, grid, T
from rapidfuzz import fuzz
from shapely.geometry import Polygon
C=json.load(open("/tmp/cinemas.json")); B=json.load(open("/tmp/cin_bldg.json"))  # node -> nearest building ring (<~20m), from a 2nd osmium pass
EX=existing(); byosm={e["osm_id"] for e in EX if e.get("osm_id")}
def num(s):
    m=re.search(r"\d+",str(s or "").replace(",","")); return int(m.group()) if m else None
out=[]
for e in C:
    t=e["tags"]; nm=t.get("name")
    if not nm: continue
    if re.search(r"^Barbican|Laser Quest",nm): continue  # City of London is out of scope; not a cinema
    if e["type"]=="node":
        lat,lng=e["lat"],e["lon"]; b=B.get(str(e["id"])); pg=Polygon([T.transform(x,y) for x,y in b[1]]) if b else None
    else:
        r=max(e["rings"],key=len)
        if len(r)<4: continue
        pg=Polygon([T.transform(x,y) for x,y in r]); c=Polygon(r).centroid; lat,lng=c.y,c.x
    if not (51.28<lat<51.70 and -0.52<lng<0.34): continue
    oid=e["id"] if e["type"]=="node" else e["id"]+(10**11 if e["type"]=="way" else 2*10**11)
    if oid in byosm: continue
    if any(hav(lat,lng,x["lat"],x["lng"])<80 and fuzz.token_set_ratio(norm(nm),norm(x["name"]))>=80 for x in EX+out): continue
    seats=num(t.get("seats")) or num(t.get("capacity")); cap=None
    if seats and 10<=seats<=5000: cap=dict(smax=seats,emax=seats,smin=int(seats*0.6),emin=int(seats*0.6),m2=None,method="OSM seats/capacity tag",conf="high")
    elif pg is not None and 30<pg.area<20000:
        u=min(pg.area,4000)*0.6; s=int(u/1.2)
        cap=dict(smax=s,emax=s,smin=int(s*0.6),emin=int(s*0.6),m2=round(pg.area),method=("own OSM footprint" if e["type"]!="node" else "building footprint at/near point")+"; usable 60%; 1.2 m2/seat; ground floor only"+("; capped 4000m2" if pg.area>4000 else ""),conf="low")
    oh=t.get("opening_hours")
    v=dict(id=f"osm-{e['type'][0]}{e['id']}" if e["type"]!="node" else f"osm-{e['id']}",osm_id=oid,name=nm,type="cinema",lat=lat,lng=lng,
        opening_hours=oh,website=t.get("website") or t.get("contact:website"),postcode=t.get("addr:postcode"),
        address=" ".join(x for x in [t.get("addr:housenumber"),t.get("addr:street")] if x) or None,
        free=grid(oh,"cinema"),basis="opening hours" if oh else "no data (0.5)",cap=cap,operator=t.get("operator") or t.get("brand"))
    v["url"]=v["website"] or f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
    out.append(v)
json.dump(out,open("data/cinemas.json","w"),indent=0)
q=lambda s:"null" if s is None else (str(s) if isinstance(s,(int,float)) else "'"+str(s).replace("'","''")+"'")
L=["insert into venues(id,name,type,address,postcode,lat,lng,osm_id,opening_hours,website,source_url,basis,event_count,free_grid,fee_label) values "+
   ",".join(f"({q(v['id'])},{q(v['name'])},'cinema',{q(v['address'])},{q(v['postcode'])},{v['lat']},{v['lng']},{v['osm_id']},{q(v['opening_hours'])},{q(v['website'])},{q(v['url'])},{q(v['basis'])},0,{q(json.dumps(v['free']))}::jsonb,'fee unknown')" for v in out)+" on conflict do nothing;",
   "insert into venue_features(venue_id,popup_friendly,capacity_est_min_standing,capacity_est_max_standing,capacity_est_min_seated,capacity_est_max_seated,footprint_m2,capacity_method,capacity_confidence) values "+
   ",".join(f"({q(v['id'])},false,"+(",".join(q(v['cap'][k]) for k in ('smin','smax','emin','emax','m2','method','conf')) if v.get('cap') else "null,null,null,null,null,null,null")+")" for v in out)+" on conflict (venue_id) do nothing;"]
open("supabase/cinemas_seed.sql","w").write("\n".join(L)+"\n")
from collections import Counter
print(len(C),"osm |",len(out),"new | cap",Counter(v["cap"]["conf"] if v["cap"] else None for v in out)); print([v["name"] for v in out])
