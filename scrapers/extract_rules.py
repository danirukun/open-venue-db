"""Fetch pub/bar websites from OSM and regex-extract fee-waiver rules (free hire / minimum spend / no hire fee)."""
import json, re, requests, concurrent.futures as cf
osm = [o for o in json.load(open("data/osm_venues.json")) if o["amenity"] in ("pub", "bar") and o["website"]][:80]
PAT = re.compile(r"(free (?:venue |room )?hire|no hire fee|minimum spend|min(?:imum)?\.? spend)[^.<]{0,120}", re.I)
MONEY = re.compile(r"£\s?([\d,]{2,6})")
def go(o):
    rules = []
    for path in ("", "/private-hire", "/functions", "/hire"):
        try: h = requests.get(o["website"].rstrip("/") + path, timeout=8, headers={"User-Agent": "Mozilla/5.0"}).text
        except Exception: continue
        t = re.sub(r"<[^>]+>", " ", h); t = re.sub(r"\s+", " ", t)
        for m in PAT.finditer(t):
            s = m.group(0); amt = MONEY.search(s)
            rules.append(dict(osm_id=o["osm_id"], venue=o["name"], kind="waive", condition_type="min_spend",
                threshold=float(amt.group(1).replace(",", "")) if amt else None, snippet=s[:200],
                source_url=o["website"].rstrip("/") + path, confidence=0.7 if amt else 0.4, example=False))
        if rules: break
    return rules
with cf.ThreadPoolExecutor(16) as ex: res = [r for rs in ex.map(go, osm) for r in rs]
seen=set(); res=[r for r in res if not (r["venue"],r["snippet"]) in seen and not seen.add((r["venue"],r["snippet"]))]
json.dump(res, open("data/pricing_rules_extracted.json", "w"), indent=1)
print(len(osm), "sites ->", len(res), "rule snippets from", len({r['venue'] for r in res}), "venues")
for r in res[:8]: print(r["venue"], "|", r["threshold"], "|", r["snippet"][:100])
