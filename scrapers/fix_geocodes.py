"""Reject geocodes outside Greater London bbox; retry Nominatim with ', London' bounded to the bbox, else null. Writes supabase/london/fix_geocodes.sql"""
import json, time, requests
UA={"User-Agent":"OpenVenueDB-hackathon/0.1 (open-venue-db prototype)"}
S,W,N,E=51.28,-0.52,51.70,0.34
inb=lambda la,lo: S<la<N and W<lo<E
vs=json.load(open("data/venues.json")); sql=[]; log=[]
for v in vs:
    if not v["lat"] or inb(v["lat"],v["lng"]): continue
    old=(v["lat"],v["lng"]); new=None
    for qq in [f"{v['name']}, {v['address']}, London" if v.get("address") else None, f"{v['address']}, London" if v.get("address") else None, f"{v['name']}, London"]:
        if not qq: continue
        r=requests.get("https://nominatim.openstreetmap.org/search",params={"q":qq,"format":"json","limit":1,"countrycodes":"gb","viewbox":f"{W},{N},{E},{S}","bounded":1},headers=UA,timeout=15).json(); time.sleep(1.1)
        if r and inb(float(r[0]["lat"]),float(r[0]["lon"])): new=(float(r[0]["lat"]),float(r[0]["lon"]),qq); break
    if new: v["lat"],v["lng"],v["geo_src"]=new[0],new[1],"nominatim (London-bounded)"
    else: v["lat"]=v["lng"]=None; v["geo_src"]="rejected (outside London)"
    log.append((v["id"],v["name"],old,new))
    sql.append(f"update venues set lat={v['lat'] if new else 'null'},lng={v['lng'] if new else 'null'} where id='{v['id']}';")
json.dump(vs,open("data/venues.json","w"),indent=1); open("supabase/london/fix_geocodes.sql","w").write("\n".join(sql))
for l in log: print(l)
