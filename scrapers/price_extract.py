"""Venue hire-price extractor (generic; first used for cinemas).
Pipeline per target: Claude (bulk model) + server-side web_search/web_fetch finds the official hire / private-screening /
events page or brochure PDF, extracts a structured price basis + verbatim quote. We keep the fetched source text, check the
quote is literally in it, then a frontier model (judge) grades correctness + grounding against that text.
Chains share one extractor config (seed URLs + hints) and one extraction reused for every branch; independents use GENERIC.
Usage: python3 scrapers/price_extract.py extract [--type cinema] [--only NAME] [--prompt v2]   -> data/venue_prices/<tag>/*.json
       python3 scrapers/price_extract.py judge <tag>        -> adds .judge to each json, prints pass rate
       python3 scrapers/price_extract.py sql <tag>          -> supabase/venue_prices_seed.sql (judged-pass only)
Key: ANTHROPIC_API_KEY env var (never printed). Venue list: data/<type>s.json (id,name,website,operator)."""
import os, re, sys, json, base64, subprocess, tempfile, requests, concurrent.futures as cf
from datetime import datetime, timezone
EXTRACT_MODEL = os.environ.get("PRICE_EXTRACT_MODEL", "claude-haiku-5-5")
JUDGE_MODEL = os.environ.get("PRICE_JUDGE_MODEL", "claude-opus-5-5")
OUT = "data/venue_prices"
H = {"x-api-key": os.environ.get("ANTHROPIC_API_KEY", ""), "anthropic-version": "2023-06-01", "anthropic-beta": "web-fetch-2025-09-10"}

# One config per chain: how to recognise a branch, where the chain hire info lives, chain-specific hints.
CHAINS = {
 "odeon":       dict(match=r"\bodeon\b", label="ODEON Cinemas", seeds=["https://www.odeon.co.uk/private-hire/", "https://www.odeon.co.uk/business/"], hint="ODEON calls it 'Private hire' / 'Screen hire' / ODEON Business."),
 "vue":         dict(match=r"\bvue\b|myvue", label="Vue Cinemas", seeds=["https://www.myvue.com/business", "https://www.myvue.com/private-hire"], hint="Vue calls it 'Vue for Business' / 'Private screenings' / 'Screen hire'."),
 "cineworld":   dict(match=r"cineworld", label="Cineworld", seeds=["https://www.cineworld.co.uk/static/en/uk/business", "https://www.cineworld.co.uk/static/en/uk/private-screenings"], hint="Cineworld has 'Private screenings', 'Business events' and 'Gaming in a screen' offers, often with per-screen-per-hour prices."),
 "picturehouse":dict(match=r"picturehouse", label="Picturehouse Cinemas", seeds=["https://www.picturehouses.com/private-hire", "https://www.picturehouses.com/venue-hire"], hint="Picturehouse 'Venue hire' / 'Private hire' pages; brochures are often PDFs."),
 "curzon":      dict(match=r"curzon", label="Curzon Cinemas", seeds=["https://www.curzon.com/private-hire/", "https://www.curzon.com/venue-hire/"], hint="Curzon 'Private hire & events'."),
 "everyman":    dict(match=r"everyman", label="Everyman Cinemas", seeds=["https://www.everymancinema.com/private-hire/", "https://www.everymancinema.com/private-hire-faqs/"], hint="Everyman 'Private hire'; FAQ page; quotes may be bespoke. Look for 'from £' amounts, min spend, per-head packages."),
 "electric":    dict(match=r"electric cinema|electriccinema", label="Electric Cinema (Soho House)", seeds=["https://www.electriccinema.co.uk/private-hire/"], hint="Electric Cinema private hire."),
 "omniplex":    dict(match=r"omniplex", label="Omniplex Cinemas", seeds=["https://www.omniplexcinemas.co.uk/"], hint="Omniplex 'Private screenings' / 'Screen hire'."),
 "rooftop":     dict(match=r"rooftop film club", label="Rooftop Film Club", seeds=["https://rooftopfilmclub.com/london/private-hire/"], hint="Rooftop Film Club private hire / corporate events."),
 "bfi":         dict(match=r"\bbfi\b|bfi\.org", label="BFI (Southbank & IMAX)", seeds=["https://www.bfi.org.uk/venue-hire"], hint="BFI venue hire: Southbank screens NFT1-4 and BFI IMAX; brochure/rate card may be a PDF."),
}
GENERIC = dict(label=None, seeds=[], hint="Independent venue. Check the site's nav/footer for Hire, Private hire, Venue hire, Events, Book a screen, Parties, Corporate, Brochure.")

PROMPTS = {
"v1": """Find the venue-hire price for: {who}.
{where}{hint}
Use web_search and web_fetch. Look for the official hire / private screening / events / venue-hire page or brochure PDF.
Then answer ONLY with JSON in <json></json>:
{{"found": bool, "price_amount_gbp": number|null, "price_amount_max_gbp": number|null, "price_unit": "per_hour"|"per_screening"|"per_day"|"per_head"|"per_event"|"min_spend"|null,
 "min_spend_gbp": number|null, "included": str|null, "capacity_per_screen": str|null, "price_basis": short human summary,
 "source_url": url, "source_quote": exact quote containing the price}}""",
"v2": """Find the published venue-hire / private-screening price for: {who}.
{where}{hint}
Rules:
1. Prefer the operator's OWN site (hire / private hire / private screening / events / venue hire / business / brochure PDF). Try the seed URLs first if given.
   If the operator publishes no price, you MAY use a reputable venue-listing page for THIS venue (tagvenue.com, hirespace.com, headbox.com, venuedirectory etc.) and set source_kind="listing".
2. You MUST web_fetch the exact page/PDF you cite as source_url (not just see it in search results) - the quote is checked verbatim against the fetched text.
3. source_quote: copy 1-3 consecutive sentences VERBATIM from that fetched page (no paraphrase, no ellipses, keep £ symbols) that contain the amount and its unit.
4. Only report amounts that are explicitly a price to HIRE a screen/room/venue or a private-event package. Ignore film ticket prices, memberships, gift cards, food menus, and adverts for other venues.
   If several packages exist, price_amount_gbp = the cheapest headline hire price, price_amount_max_gbp = the highest listed, describe the rest in price_basis.
5. Unit must match the text: per_hour, per_screening (a single film/slot), per_day, per_head, per_event (flat package / half day), or min_spend (only a minimum spend is given). "From £X" -> amount X.
6. If no explicit £ amount is published (e.g. "bespoke quote", "enquire"), return found=false and put what the page says in price_basis with its URL/quote.
Answer ONLY with JSON in <json></json>:
{{"found": bool, "source_kind": "official"|"listing", "price_amount_gbp": number|null, "price_amount_max_gbp": number|null,
 "price_unit": "per_hour"|"per_screening"|"per_day"|"per_head"|"per_event"|"min_spend"|null, "min_spend_gbp": number|null, "vat": "inc"|"ex"|null,
 "included": str|null, "capacity_per_screen": str|null, "price_basis": "<= 160 char human summary, e.g. 'Screen hire from £350/hour ex VAT, incl. film & host'",
 "source_url": url, "source_quote": str}}""",
}

PROMPTS["v3"] = PROMPTS["v2"].replace("Answer ONLY with JSON", """Extra rules (from judge feedback on v2):
7. EVERY field (amounts, unit, included, capacity_per_screen, price_basis) must come from the ONE cited source page. Do not mix in figures from search snippets, other pages or memory.
   If you want facts from a second page, cite that page instead or leave them out.
8. price_amount_max_gbp must use the SAME unit as price_amount_gbp; flat slot/session prices (e.g. '2.5h evening slot £1,025') are per_event, not per_hour - pick one unit and keep the other in price_basis.
9. Headline = cheapest hire price for the whole venue's screens/rooms listed on the page (check ALL rooms incl. main auditorium). A 'hire fee + min spend' is a hire fee (unit per_event) with min_spend_gbp only if a separate minimum spend is given.
10. If a fetched page comes back empty or is only the homepage (JS site/redirect), fetch another URL (sub-page, /hire, /private-hire, brochure PDF, or a listing page) - never cite an empty page.
11. The source must name THIS venue (or its chain). Copy the currency symbol exactly as shown.
Answer ONLY with JSON""")

PROMPTS["v4"] = PROMPTS["v3"].replace("Answer ONLY with JSON", """More rules (judge feedback on v3):
12. "From £X" / "prices range from £X" is a starting price: set price_amount_max_gbp=null unless an explicit upper price is printed.
13. Fill min_spend_gbp whenever the page states a minimum spend, even alongside a hire fee.
14. source_quote must be ONE contiguous span from the page in original order; if amount and unit are far apart, quote the shortest contiguous span containing the amount.
15. If the page shows a non-£ symbol (e.g. € on a London venue - likely a site template bug), still report the number, and say so in price_basis ("shown as €").
16. If the official site redirects you to a different venue with the same name (other city/country), ignore it and search for the London venue.
Answer ONLY with JSON""")

def chain_of(v):
    s = " ".join(str(v.get(k) or "") for k in ("name", "operator", "website")).lower()
    for k, c in CHAINS.items():
        if re.search(c["match"], s): return k
    return None

def pdf_text(b64):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(base64.b64decode(b64)); f.flush()
        return subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True).stdout

def call(model, messages, tools=None, max_tokens=4000, system=None):
    body = dict(model=model, max_tokens=max_tokens, messages=messages)
    if tools: body["tools"] = tools
    if system: body["system"] = system
    for _ in range(3):
        r = requests.post("https://api.anthropic.com/v1/messages", headers=H, json=body, timeout=600)
        if r.status_code == 200: return r.json()
        if r.status_code not in (429, 500, 529, 502, 503): raise RuntimeError(f"{r.status_code} {r.text[:300]}")
        import time; time.sleep(20)
    raise RuntimeError("retries exhausted")

def norm(s): return re.sub(r"[^a-z0-9£.]+", " ", (s or "").lower().replace("&amp;", "&")).strip()

def extract(target, prompt="v2"):
    """target: dict(key, who, website, cfg). Returns record with extraction + fetched sources."""
    cfg = target["cfg"]
    where = (f"Website: {target['website']}\n" if target.get("website") else "") + (f"Seed URLs to try first: {', '.join(cfg['seeds'])}\n" if cfg["seeds"] else "")
    msg = PROMPTS[prompt].format(who=target["who"], where=where, hint=cfg["hint"])
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 4, "user_location": {"type": "approximate", "country": "GB", "city": "London"}},
             {"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 6, "max_content_tokens": 30000}]
    j = call(EXTRACT_MODEL, [{"role": "user", "content": msg}], tools)
    docs, text = {}, ""
    for b in j.get("content", []):
        if b["type"] == "web_fetch_tool_result" and b["content"].get("type") == "web_fetch_result":
            src = b["content"]["content"]["source"]
            t = src.get("data", "") if src.get("type") == "text" else (pdf_text(src["data"]) if src.get("media_type") == "application/pdf" else "")
            docs[b["content"]["url"]] = t
        if b["type"] == "text": text += b["text"]
    m = re.search(r"<json>(.*?)</json>", text, re.S) or re.search(r"(\{.*\})", text, re.S)
    try: ex = json.loads(m.group(1))
    except Exception: ex = {"found": False, "price_basis": "parse error", "raw": text[-500:]}
    su = ex.get("source_url") or ""
    src_text = docs.get(su) or next((t for u, t in docs.items() if u.rstrip("/") == su.rstrip("/")), None)
    q = norm(ex.get("source_quote"))
    ex["quote_verbatim"] = bool(src_text and q and q in norm(src_text))
    ex["source_fetched"] = src_text is not None
    return dict(target={k: target[k] for k in ("key", "who", "website", "chain", "venue_ids")}, prompt=prompt, model=EXTRACT_MODEL,
                extracted_at=datetime.now(timezone.utc).isoformat(), extraction=ex, sources={u: t[:60000] for u, t in docs.items()}, usage=j.get("usage"))

def targets(vtype="cinema"):
    V = json.load(open(f"data/{vtype}s.json")); T = {}
    for v in V:
        c = chain_of(v)
        if c:
            t = T.setdefault(c, dict(key=c, who=f"{CHAINS[c]['label']} (chain, London branches)", website=None, chain=c, venue_ids=[], cfg=CHAINS[c]))
            t["venue_ids"].append(v["id"])
        else:
            T[v["id"]] = dict(key=v["id"], who=f"{v['name']} ({vtype}, London{', postcode '+v['postcode'] if v.get('postcode') else ''})", website=v.get("website"), chain=None, venue_ids=[v["id"]], cfg=GENERIC)
    return list(T.values())

JUDGE = """You are grading an automated extraction of a venue's HIRE price against the source text it cites.
Venue/chain: {who} (OSM website tag: {site})
Extraction (JSON): {ex}
Source URL: {url}
Source text (fetched, may be truncated):
<<<
{src}
>>>
Check: (a) grounding - is every stated amount, unit, min spend, inclusion and capacity literally supported by the source text? is source_quote verbatim?
(b) correctness - is it actually a venue/screen HIRE or private-event price for THIS venue/chain (not tickets, memberships, food, or another venue)? is the unit right? is the headline amount the cheapest hire price stated?
(c) for found=false: is it right that no explicit hire price is in the text?
Reply ONLY JSON in <json></json>: {{"verdict":"pass"|"fail","grounded":bool,"correct":bool,"issues":[short strings],"fix_hint":"how the extractor/prompt should change"}}"""

def judge(rec):
    ex = {k: v for k, v in rec["extraction"].items() if k not in ("quote_verbatim", "source_fetched", "raw")}
    src = rec["sources"].get(ex.get("source_url") or "") or next((t for u, t in rec["sources"].items() if u.rstrip("/") == (ex.get("source_url") or "").rstrip("/")), None)
    if src is None:
        return dict(verdict="fail", grounded=False, correct=False, issues=["source URL was not fetched; cannot verify"], fix_hint="fetch the cited page")
    j = call(JUDGE_MODEL, [{"role": "user", "content": JUDGE.format(who=rec["target"]["who"], site=rec["target"].get("website"), ex=json.dumps(ex), url=ex.get("source_url"), src=src[:50000])}], max_tokens=3000)
    t = "".join(b.get("text", "") for b in j["content"] if b["type"] == "text")
    m = re.search(r"<json>(.*?)</json>", t, re.S)
    try: return json.loads(m.group(1))
    except Exception: return dict(verdict="fail", issues=["judge parse error"], raw=t[-300:])

def sqlq(s): return "null" if s is None else (str(s) if isinstance(s, (int, float)) else "'" + str(s).replace("'", "''") + "'")

def to_sql(tag):
    rows = []
    for f in sorted(os.listdir(f"{OUT}/{tag}")):
        r = json.load(open(f"{OUT}/{tag}/{f}")); ex = r["extraction"]; jd = r.get("judge", {})
        if not (ex.get("found") and jd.get("verdict") == "pass" and ex.get("price_amount_gbp")): continue
        chain = r["target"]["chain"]; official = ex.get("source_kind", "official") == "official"
        # chain rows reuse one branch's/brochure's price for every branch -> never 'high'
        conf = ("medium" if official else "low") if chain else ("high" if official and ex.get("quote_verbatim") else "medium")
        for vid in r["target"]["venue_ids"]:
            rows.append("(" + ",".join(sqlq(x) for x in [vid, ex.get("price_basis"), ex.get("price_amount_gbp"), ex.get("price_amount_max_gbp"), ex.get("price_unit"),
                ex.get("min_spend_gbp"), ex.get("included"), ex.get("capacity_per_screen"), ex.get("source_url"), ex.get("source_quote"), ex.get("source_kind", "official"),
                r["target"]["chain"], "chain" if chain else "venue", r["extracted_at"], conf, r["model"], JUDGE_MODEL]) + ")")
    sql = ("-- generated by scrapers/price_extract.py sql " + tag + " (judge-passed extractions only)\n"
           "insert into venue_price_sources(venue_id,price_basis,price_amount_gbp,price_amount_max_gbp,price_unit,min_spend_gbp,included,capacity_per_screen,source_url,source_quote,source_kind,chain,scope,extracted_at,confidence,extract_model,judge_model) values\n"
           + ",\n".join(rows) + "\non conflict (venue_id) do update set price_basis=excluded.price_basis,price_amount_gbp=excluded.price_amount_gbp,price_amount_max_gbp=excluded.price_amount_max_gbp,price_unit=excluded.price_unit,min_spend_gbp=excluded.min_spend_gbp,included=excluded.included,capacity_per_screen=excluded.capacity_per_screen,source_url=excluded.source_url,source_quote=excluded.source_quote,source_kind=excluded.source_kind,chain=excluded.chain,scope=excluded.scope,extracted_at=excluded.extracted_at,confidence=excluded.confidence,extract_model=excluded.extract_model,judge_model=excluded.judge_model;\nselect public.sync_venue_prices();\n")
    open("supabase/venue_prices_seed.sql", "w").write(sql); print(len(rows), "venue rows")

if __name__ == "__main__":
    a = sys.argv[1:]; cmd = a[0]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if cmd == "extract":
        tag = opt("--tag", opt("--prompt", "v2")); os.makedirs(f"{OUT}/{tag}", exist_ok=True)
        T = [t for t in targets(opt("--type", "cinema")) if not opt("--only") or re.search(opt("--only"), t["who"], re.I)]
        def go(t):
            p = f"{OUT}/{tag}/{t['key']}.json"
            if os.path.exists(p): return
            try: json.dump(extract(t, opt("--prompt", "v2")), open(p, "w"), indent=1); print("ok", t["who"], flush=True)
            except Exception as e: print("ERR", t["who"], e, flush=True)
        list(cf.ThreadPoolExecutor(8).map(go, T))
    elif cmd == "judge":
        tag = a[1]; fs = sorted(os.listdir(f"{OUT}/{tag}"))
        def g(f):
            p = f"{OUT}/{tag}/{f}"; r = json.load(open(p))
            if "judge" not in r or "--force" in a: r["judge"] = judge(r); json.dump(r, open(p, "w"), indent=1)
            return r
        R = list(cf.ThreadPoolExecutor(6).map(g, fs))
        P = [r for r in R if r["judge"].get("verdict") == "pass"]; F = [r for r in R if r["extraction"].get("found")]
        FP = [r for r in F if r["judge"].get("verdict") == "pass"]
        print(f"{tag}: targets {len(R)} | judge pass {len(P)}/{len(R)} = {100*len(P)/len(R):.0f}% | found-price {len(F)}, of which pass {len(FP)} | venues with sourced price {sum(len(r['target']['venue_ids']) for r in FP)}")
        for r in R:
            if r["judge"].get("verdict") != "pass": print(" FAIL", r["target"]["who"][:50], "|", "; ".join(r["judge"].get("issues", []))[:200])
    elif cmd == "merge":  # merge <out> <tag1> <tag2>...: per target keep first judge-passed record with a price, else first passed, else first
        out, tags = a[1], a[2:]; os.makedirs(f"{OUT}/{out}", exist_ok=True)
        for f in sorted(set().union(*[os.listdir(f"{OUT}/{t}") for t in tags])):
            R = [json.load(open(f"{OUT}/{t}/{f}")) for t in tags if os.path.exists(f"{OUT}/{t}/{f}")]
            ok = lambda r: r.get("judge", {}).get("verdict") == "pass"
            best = next((r for r in R if ok(r) and r["extraction"].get("found")), None) or next((r for r in R if ok(r)), R[0])
            json.dump(best, open(f"{OUT}/{out}/{f}", "w"), indent=1)
    elif cmd == "sql": to_sql(a[1])
