"""Cafe off-hours availability (from OSM opening_hours), cost estimator over pricing_rules, and VenueRequest matcher."""
import json, re, math
DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
AVG_SPEND = 12.0  # £ per head, configurable

def closed_days(oh):
    """Very small opening_hours parser: returns weekdays with no listed hours, plus closing hour per day."""
    if not oh or oh.strip() == "24/7": return [], {}
    open_d, close = set(), {}
    for part in oh.split(";"):
        m = re.match(r"\s*([A-Za-z,\- ]+?)\s+(\d\d):\d\d-(\d\d):\d\d", part)
        if not m: continue
        for chunk in m.group(1).split(","):
            a, _, b = chunk.strip().partition("-")
            if a[:2] not in DAYS: continue
            i, j = DAYS.index(a[:2]), DAYS.index(b[:2]) if b[:2] in DAYS else DAYS.index(a[:2])
            for k in (range(i, j + 1) if i <= j else list(range(i, 7)) + list(range(0, j + 1))):
                open_d.add(DAYS[k]); close[DAYS[k]] = int(m.group(3))
    if "off" in oh: pass
    return [d for d in DAYS if d not in open_d] if open_d else [], close

EXAMPLE_RULES = [  # EXAMPLE DATA - illustrative only, not real venue terms
 dict(venue_id="example-pub-backroom", kind="waive", condition_type="min_spend", threshold=500, applies_days=["Mo","Tu","We","Th"], time_window="18:00-23:00", fallback_fee=250, source_url=None, confidence=1.0, example=True),
 dict(venue_id="example-pub-backroom", kind="discount", condition_type="min_headcount", threshold=60, applies_days=["Fr"], time_window="18:00-23:00", fallback_fee=400, discount_pct=50, source_url=None, confidence=1.0, example=True),
 dict(venue_id="example-cafe", kind="per_head", condition_type="min_headcount", threshold=10, applies_days=["Sa","Su"], time_window="17:00-22:00", fallback_fee=0, per_head=8, source_url=None, confidence=1.0, example=True),
 dict(venue_id="example-small-theatre", kind="cap", condition_type="min_tickets", threshold=80, applies_days=["Tu","We"], time_window="19:00-23:00", fallback_fee=600, cap=200, source_url=None, confidence=1.0, example=True),
]

def estimate_fee(rules, headcount, day, avg_spend=AVG_SPEND, tickets=None):
    spend = headcount * avg_spend; tickets = tickets if tickets is not None else headcount
    best, why = None, "no rule; fee unknown"
    for r in rules:
        if r.get("applies_days") and day not in r["applies_days"]: continue
        val = {"min_spend": spend, "min_headcount": headcount, "min_tickets": tickets}[r["condition_type"]]
        met = val >= r["threshold"]; fb = r.get("fallback_fee") or 0
        if r["kind"] == "waive": fee = 0 if met else fb
        elif r["kind"] == "discount": fee = fb * (1 - r.get("discount_pct", 0) / 100) if met else fb
        elif r["kind"] == "cap": fee = min(fb, r.get("cap", fb)) if met else fb
        else: fee = headcount * r.get("per_head", 0) if met else fb
        if best is None or fee < best: best, why = fee, f"{r['kind']} if {r['condition_type']}>={r['threshold']} (est {val:.0f}) -> {'met' if met else 'not met'}"
    label = "£0 venue fee (likely)" if best == 0 else (f"~£{best:.0f} venue fee" if best is not None else "fee unknown")
    return dict(est_spend=spend, est_fee=best, label=label, reason=why)

def rank(request, venues, rules_by_venue):
    """Rank by capacity fit first, then estimated total cost vs budget, then likely-free score."""
    hc, budget, day = request["headcount"], request["budget"], request["day"]
    out = []
    for v in venues:
        cap = v.get("capacity_standing") or v.get("capacity_seated")
        cap_fit = 0.5 if cap is None else (1 - abs(cap - hc * 1.2) / max(cap, hc)) if cap >= hc else -1
        if cap_fit < 0: continue
        est = estimate_fee(rules_by_venue.get(v["id"], []), hc, day, request.get("avg_spend", AVG_SPEND))
        fee = est["est_fee"]; cost_fit = 0.3 if fee is None else (1.0 if fee <= budget else max(0, 1 - (fee - budget) / max(budget, 50)))
        out.append(dict(venue=v["name"], id=v["id"], score=round(2 * cap_fit + cost_fit + v.get("likely_free", 0.5), 3), cap_fit=round(cap_fit, 2), **est))
    return sorted(out, key=lambda x: -x["score"])

if __name__ == "__main__":
    osm = json.load(open("data/osm_venues.json"))
    cafes = []
    for o in osm:
        if o["amenity"] != "cafe": continue
        cd, close = closed_days(o["opening_hours"])
        cafes.append(dict(id=f"osm-{o['osm_id']}", name=o["name"], venue_type="cafe", lat=o["lat"], lng=o["lng"],
            opening_hours=o["opening_hours"], closed_days=cd, closes_at=close, popup_friendly=True,
            min_booking_days=1, max_booking_days=2,
            likely_free_slots=[f"{d} all day" for d in cd] + [f"{d} after {h}:00" for d, h in close.items() if h <= 18]))
    json.dump(cafes, open("data/cafes_popup.json", "w"), indent=1)
    print(len(cafes), "cafes;", sum(bool(c["closed_days"]) for c in cafes), "with closed days;",
          sum(bool(c["likely_free_slots"]) for c in cafes), "with off-hour slots")
    demo_venues = [dict(id="example-pub-backroom", name="EXAMPLE Pub back room", capacity_standing=60, likely_free=0.8),
                   dict(id="example-cafe", name="EXAMPLE Cafe (evening popup)", capacity_standing=30, likely_free=0.9),
                   dict(id="example-small-theatre", name="EXAMPLE Small theatre", capacity_seated=100, likely_free=0.6)]
    rb = {}
    for r in EXAMPLE_RULES: rb.setdefault(r["venue_id"], []).append(r)
    req = dict(headcount=45, budget=0, day="We", avg_spend=12)
    res = rank(req, demo_venues, rb)
    json.dump(dict(request=req, results=res, rules=EXAMPLE_RULES), open("data/demo_match.json", "w"), indent=1)
    for r in res: print(r)
