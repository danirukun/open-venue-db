"""Find stated capacities on venues' own websites (regex)."""
import json, re, requests, concurrent.futures as cf
W=[w for w in json.load(open("web/data.json")) if w["url"].startswith("http") and "lu.ma" not in w["url"] and "meetup.com" not in w["url"] and "openstreetmap" not in w["url"]]
P=[re.compile(p,re.I) for p in [r"(?:max(?:imum)?\.?\s*)?standing\s*[-:–]?\s*(\d{2,4})", r"(\d{2,4})\s*standing", r"(?:max(?:imum)?\.?\s*)?seated\s*[-:–]?\s*(\d{2,4})", r"(\d{2,4})\s*seated", r"up to\s*(\d{2,4})\s*(?:guests|people)", r"capacity(?: of)?\s*[-:–]?\s*(\d{2,4})"]]
def go(w):
    for path in ("", "/private-hire", "/hire", "/events"):
        try: h=requests.get(w["url"].rstrip("/")+path,timeout=8,headers={"User-Agent":"Mozilla/5.0"}).text
        except Exception: continue
        t=re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",h))
        st=[int(m) for p in P[:2] for m in p.findall(t)]; se=[int(m) for p in P[2:4] for m in p.findall(t)]; up=[int(m) for p in P[4:] for m in p.findall(t)]
        st=[x for x in st if 10<=x<=2000]; se=[x for x in se if 10<=x<=2000]; up=[x for x in up if 10<=x<=2000]
        if st or se or up:
            return dict(id=w["id"],name=w["name"],standing=max(st or up or [0]) or None,seated=max(se) if se else None,source_url=w["url"].rstrip("/")+path)
with cf.ThreadPoolExecutor(20) as ex: res=[r for r in ex.map(go,W) if r]
json.dump(res,open("data/stated_capacity.json","w"),indent=1); print(len(W),"sites ->",len(res)); [print(r) for r in res[:6]]
