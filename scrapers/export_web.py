"""Join event venues + OSM venues into web/data.json for the map."""
import json, math, re, sys
sys.path.insert(0, "scrapers")
from matcher import closed_days
from rapidfuzz import fuzz
DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; OD = ["Mo","Tu","We","Th","Fr","Sa","Su"]
SLOTS = [("morning",6,12),("afternoon",12,17),("evening",17,21),("late",21,30)]
def hav(a,b,c,d):
    p=math.pi/180;x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2;return 12742000*math.asin(math.sqrt(x))
norm=lambda s: re.sub(r"[^a-z0-9 ]","",(s or "").lower())
ev=json.load(open("data/venues.json")); osm=json.load(open("data/osm_venues.json"))
rules={}
for r in json.load(open("data/pricing_rules_extracted.json")): rules[r["osm_id"]]=("Minimum spend applies (amount unknown)", r["source_url"])
def guess_type(n):
    n=n.lower()
    for k,t in [("pub","pub"),("arms","pub"),("tavern","pub"),("bar","bar"),("cafe","cafe"),("café","cafe"),("coffee","cafe"),
                ("music","music"),("theatre","music"),("comedy","music"),("club","music"),("hall","community"),("centre","community"),("church","community"),("library","community")]:
        if k in n: return t
    return "other"
def osm_grid(o):
    cd, close = closed_days(o.get("opening_hours"))
    g={}
    for d,od in zip(DAYS,OD):
        for s,a,b in SLOTS:
            if not o.get("opening_hours"): v=0.5
            elif od in cd: v=1.0
            elif od in close and close[od] <= a: v=0.9
            else: v=0.15 if o["amenity"]=="cafe" else 0.4
            g[f"{d}_{s}"]=v
    return g
out=[]; used=set()
for v in ev:
    lat,lng=v["lat"],v["lng"]; m=None
    for o in osm:
        close_ = lat and hav(lat,lng,o["lat"],o["lng"])<50
        nm = fuzz.token_set_ratio(norm(v["name"]),norm(o["name"]))>=85
        if (close_ and nm) or (not lat and nm and v["postcode"] and v["postcode"]==o.get("postcode")): m=o;break
    if m: used.add(m["osm_id"]); lat,lng=lat or m["lat"],lng or m["lng"]
    if not lat: continue
    out.append(dict(name=v["name"],type=(m and m["amenity"].replace("pub","pub")) or guess_type(v["name"]),lat=lat,lng=lng,
        free={k:round(1-p,2) for k,p in v["booked_freq"].items()},basis="events (sparse)",events=v["event_count"],
        capacity=None,fee_label=(rules.get(m["osm_id"],("fee unknown",))[0] if m else "fee unknown"),
        url=v["event_ids"][0]))
for o in osm:
    if o["osm_id"] in used: continue
    r=rules.get(o["osm_id"])
    out.append(dict(name=o["name"],type=o["amenity"],lat=o["lat"],lng=o["lng"],free=osm_grid(o),
        basis="opening hours" if o.get("opening_hours") else "no data (0.5)",events=0,capacity=None,
        fee_label=r[0] if r else "fee unknown",url=o.get("website") or f"https://www.openstreetmap.org/node/{o['osm_id']}"))
json.dump(out,open("web/data.json","w"))
from collections import Counter; print(len(out),"with coords;",Counter(x["type"] for x in out),"event venues w/ coords:",sum(x["events"]>0 for x in out),"merged w/ OSM:",len(used))
