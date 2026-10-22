# Offpeak

**Offpeak - open venue & events DB for London.** Match event organisers and show runners with venues — pubs, bars, cafes (popups), small music/comedy venues and community spaces — while venue owners do almost no work. Availability is **inferred** from public event listings and opening hours.

## Run
```
python3 -m venv .venv && .venv/bin/pip install requests rapidfuzz matplotlib
.venv/bin/python scrapers/scrape.py        # Luma + Meetup -> data/raw_events.json
.venv/bin/python scrapers/infer.py         # venues.json, venue_events.json, heatmap
.venv/bin/python scrapers/osm_seed.py      # OSM cafes/pubs/bars -> data/osm_venues.json
.venv/bin/python scrapers/extract_rules.py # 'free hire'/'minimum spend' snippets from venue sites
.venv/bin/python scrapers/matcher.py       # cafe off-hours, cost estimator, demo match
```
Schema: `supabase/schema.sql` (not applied anywhere yet).

## Sources
- **Luma**: public discover API for London (`api.lu.ma/discover/get-paginated-events`): title, times, venue, address, coordinates, URL.
- **Meetup**: the public `/find` page's embedded state: title, time, venue name and address (no coordinates).
- **OpenStreetMap Overpass** (ODbL): cafes with `opening_hours`, and pubs/bars with websites.
- **No attendee or guest data is collected.** RSVP lists are skipped on purpose.

## Availability inference
1. **Clustering:** events go to the same venue if they share a Google place_id, or if two of these match: within 50 m, fuzzy name match (token-set ≥85) or the same postcode.
2. **Booked frequency** for each venue, weekday and slot (morning, afternoon, evening, late): `p = (venue_count + K·global_share·7) / (weeks_observed + K)` with K=2. Venues with few events lean on the citywide pattern; busier venues lean on their own history.
3. **Likely-free score** for each upcoming date and slot (next 28 days): `1 − p`, or 0 if a listed event is already on.
4. **Cafes (popups):** closed days and after-close hours from OSM `opening_hours` count as likely-free slots. `popup_friendly`, with 1–2 booking days.
5. Next: venue owners or editors confirm or override (edit_queue), which beats inference.

## Cost estimator and matcher
`est_spend = headcount × avg_spend_per_head` (default £12). Each `pricing_rules` row (waive, discount, cap or per_head; on min_spend, min_headcount or min_tickets; with days, time window and fallback fee) gives an estimated venue fee, and the cheapest applicable one wins. The output can be **"£0 venue fee (likely)"**. Venues are ranked by capacity fit first, then estimated fee against budget, then likely-free. Rules in `EXAMPLE_RULES` are **example data**. Real snippets found on venue sites are in `data/pricing_rules_extracted.json`.

## Gaps
Only a small slice of listings (one snapshot, upcoming only), so most venues have 1–2 events and estimates fall back to the prior. Meetup has no coordinates. Capacity isn't scraped yet. Dice, Songkick and RA aren't integrated. The rule extractor finds phrases but rarely amounts.

## Live map
https://open-venue-db.vercel.app: Leaflet + OpenStreetMap tiles (© OpenStreetMap contributors, ODbL). Heat = likely free by weekday and slot. Hover a 300 m cell for venue count and price range ("price unknown" where there's no data).
Track: https://gb-community-eng-hackathon-10-2026.teamdeel.workers.dev/hackathon#track-open-venue-db

## Supabase (live)
Project `bwkxqyhycuwqpuieggbt` (eu-west-2, London): https://bwkxqyhycuwqpuieggbt.supabase.co
Publishable key (read-only through RLS): `sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62`
- Extensions: postgis, pg_trgm, vector, unaccent. Migrations: `supabase/migrations_001.sql`, `migrations_002_fix_search.sql`. Seed: `supabase/seed.sql` (made by `scrapers/to_sql.py`).
- Indexes: a tsvector generated column with GIN, a trigram index on name, and a GIST index on `geo`.
- RLS: anyone can read; only `profiles.role in (editor, admin)` can insert, update or delete. Others propose changes through `edit_queue`. Organisers own their `venue_requests`.
- Auth: enable the Discord provider in Supabase Auth (Dashboard → Auth → Providers → Discord, using the client ID and secret from a Discord application). An admin promotes trusted organisers to `editor`.
- Search: `rpc/search_venues(q, lat, lng, radius_m, min_capacity, max_budget, weekday, slot, types, lim)`. Score = 2×text rank (ts_rank + trigram) + capacity fit + estimated fee vs budget (from `pricing_rules` via `est_fee`) + likely_free − distance penalty.
```
curl -X POST https://bwkxqyhycuwqpuieggbt.supabase.co/rest/v1/rpc/search_venues \
 -H "apikey: sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62" -H "Content-Type: application/json" \
 -d '{"lat":51.5255,"lng":-0.0785,"radius_m":1500,"min_capacity":45,"max_budget":0,"weekday":"Wed","slot":"evening"}'
```
- The map loads venues from Supabase REST and falls back to `data.json` if that fails.
- Rows named `EXAMPLE …` and rules with `is_example=true` are illustrative data, not real venue terms.

## Capacity inference
1. **Stated capacity:** regex on the venue's own site (`standing N`, `seated N`, `up to N guests`, `capacity N`). Found for 31 venues.
2. **Otherwise, the OSM building footprint** (Overpass, within 20 m) that contains the venue point, or the nearest one under 15 m away. Area is in m² (EPSG:27700), ground floor only.
   - Usable share: cafe 55%, pub/bar 50%, other 60%.
   - Standing = usable / 0.5 m², seated = usable / 1.2 m². The range runs from 60% to 100% of that.
   - Footprints over 600 m² are probably shared buildings, so they're capped and marked `low`.
3. Stored as `venue_features.capacity_est_*`, with `capacity_method` and `capacity_confidence` (high = stated, med = footprint contains point, low = nearest or capped). `search_venues` uses stated capacity first, then the estimate. The map shows estimates with "~".
4. No vision-model pass yet: no image-model API is set up in this project.

## Outreach (draft-only)
`scrapers/outreach.py` takes a venue request, runs `search_venues`, and writes personalised drafts to `outreach_drafts` with `status='pending_approval'`. Each draft has an opt-out line and a `{CLAIM_LINK}` placeholder. Contacts are the venue's own published website only. **Nothing is sent automatically.** A human approves each draft.

## Price estimates (never quotes)
- **Observations** (`price_observations`): £ amounts near "per head", "minimum spend", "private hire" and similar wording on venues' **own websites** (`scrapers/price_obs.py`). There are 24 observations from 12 venues, all per-head group or menu spend. No hire fees or minimum-spend amounts were found.
- **Listing sites:** Tagvenue `/uk/search/` is disallowed by its robots.txt, venues.london serves a captcha, and the HireSpace London page returned 404. All three were skipped.
- **Model** (`scrapers/price_model.py`): kNN over one robust median per venue, k=8. Weight = exp(−km/1.5) × type similarity × capacity similarity. The output is the weighted 25th/50th/75th percentile → `price_est_low/mid/high` (GBP per head).
- **Confidence:** high = the venue's own observation, med = ≥5 comparables within 1.5 km, low otherwise.
- **Midweek discount:** not applied. There are only 6 midweek and 4 weekend observations, which isn't enough evidence.
- **Excluded:** EXAMPLE rules are never used for training.
- **Leave-one-out median absolute error:** £13.50 per head (n=12; the median observation is £23). That's weak, so treat estimates as indicative.
- **`search_venues` returns** `price_est_low, price_est_mid, price_est_high, price_est_unit, price_n_comparables, price_confidence, price_label`. When no pricing rule applies, it compares `price_est_mid × headcount` with the budget (small weight).
