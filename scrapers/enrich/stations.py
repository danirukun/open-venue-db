import requests,json
q='''[out:json][timeout:90];(node["railway"="station"](51.28,-0.51,51.70,0.34);node["public_transport"="station"](51.28,-0.51,51.70,0.34);node["railway"="tram_stop"](51.28,-0.51,51.70,0.34););out body;'''
for u in ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']:
  try:
    r=requests.post(u,data={'data':q},timeout=70,headers={'User-Agent':'offpeak-hackathon'});r.raise_for_status();els=r.json()['elements'];break
  except Exception as e: print(u,e)
seen={};
for e in els:
  t=e.get('tags',{});n=t.get('name')
  if not n: continue
  k=(n,round(e['lat'],3),round(e['lon'],3))
  seen[k]=dict(name=n,network=t.get('network') or t.get('operator'),lines=t.get('line') or t.get('subway') and 'subway',kind=t.get('station') or t.get('railway'),lat=e['lat'],lng=e['lon'])
json.dump(list(seen.values()),open('stations.json','w'));print(len(seen))
