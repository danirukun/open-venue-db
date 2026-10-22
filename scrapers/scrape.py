"""Scrape public London event listings (Luma discover API, Meetup find pages).
Collects ONLY: title, start/end, venue name, address, lat/lng, source URL. No attendee/guest data."""
import json, re, time, requests
UA = {"User-Agent": "Mozilla/5.0 (OpenVenueDB hackathon prototype)"}
LUMA_PLACE = "discplace-QCcNk3HXowOR97j"  # London

def luma(max_pages=15):
    out, cur = [], None
    for _ in range(max_pages):
        p = {"discover_place_api_id": LUMA_PLACE, "pagination_limit": 50}
        if cur: p["pagination_cursor"] = cur
        d = requests.get("https://api.lu.ma/discover/get-paginated-events", params=p, headers=UA, timeout=20).json()
        for en in d.get("entries", []):
            e = en["event"]
            if e.get("location_type") != "offline": continue
            g = e.get("geo_address_info") or {}
            loc = (g.get("localized") or {}).get("en-GB") or g
            c = e.get("coordinate") or {}
            out.append(dict(source="luma", title=e["name"], start=e["start_at"], end=e.get("end_at"),
                venue_name=g.get("address"), address=loc.get("full_address") or g.get("full_address"),
                lat=c.get("latitude"), lng=c.get("longitude"), place_id=g.get("place_id"),
                url="https://lu.ma/" + e["url"]))
        cur = d.get("next_cursor")
        if not d.get("has_more"): break
        time.sleep(0.5)
    return out

MEETUP_CATS = ["", "&categoryId=405", "&categoryId=521", "&categoryId=546", "&categoryId=395", "&categoryId=436", "&categoryId=467"]
def meetup():
    out, seen = [], set()
    for c in MEETUP_CATS:
        u = f"https://www.meetup.com/find/?location=gb--17--London&source=EVENTS&eventType=inPerson{c}"
        try:
            h = requests.get(u, headers=UA, timeout=20).text
            m = re.search(r'__NEXT_DATA__" type="application/json">(.*?)</script>', h)
            st = json.loads(m.group(1))["props"]["pageProps"]["__APOLLO_STATE__"]
        except Exception as ex:
            print("meetup fail", c, ex); continue
        for k, e in st.items():
            if not k.startswith("Event:") or e["id"] in seen or not e.get("venue"): continue
            seen.add(e["id"]); v = e["venue"]
            out.append(dict(source="meetup", title=e["title"], start=e["dateTime"], end=None,
                venue_name=v.get("name"), address=v.get("address"), lat=None, lng=None, place_id=None,
                url=e["eventUrl"]))
        time.sleep(0.5)
    return out

if __name__ == "__main__":
    ev = luma() + meetup()
    json.dump(ev, open("data/raw_events.json", "w"), indent=1)
    from collections import Counter; print(len(ev), Counter(e["source"] for e in ev))
