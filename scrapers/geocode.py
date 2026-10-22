"""Geocode venues lacking coords: postcodes.io (postcode centroid) then Nominatim (1 req/s)."""
import json, time, requests
UA={"User-Agent":"OpenVenueDB-hackathon/0.1 (open-venue-db prototype)"}
vs=json.load(open("data/venues.json")); n=0
for v in vs:
    if v["lat"]: continue
    try:
        r=requests.get("https://nominatim.openstreetmap.org/search",params={"q":v["address"] or v["name"]+", London","format":"json","limit":1,"countrycodes":"gb"},headers=UA,timeout=15).json()
        time.sleep(1.1)
        if r: v["lat"],v["lng"],v["geo_src"]=float(r[0]["lat"]),float(r[0]["lon"]),"nominatim"; n+=1; continue
    except Exception as e: print(e)
    if v["postcode"]:
        r=requests.get("https://api.postcodes.io/postcodes/"+v["postcode"].replace(" ",""),timeout=10).json()
        if r.get("status")==200: v["lat"],v["lng"],v["geo_src"]=r["result"]["latitude"],r["result"]["longitude"],"postcodes.io"; n+=1
json.dump(vs,open("data/venues.json","w"),indent=1); print("geocoded",n,"total with coords",sum(bool(v["lat"]) for v in vs),"/",len(vs))
