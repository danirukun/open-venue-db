"""Collect real price observations (£ near hire / minimum spend / per head) from venues' OWN websites.
Listing sites: Tagvenue disallows /uk/search/ in robots.txt; venues.london serves a captcha; HireSpace London page 404 -> skipped."""
import json, re, requests, concurrent.futures as cf
from datetime import date
W=[w for w in json.load(open("web/data.json")) if w["url"].startswith("http") and not any(s in w["url"] for s in ("lu.ma","meetup.com","openstreetmap"))]
KW=re.compile(r"(minimum spend|min\.? spend|private hire|exclusive hire|hire fee|room hire|venue hire|per head|per person|pp\b)",re.I)
MON=re.compile(r"£\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d\d)?")
def kind(ctx):
    c=ctx.lower()
    if "per head" in c or "per person" in c or re.search(r"\bpp\b",c): return "per_head"
    if "spend" in c: return "min_spend"
    return "hire_fee"
def day_scope(ctx):
    c=ctx.lower()
    if re.search(r"fri|sat|weekend",c) and not re.search(r"mon|tue|wed|thu|midweek|weekday",c): return "weekend"
    if re.search(r"mon|tue|wed|thu|midweek|weekday|sun",c): return "midweek"
    return "any"
def go(w):
    obs=[]
    for path in ("","/private-hire","/hire","/events","/private-events","/functions"):
        u=w["url"].rstrip("/")+path
        try: r=requests.get(u,timeout=8,headers={"User-Agent":"Mozilla/5.0 (OpenVenueDB hackathon)"})
        except Exception: continue
        if not r.ok: continue
        t=re.sub(r"\s+"," ",re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>"," ",r.text,flags=re.S|re.I))
        for m in KW.finditer(t):
            ctx=t[max(0,m.start()-90):m.end()+90]
            for a in MON.finditer(ctx):
                amt=float(a.group(1).replace(",",""))
                k=kind(ctx)
                if (k=="per_head" and not 5<=amt<=200) or (k!="per_head" and not 50<=amt<=50000): continue
                obs.append(dict(venue_id=w["id"],name=w["name"],source_url=u,kind=k,amount_gbp=amt,day_scope=day_scope(ctx),capacity=None,
                  observed_at=str(date.today()),matched_confidence=1.0,snippet=ctx[:220]))
    seen=set(); return [o for o in obs if not ((o["kind"],o["amount_gbp"]) in seen or seen.add((o["kind"],o["amount_gbp"])))]
with cf.ThreadPoolExecutor(24) as ex: res=[o for os in ex.map(go,W) for o in os]
json.dump(res,open("data/price_observations.json","w"),indent=1)
from collections import Counter; print(len(W),"sites;",len(res),"obs;",len({o['venue_id'] for o in res}),"venues;",Counter(o["kind"] for o in res),Counter(o["day_scope"] for o in res))
for o in res[:10]: print(o["name"],o["kind"],o["amount_gbp"],o["day_scope"],"|",o["snippet"][60:160])
