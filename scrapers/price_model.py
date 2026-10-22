"""kNN price model over real observations (per-head group spend from venues' own sites). Never a quote."""
import json, math, glob, re, statistics as S
W=json.load(open("web/data.json"))
ids={w["id"] for w in W}
for f in sorted(glob.glob("data/london/*.json")):  # Greater London expansion (scrapers/expand_london.py)
    if "/site_" in f: continue
    for w in json.load(open(f)):
        if w["id"] not in ids: ids.add(w["id"]); W.append(w)
V={w["id"]:w for w in W}
O=json.load(open("data/price_observations.json"))
for f in sorted(glob.glob("data/london/site_*.json")):
    for r in json.load(open(f)):
        if r.get("cap") and V.get(r["id"]): V[r["id"]]["cap"]=dict(smax=r["cap"]["standing"] or r["cap"]["seated"])
        O+=[o for o in r["obs"] if o["kind"]=="per_head" and not re.search(r"corkage|per bottle",o["snippet"],re.I)]  # hire_fee hits were review/membership noise
O=[o for o in O if o["venue_id"] in V]  # EXAMPLE rules never included
def hav(a,b,c,d):
    p=math.pi/180;x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2;return 12742*math.asin(math.sqrt(x))
SIM={("pub","bar"):0.7,("bar","pub"):0.7}
def tsim(a,b): return 1.0 if a==b else SIM.get((a,b),0.4)
def cap(w): c=w.get("cap") or {}; return c.get("smax")
# midweek vs weekend check
mid=[o["amount_gbp"] for o in O if o["day_scope"]=="midweek"]; wk=[o["amount_gbp"] for o in O if o["day_scope"]=="weekend"]
MIDWEEK_ADJ=None  # only apply if data supports: need >=5 each and clear gap
if len(mid)>=5 and len(wk)>=5 and S.median(mid)<0.85*S.median(wk): MIDWEEK_ADJ=S.median(mid)/S.median(wk)
own={}
for o in O: own.setdefault(o["venue_id"],[]).append(o["amount_gbp"])
vmed={k:S.median(v) for k,v in own.items()}  # one point per venue (robust)
def wq(vals,ws,q):
    z=sorted(zip(vals,ws)); t=sum(ws); c=0
    for v,w in z:
        c+=w
        if c>=q*t: return v
    return z[-1][0]
def predict(w,exclude=None,k=8):
    cands=[]
    for vid,m in vmed.items():
        if vid==exclude or vid==w["id"]: continue
        u=V[vid]; d=hav(w["lat"],w["lng"],u["lat"],u["lng"])
        if d>5: continue  # no estimate without a real price within 5 km
        wt=math.exp(-d/1.5)*tsim(w["type"],u["type"])
        c1,c2=cap(w),cap(u)
        if c1 and c2: wt*=math.exp(-abs(math.log(c1/c2)))
        cands.append((wt,m,vid,d))
    cands=sorted(cands,reverse=True)[:k]
    if not cands or sum(c[0] for c in cands)<1e-6: return None
    vals=[c[1] for c in cands]; ws=[c[0] for c in cands]
    return dict(low=wq(vals,ws,.25),mid=wq(vals,ws,.5),high=wq(vals,ws,.75),n=len(cands),near=[c[2] for c in cands[:3]],within15=sum(c[3]<=1.5 for c in cands))
# leave-one-out
err=[]
for vid,m in vmed.items():
    p=predict(V[vid],exclude=vid)
    if p: err.append(abs(p["mid"]-m))
out=[]
for w in W:
    if w["name"].startswith("EXAMPLE"): continue
    if w["id"] in vmed:
        a=own[w["id"]]; out.append(dict(venue_id=w["id"],low=min(a),mid=vmed[w["id"]],high=max(a),n=len(a),near=[w["id"]],method="own observations (venue site, per-head group spend)",conf="high")); continue
    p=predict(w)
    if not p: continue
    out.append(dict(venue_id=w["id"],low=p["low"],mid=p["mid"],high=p["high"],n=p["n"],near=p["near"],
        method="kNN over nearby venues' per-head spend (distance 1.5km decay, type, capacity)"+("; midweek adj" if MIDWEEK_ADJ else "; no midweek adj (insufficient data)"),
        conf="med" if p["within15"]>=5 else "low"))
json.dump(out,open("data/price_estimates.json","w"),indent=1)
from collections import Counter
print("obs",len(O),"venues w/ obs",len(vmed),"midweek",len(mid),"weekend",len(wk),"adj",MIDWEEK_ADJ)
print("estimates",len(out),Counter(o["conf"] for o in out))
print("LOO MAE £pp",round(S.median(err),2) if err else None,"n",len(err),"obs median",S.median(vmed.values()))
for o in [x for x in out if x["conf"]!="high"][:3]+[x for x in out if x["conf"]=="high"][:2]:
    print(V[o["venue_id"]]["name"],o["low"],o["mid"],o["high"],o["conf"],[V[i]["name"] for i in o["near"]])
q=lambda s:"null" if s is None else (str(s) if isinstance(s,(int,float)) else "'"+str(s).replace("'","''")+"'")
sql="delete from price_observations;\ninsert into price_observations(venue_id,source_url,kind,amount_gbp,day_scope,capacity,observed_at,matched_confidence,snippet) values "+",".join(f"({q(o['venue_id'])},{q(o['source_url'])},{q(o['kind'])},{o['amount_gbp']},{q(o['day_scope'])},null,{q(o['observed_at'])},{o['matched_confidence']},{q(o['snippet'])})" for o in O)+";\n"
sql+="insert into venue_features(venue_id,price_est_low,price_est_mid,price_est_high,price_est_unit,price_n_comparables,price_comparable_ids,price_method,price_confidence) values "+",".join(f"({q(o['venue_id'])},{o['low']},{o['mid']},{o['high']},'gbp_per_head',{o['n']},array[{','.join(q(i) for i in o['near'])}]::text[],{q(o['method'])},{q(o['conf'])})" for o in out)+" on conflict (venue_id) do update set price_est_low=excluded.price_est_low,price_est_mid=excluded.price_est_mid,price_est_high=excluded.price_est_high,price_est_unit=excluded.price_est_unit,price_n_comparables=excluded.price_n_comparables,price_comparable_ids=excluded.price_comparable_ids,price_method=excluded.price_method,price_confidence=excluded.price_confidence;"
open("supabase/price_seed.sql","w").write(sql)
