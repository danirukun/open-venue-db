"""Stated capacity + price observations from venues' OWN websites for new London venues. Capped fetches (MAX sites, 3 paths, 6s).
Usage: site_enrich.py MAX out.json in1.json [in2.json ...]"""
import json, re, sys, requests, concurrent.futures as cf
from datetime import date
MAX=int(sys.argv[1]); OUT=sys.argv[2]
W=[w for f in sys.argv[3:] for w in json.load(open(f)) if (w.get("website") or "").startswith("http")][:MAX]
CP=[re.compile(p,re.I) for p in [r"(?:max(?:imum)?\.?\s*)?standing\s*[-:–]?\s*(\d{2,4})", r"(\d{2,4})\s*standing", r"(?:max(?:imum)?\.?\s*)?seated\s*[-:–]?\s*(\d{2,4})", r"(\d{2,4})\s*seated", r"up to\s*(\d{2,4})\s*(?:guests|people)", r"capacity(?: of)?\s*[-:–]?\s*(\d{2,4})"]]
KW=re.compile(r"(minimum spend|min\.? spend|private hire|exclusive hire|hire fee|room hire|venue hire|per head|per person|pp\b)",re.I)
MON=re.compile(r"£\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d\d)?")
def kind(c):
    c=c.lower(); return "per_head" if ("per head" in c or "per person" in c or re.search(r"\bpp\b",c)) else "min_spend" if "spend" in c else "hire_fee"
def scope(c):
    c=c.lower()
    if re.search(r"fri|sat|weekend",c) and not re.search(r"mon|tue|wed|thu|midweek|weekday",c): return "weekend"
    return "midweek" if re.search(r"mon|tue|wed|thu|midweek|weekday|sun",c) else "any"
def go(w):
    obs=[]; cap=None
    for path in ("","/private-hire","/events"):
        u=w["website"].rstrip("/")+path
        try: r=requests.get(u,timeout=6,headers={"User-Agent":"Mozilla/5.0 (OpenVenueDB hackathon)"})
        except Exception: continue
        if not r.ok: continue
        t=re.sub(r"\s+"," ",re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>"," ",r.text[:400000],flags=re.S|re.I))
        f=lambda ps:[x for p in ps for m in p.findall(t) for x in [int(m)] if 10<=x<=2000]
        st,se,up=f(CP[:2]),f(CP[2:4]),f(CP[4:])
        if not cap and (st or se or up): cap=dict(standing=max(st or up or [0]) or None,seated=max(se) if se else None,source_url=u)
        for m in KW.finditer(t):
            ctx=t[max(0,m.start()-90):m.end()+90]
            for a in MON.finditer(ctx):
                amt=float(a.group(1).replace(",","")); k=kind(ctx)
                if (k=="per_head" and not 5<=amt<=200) or (k!="per_head" and not 50<=amt<=50000): continue
                obs.append(dict(venue_id=w["id"],name=w["name"],source_url=u,kind=k,amount_gbp=amt,day_scope=scope(ctx),capacity=None,observed_at=str(date.today()),matched_confidence=1.0,snippet=ctx[:220]))
    seen=set(); obs=[o for o in obs if not ((o["kind"],o["amount_gbp"]) in seen or seen.add((o["kind"],o["amount_gbp"])))]
    return dict(id=w["id"],cap=cap,obs=obs)
with cf.ThreadPoolExecutor(24) as ex: R=list(ex.map(go,W))
json.dump(R,open(OUT,"w"),indent=1)
from collections import Counter
print(len(W),"sites; stated cap",sum(bool(r["cap"]) for r in R),"; obs",sum(len(r["obs"]) for r in R),"from",sum(bool(r["obs"]) for r in R),"venues",Counter(o["kind"] for r in R for o in r["obs"]))
