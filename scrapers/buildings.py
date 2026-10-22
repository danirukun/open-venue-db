"""Fetch OSM building footprints within 20 m of each venue (Overpass around queries, batched; ODbL)."""
import json, requests, time
UA={"User-Agent":"OpenVenueDB-hackathon/0.1 (open-venue-db prototype)"}
W=[w for w in json.load(open("web/data.json")) if 51.3<w["lat"]<51.7 and -0.5<w["lng"]<0.3]
out={}
for i in range(0,len(W),120):
    b=W[i:i+120]
    q="[out:json][timeout:120];("+"".join(f'way["building"](around:20,{w["lat"]},{w["lng"]});' for w in b)+");out tags geom;"
    for t in range(4):
        try:
            r=requests.post("https://overpass-api.de/api/interpreter",data={"data":q},headers=UA,timeout=150)
            if r.ok:
                for e in r.json()["elements"]: out[e["id"]]=dict(tags=e.get("tags",{}),geom=[(p["lat"],p["lon"]) for p in e["geometry"]])
                break
            print("batch",i,r.status_code,flush=True); time.sleep(15)
        except Exception as ex: print("batch",i,ex,flush=True); time.sleep(15)
    print(i+len(b),"/",len(W),len(out),flush=True)
    json.dump(out,open("data/buildings.json","w"))
