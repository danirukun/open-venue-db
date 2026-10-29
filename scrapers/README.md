# scrapers

## Sourced hire prices: `price_extract.py`

Generic pipeline that finds a venue's **published hire price** (hire / private screening / events page or brochure PDF), extracts a
structured price basis with Claude, and has a frontier model judge it against the fetched source text. First used for the 119 cinemas.

```
export ANTHROPIC_API_KEY=...                      # read from env, never printed
python3 scrapers/price_extract.py extract --type cinema --prompt v4   # -> data/venue_prices/v4/<target>.json (resumable)
python3 scrapers/price_extract.py judge v4                            # adds .judge, prints pass rate + failures
python3 scrapers/price_extract.py merge final v4 v3 v2                # per target: first judge-passed record with a price
python3 scrapers/price_extract.py sql final                           # -> supabase/venue_prices_seed.sql (judge-passed only)
```
Options: `--only REGEX` (match venue/chain name), `--tag NAME`. Models: `PRICE_EXTRACT_MODEL` (default `claude-haiku-5-5`, bulk),
`PRICE_JUDGE_MODEL` (default `claude-opus-5-5`).

**How it works**
1. `targets(type)` reads `data/<type>s.json`. Each venue is matched against `CHAINS` (regex over name/operator/website). One target
   per chain (seed URLs + chain hint) whose result is reused for every branch (`scope='chain'`); everything else is a per-venue target
   with the `GENERIC` config (`scope='venue'`).
2. `extract()` calls the bulk model with Anthropic server tools `web_search` + `web_fetch`. Fetched pages/PDFs are kept (PDFs via
   `pdftotext`) so the cited `source_url` text is stored; `quote_verbatim` checks the quote literally appears in it.
3. `judge()` sends extraction + cited source text to the judge model: grounding, correctness (is it a *hire* price for this venue, unit,
   cheapest headline), and correctness of `found=false`. Ungrounded = fail (incl. source not fetched).
4. Prompts `v1..v4` in `PROMPTS` are the iteration history; v2-v4 each add rules from the judge's `issues`/`fix_hint`.

**Reuse for another venue type**: create `data/<type>s.json` (`id,name,website,operator,postcode`), add any chains to `CHAINS`
(`match`, `label`, `seeds`, `hint`), adjust the hint wording in `GENERIC`, run the four commands with `--type <type>`.

**Storage** (`supabase/migrations_013_venue_price_sources.sql`): table `venue_price_sources` (full detail, one row per venue) synced
into `venues` columns by `sync_venue_prices()`; `search_venues` returns them. Estimated `venue_features.price_est_*` stay as-is;
`price_is_sourced` says which to show. Confidence: venue+official+verbatim quote = high; other venue rows = medium;
chain rows = medium (official) / low (listing site).

**Judge pass rates, cinemas (42 targets = 10 chains + 32 independents, 119 venues)**: v1 19%, v2 67%, v3 79%, v4 74%,
merged best-of v4/v3/v2 88% (37/42). 24 targets have a judged-good price -> 84 of 119 cinemas.
