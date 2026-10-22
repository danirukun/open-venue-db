"""Extra West London events (Meetup find pages per area; Luma London discover filtered to west bbox). Same fields only: title, time, venue, address, lat/lng, URL. No attendee data."""
import json, re, time, requests, sys
sys.path.insert(0,"scrapers")
UA={"User-Agent":"Mozilla/5.0 (OpenVenueDB hackathon)"}
out=[]; seen=set()
for loc in ["Hammersmith","Fulham","Chiswick","Shepherds Bush","Ealing","Acton","Kensington","Putney"]:
    for c in ["", "&categoryId=405", "&categoryId=521", "&categoryId=546"]:
        u=f"https://www.meetup.com/find/?location=gb--17--{loc.replace(' ','%20')}&source=EVENTS&eventType=inPerson&distance=twoMiles{c}"
        try:
            h=requests.get(u,headers=UA,timeout=20).text
            st=json.loads(re.search(r'__NEXT_DATA__" type="application/json">(.*?)</script>',h).group(1))["props"]["pageProps"]["__APOLLO_STATE__"]
        except Exception as ex: print("fail",loc,c,ex); continue
        for k,e in st.items():
            if not k.startswith("Event:") or e["id"] in seen or not e.get("venue"): continue
            seen.add(e["id"]); v=e["venue"]
            if isinstance(v,dict) and "__ref" in v: v=st.get(v["__ref"],{})
            out.append(dict(source="meetup",title=e["title"],start=e["dateTime"],end=None,venue_name=v.get("name"),address=v.get("address"),
                lat=v.get("lat"),lng=v.get("lng") or v.get("lon"),place_id=None,url=e["eventUrl"],area=loc))
        time.sleep(1)
json.dump(out,open("data/raw_events_west.json","w"),indent=1)
from collections import Counter; print(len(out),Counter(e["area"] for e in out)); print(out[:2])
