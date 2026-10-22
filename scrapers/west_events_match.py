"""Geocode West London events (postcodes.io, then London-bounded Nominatim), reject outside Greater London bbox, match to venues
(<=80m + fuzzy name>=80), write supabase/london/west_events.sql (venue_events + free_grid nudge: free=min(old, 1-(n+0.5)/(8+2)) over ~8 weeks, K=2)."""
import json, re, time, glob, math, requests, datetime as dt
from zoneinfo import ZoneInfo
from rapidfuzz import fuzz
UA={"User-Agent":"OpenVenueDB-hackathon/0.1 (open-venue-db prototype)"}
S,W,N,E=51.28,-0.52,51.70,0.34
inb=lambda a,b: bool(a and b and S<a<N and W<b<E)
SB="https://bwkxqyhycuwqpuieggbt.supabase.co/rest/v1/"; KEY="sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62"
norm=lambda s: re.sub(r"[^a-z0-9 ]","",(s or "").lower())
def hav(a,b,c,d):
    p=math.pi/180;x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2;return 12742000*math.asin(math.sqrt(x))
ev=json.load(open("data/raw_events_west.json")); g=0
for e in ev:
    pc=re.search(r"[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}",e.get("address") or "")
    if pc:
        r=requests.get("https://api.postcodes.io/postcodes/"+pc.group(0).replace(" ",""),timeout=10).json()
        if r.get("status")==200: e["lat"],e["lng"]=r["result"]["latitude"],r["result"]["longitude"]
    if not inb(e["lat"],e["lng"]):
        r=requests.get("https://nominatim.openstreetmap.org/search",params={"q":f"{e['venue_name']}, {e.get('address') or ''}, London","format":"json","limit":1,"viewbox":f"{W},{N},{E},{S}","bounded":1},headers=UA,timeout=15).json(); time.sleep(1.1)
        e["lat"],e["lng"]=(float(r[0]["lat"]),float(r[0]["lon"])) if r else (None,None)
    g+=bool(inb(e["lat"],e["lng"]))
V=[];o=0
while True:
    r=requests.get(SB+f"venues?select=id,name,lat,lng,free_grid&lat=not.is.null&lat=gt.51.4&lat=lt.51.6&lng=gt.-0.35&lng=lt.-0.1&offset={o}&limit=1000",headers={"apikey":KEY},timeout=30).json(); V+=r; o+=1000
    if len(r)<1000: break
M=[]
for e in ev:
    if not inb(e["lat"],e["lng"]): continue
    c=[(fuzz.token_set_ratio(norm(e["venue_name"]),norm(v["name"])),v) for v in V if hav(e["lat"],e["lng"],v["lat"],v["lng"])<=80]
    c=[x for x in c if x[0]>=80]
    if c: M.append((e,max(c,key=lambda x:x[0])[1]))
q=lambda s:"null" if s is None else "'"+str(s).replace("'","''")+"'"
L=[]; cnt={}
for e,v in M:
    t=dt.datetime.fromisoformat(e["start"].replace("Z","+00:00")).astimezone(ZoneInfo("Europe/London"))
    wd=t.strftime("%a"); h=t.hour; sl="morning" if 6<=h<12 else "afternoon" if h<17 else "evening" if h<21 else "late"
    L.append(f"insert into venue_events(venue_id,source,source_url,title,starts_at,weekday,slot) values ({q(v['id'])},'meetup',{q(e['url'])},{q(e['title'])},{q(t.isoformat())},{q(wd)},{q(sl)}) on conflict do nothing;")
    cnt.setdefault(v["id"],{}).setdefault(f"{wd}_{sl}",0); cnt[v["id"]][f"{wd}_{sl}"]+=1
for vid,d in cnt.items():
    for k,n in d.items():
        L.append(f"update venues set free_grid=jsonb_set(coalesce(free_grid,'{{}}'),'{{{k}}}',to_jsonb(least(coalesce((free_grid->>'{k}')::float,1),{round(1-(n+0.5)/10,2)}))),event_count=coalesce(event_count,0)+{n},basis=case when basis like '%events%' then basis else basis||' + events (sparse)' end where id={q(vid)};")
open("supabase/london/west_events.sql","w").write("\n".join(L))
print(len(ev),"events; geocoded in London",g,"; matched to venues",len(M),"(",len(cnt),"venues)"); [print(e["venue_name"],"->",v["name"]) for e,v in M]
