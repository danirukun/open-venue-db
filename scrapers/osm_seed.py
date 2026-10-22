"""Seed cafes (popups) and pubs/bars from OpenStreetMap Overpass (central London bbox, ODbL)."""
import json, requests
Q = """[out:json][timeout:60];
(node["amenity"="cafe"]["opening_hours"](51.49,-0.16,51.54,-0.05);
 node["amenity"~"pub|bar"]["website"](51.50,-0.12,51.535,-0.06););out body;"""
d = requests.post("https://overpass-api.de/api/interpreter", data={"data": Q},
                  headers={"User-Agent": "OpenVenueDB-hackathon"}, timeout=90).json()
out = [dict(osm_id=e["id"], name=e["tags"].get("name"), amenity=e["tags"]["amenity"], lat=e["lat"], lng=e["lon"],
            opening_hours=e["tags"].get("opening_hours"), website=e["tags"].get("website"),
            postcode=e["tags"].get("addr:postcode")) for e in d["elements"] if e["tags"].get("name")]
json.dump(out, open("data/osm_venues.json", "w"), indent=1)
from collections import Counter; print(len(out), Counter(o["amenity"] for o in out))
