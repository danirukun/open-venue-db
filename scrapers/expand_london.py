"""Phase-wise Greater London expansion from OSM (ODbL). Usage: expand_london.py <borough name|bbox:s,w,n,e> ...
Per area: Overpass (1 query/area, polite sleep), dedupe vs live Supabase venues (osm_id or <50m + fuzzy name),
opening-hours free grid, footprint capacity (own way geometry, else nearest building <=20m). Writes data/london/<slug>.json + supabase/london/<slug>.sql"""
import json, re, sys, time, math, os, requests
sys.path.insert(0, "scrapers")
from matcher import closed_days
from rapidfuzz import fuzz
from shapely.geometry import Point, Polygon
from pyproj import Transformer
T=Transformer.from_crs(4326,27700,always_xy=True)
UA={"User-Agent":"OpenVenueDB-hackathon/0.1 (open-venue-db prototype; polite)"}
OVP="https://overpass-api.de/api/interpreter"
SB="https://bwkxqyhycuwqpuieggbt.supabase.co/rest/v1/"; KEY="sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62"
DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; OD=["Mo","Tu","We","Th","Fr","Sa","Su"]
SLOTS=[("morning",6,12),("afternoon",12,17),("evening",17,21),("late",21,30)]
TYPE={"pub":"pub","bar":"bar","cafe":"cafe","nightclub":"music","theatre":"music","arts_centre":"music","music_venue":"music",
      "community_centre":"community","events_venue":"community","place_of_worship":"community","hackerspace":"other","coworking":"other"}
USE={"cafe":0.55,"pub":0.5,"bar":0.5}
norm=lambda s: re.sub(r"[^a-z0-9 ]","",(s or "").lower())
def hav(a,b,c,d):
    p=math.pi/180;x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2;return 12742000*math.asin(math.sqrt(x))
def ovp(q):
    for i in range(4):
        try: r=requests.post([OVP,"https://overpass.kumi.systems/api/interpreter"][i%2],data={"data":q},headers=UA,timeout=200)
        except Exception as ex: print("overpass err",ex); time.sleep(5); continue
        if r.ok: return r.json()["elements"]
        print("overpass",r.status_code,"retry"); time.sleep(4*(i+1))
    raise RuntimeError("overpass failed")
F='nwr["amenity"~"^(pub|bar|cafe|community_centre|arts_centre|nightclub|theatre|events_venue|music_venue)$"]["name"]{A};nwr["leisure"="hackerspace"]["name"]{A};nwr["office"="coworking"]["name"]{A};nwr["amenity"="place_of_worship"]["name"]["hall"]{A};nwr["amenity"="place_of_worship"]["name"]["community_centre"]{A};'
def fetch(area):
    if area.startswith("bbox:"): A="("+area[5:]+")"; pre=""
    else: pre=f'area["boundary"="administrative"]["admin_level"~"^(6|8)$"]["name"="{area}"]->.a;'; A="(area.a)"
    return ovp(f"[out:json][timeout:180];{pre}({F.replace('{A}',A)});out tags geom;")
def existing():
    out=[];o=0
    while True:
        r=requests.get(SB+f"venues?select=id,name,lat,lng,osm_id&order=id&offset={o}&limit=1000",headers={"apikey":KEY},timeout=30).json()
        out+=[x for x in r if x.get("lat") is not None]; o+=1000
        if len(r)<1000: return out
def grid(oh,amen):
    cd,close=closed_days(oh); g={}
    for d,od in zip(DAYS,OD):
        for s,a,b in SLOTS:
            g[f"{d}_{s}"]=0.5 if not oh else 1.0 if od in cd else 0.9 if od in close and close[od]<=a else (0.15 if amen=="cafe" else 0.4)
    return g
def capest(typ,pg,how):
    a=pg.area
    if a<15 or a>5000: return None
    big=a>600; u=min(a,600 if typ in USE else 1500)*USE.get(typ,0.6)
    return dict(smin=int(u/0.5*0.6),smax=int(u/0.5),emin=int(u/1.2*0.6),emax=int(u/1.2),m2=round(a),
        method=how+("; footprint >600m2, capped (shared building?)" if big else "")+f"; usable {USE.get(typ,0.6):.0%}; 0.5 m2/standing, 1.2 m2/seated; ground floor only",
        conf="med" if not big and "contains" in how else "low")
def poly(geom):
    try: return Polygon([T.transform(p["lon"],p["lat"]) for p in geom]) if geom and len(geom)>=4 else None
    except Exception: return None
def run(area,EX):
    slug=re.sub(r"[^a-z0-9]+","-",area.lower()).strip("-")
    els=fetch(area); time.sleep(3)
    byosm={e["osm_id"] for e in EX if e.get("osm_id")}
    out=[]; seen=set()
    for e in els:
        t=e.get("tags",{}); nm=t.get("name")
        if e["type"]=="node": lat,lng,pg=e["lat"],e["lon"],None
        else:
            b=e.get("bounds");
            if not b: continue
            pg=poly(e.get("geometry")) if e["type"]=="way" else None
            lat,lng=((b["minlat"]+b["maxlat"])/2,(b["minlon"]+b["maxlon"])/2)
        oid=e["id"] if e["type"]=="node" else (e["id"]+(10**11 if e["type"]=="way" else 2*10**11))  # avoid node/way id clash
        amen=t.get("amenity") or t.get("leisure") or t.get("office")
        if oid in byosm or (e["type"],e["id"]) in seen: continue
        if any(abs(x["lat"]-lat)<0.0006 and abs(x["lng"]-lng)<0.001 and hav(lat,lng,x["lat"],x["lng"])<50 and fuzz.token_set_ratio(norm(nm),norm(x["name"]))>=85 for x in EX+out): continue
        seen.add((e["type"],e["id"]))
        typ=TYPE.get(amen,"other"); oh=t.get("opening_hours")
        v=dict(id=f"osm-{e['type'][0]}{e['id']}" if e["type"]!="node" else f"osm-{e['id']}",osm_id=oid,name=nm,type=typ,amenity=amen,lat=lat,lng=lng,
            opening_hours=oh,website=t.get("website") or t.get("contact:website"),postcode=t.get("addr:postcode"),
            address=" ".join(x for x in [t.get("addr:housenumber"),t.get("addr:street")] if x) or None,area=area,
            free=grid(oh,amen),basis="opening hours" if oh else "no data (0.5)",fee_label="fee unknown")
        v["url"]=v["website"] or f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
        if pg: v["cap"]=capest(typ,pg,"own OSM footprint contains point")
        if amen=="place_of_worship": v["name"]=nm+" (hall)"
        out.append(v)
    # buildings for nodes without own footprint
    need=[v for v in out if not v.get("cap")]
    for i in range(0,len(need) if not os.environ.get('NOBLDG') else 0,120):
        b=need[i:i+120]
        try: B=ovp("[out:json][timeout:120];("+"".join(f'way["building"](around:20,{w["lat"]},{w["lng"]});' for w in b)+");out geom;")
        except Exception as ex: print("bldg fail",ex); continue
        P=[pg for pg in (poly(x.get("geometry")) for x in B) if pg]
        for w in b:
            p=Point(*T.transform(w["lng"],w["lat"])); cont=[pg for pg in P if pg.contains(p)]
            near=cont or sorted([pg for pg in P if pg.distance(p)<15],key=lambda g:g.distance(p))[:1]
            if near: w["cap"]=capest(w["type"],min(near,key=lambda g:g.area),"footprint contains point" if cont else "nearest footprint <15m")
        time.sleep(2)
    json.dump(out,open(f"data/london/{slug}.json","w"))
    q=lambda s:"null" if s is None else (str(s) if isinstance(s,(int,float)) else "'"+str(s).replace("'","''")+"'")
    if out:
        L=["insert into venues(id,name,type,address,postcode,lat,lng,osm_id,opening_hours,website,source_url,basis,event_count,free_grid,fee_label) values "+
           ",".join(f"({q(v['id'])},{q(v['name'])},{q(v['type'])},{q(v['address'])},{q(v['postcode'])},{v['lat']},{v['lng']},{v['osm_id']},{q(v['opening_hours'])},{q(v['website'])},{q(v['url'])},{q(v['basis'])},0,{q(json.dumps(v['free']))}::jsonb,'fee unknown')" for v in out)+" on conflict do nothing;"]
        L.append("insert into venue_features(venue_id,popup_friendly,min_booking_days,max_booking_days,capacity_est_min_standing,capacity_est_max_standing,capacity_est_min_seated,capacity_est_max_seated,footprint_m2,capacity_method,capacity_confidence) values "+
           ",".join(f"({q(v['id'])},{'true' if v['type']=='cafe' else 'false'},{'1' if v['type']=='cafe' else 'null'},{'2' if v['type']=='cafe' else 'null'},"+(",".join(q(v['cap'][k]) for k in ('smin','smax','emin','emax','m2','method','conf')) if v.get('cap') else "null,null,null,null,null,null,null")+")" for v in out)+" on conflict (venue_id) do nothing;")
        os.makedirs("supabase/london",exist_ok=True); open(f"supabase/london/{slug}.sql","w").write("\n".join(L))
    from collections import Counter
    print(area,"| osm",len(els),"| new",len(out),"| cap",sum(bool(v.get("cap")) for v in out),dict(Counter(v["type"] for v in out)),flush=True)
    return out
if __name__=="__main__":
    EX=existing(); print("existing",len(EX))
    for a in sys.argv[1:]: EX+=run(a,EX)
