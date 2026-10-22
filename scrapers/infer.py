"""Cluster events to venues, then infer weekday x slot booked frequency and 'likely free' scores."""
import json, math, re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from rapidfuzz import fuzz
LON = ZoneInfo("Europe/London")
PC = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")
SLOTS = [("morning", 6, 12), ("afternoon", 12, 17), ("evening", 17, 21), ("late", 21, 30)]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

def slot(h):
    h = h if h >= 6 else h + 24
    return next(s for s, a, b in SLOTS if a <= h < b)
def hav(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))
def postcode(s):
    m = PC.search((s or "").upper()); return f"{m.group(1)} {m.group(2)}" if m else None
def norm(s): return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()

ev = json.load(open("data/raw_events.json"))
venues = []
def match(e):
    pc = postcode(e["address"]); n = norm(e["venue_name"])
    for v in venues:
        if e.get("place_id") and e["place_id"] in v["place_ids"]: return v
        geo = e["lat"] and v["lat"] and hav(e["lat"], e["lng"], v["lat"], v["lng"]) < 50
        name = fuzz.token_set_ratio(n, norm(v["name"])) >= 85
        if (geo and name) or (pc and pc == v["postcode"] and name) or (geo and pc == v["postcode"]): return v
    return None
for e in sorted(ev, key=lambda e: e["lat"] is None):  # geo-bearing (Luma) first
    if not e["venue_name"]: continue
    v = match(e)
    if not v:
        v = dict(id=f"v{len(venues)+1:04d}", name=e["venue_name"], address=e["address"], postcode=postcode(e["address"]),
                 lat=e["lat"], lng=e["lng"], place_ids=set(), sources=set(), event_ids=[])
        venues.append(v)
    if e.get("place_id"): v["place_ids"].add(e["place_id"])
    if not v["lat"] and e["lat"]: v["lat"], v["lng"] = e["lat"], e["lng"]
    v["sources"].add(e["source"]); e["venue_id"] = v["id"]
    st = datetime.fromisoformat(e["start"].replace("Z", "+00:00")).astimezone(LON)
    e["weekday"], e["slot"], e["local_start"] = DAYS[st.weekday()], slot(st.hour), st.isoformat()
    v["event_ids"].append(e["url"])
vevents = [e for e in ev if "venue_id" in e]

# Global prior: share of events per weekday x slot across all venues
glob = defaultdict(int)
for e in vevents: glob[(e["weekday"], e["slot"])] += 1
tot = sum(glob.values()) or 1
K = 2.0  # prior strength (pseudo-events)
today = datetime.now(LON).date()
for v in venues:
    mine = [e for e in vevents if e["venue_id"] == v["id"]]
    cnt = defaultdict(int)
    for e in mine: cnt[(e["weekday"], e["slot"])] += 1
    n = len(mine)
    # booked probability per weekday x slot: shrink venue frequency towards global frequency
    weeks = max(1, len({datetime.fromisoformat(e["local_start"]).isocalendar()[:2] for e in mine}))
    grid = {}
    for d in DAYS:
        for s, *_ in SLOTS:
            g = glob[(d, s)] / tot
            p = (cnt[(d, s)] + K * g * len(SLOTS) * 7 / 7) / (weeks + K)
            grid[f"{d}_{s}"] = round(min(p, 0.99), 3)
    v["booked_freq"] = grid
    known = {(datetime.fromisoformat(e["local_start"]).date(), e["slot"]) for e in mine}
    fut = []
    for i in range(28):
        dt = today + timedelta(days=i)
        for s in ("evening", "late"):
            busy = (dt, s) in known
            free = 0.0 if busy else round(1 - grid[f"{DAYS[dt.weekday()]}_{s}"], 3)
            fut.append(dict(date=dt.isoformat(), weekday=DAYS[dt.weekday()], slot=s, known_event=busy, likely_free=free))
    v["availability_inferred"] = fut
    v["event_count"] = n
    v["place_ids"], v["sources"] = sorted(v["place_ids"]), sorted(v["sources"])
venues.sort(key=lambda v: -v["event_count"])
json.dump(venues, open("data/venues.json", "w"), indent=1)
json.dump(vevents, open("data/venue_events.json", "w"), indent=1)
print(len(vevents), "events ->", len(venues), "venues; multi-event venues:", sum(v["event_count"] > 1 for v in venues),
      "geo:", sum(bool(v["lat"]) for v in venues))
for v in venues[:8]: print(v["event_count"], v["name"], v["postcode"], v["sources"])

# Heatmap of quiet nights for top venues
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt, numpy as np
top = venues[:6]
fig, axes = plt.subplots(2, 3, figsize=(15, 7))
for ax, v in zip(axes.flat, top):
    m = np.array([[1 - v["booked_freq"][f"{d}_{s}"] for d in DAYS] for s, *_ in SLOTS])
    im = ax.imshow(m, cmap="RdYlGn", vmin=0, vmax=1)
    ax.set_xticks(range(7), DAYS); ax.set_yticks(range(4), [s for s, *_ in SLOTS])
    ax.set_title(f"{v['name'][:32]} ({v['event_count']} ev)", fontsize=9)
    for i in range(4):
        for j in range(7): ax.text(j, i, f"{m[i,j]:.2f}", ha="center", va="center", fontsize=7)
fig.colorbar(im, ax=axes, label="P(likely free)  green = quiet")
fig.suptitle("Open Venue DB - inferred quiet slots (London, Luma + Meetup listings)")
plt.savefig("data/heatmap_quiet_nights.png", dpi=110, bbox_inches="tight")
