import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type L from "leaflet"
import { Search, Speaker, Monitor, Mic2, Accessibility, GlassWater, CheckCircle2, Layers, X, LocateFixed, Info, ShieldAlert, Shield, ShieldCheck, ChevronDown, TrainFront, CalendarDays, Users, PoundSterling, Circle as CircleIco, Sparkles, RotateCcw, ArrowLeft, Map as MapIco } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import MapView, { type Item } from "./MapView"
import Enquiry, { type EnqCtx } from "./Enquiry"
import { lazy, Suspense } from "react"
import type { Fly } from "./Map3D"
const RAMP = ["#8E4F7E", "#B48AA6", "#DCCFB4", "#A9C2A3", "#6B8F71", "#2F5D4C"]
const Map3D = lazy(() => import("./Map3D"))
import { P } from "./palette"
import { priceBreaks, PRICE_RAMP, TYPE_EMOJI, priceMid } from "./data"
import { DOT_SIZES } from "./MapView"
import { SB, KEY, DAYS, SLOTS, TYPES, type Venue, typeOf, isEx, capText, priceEst, freeScore, dominantSlot, fmtH } from "./data"

const MUSTS = [[Speaker, "PA system"], [Monitor, "Projector"], [Mic2, "Mics"], [Accessibility, "Step-free"], [GlassWater, "Bar"]] as const
const TODAY = DAYS[(new Date().getDay() + 6) % 7]
const BASE = "id,name,type,address,lat,lng,free:free_grid,basis,events:event_count,fee_label,url:source_url,transit_score,safety_score,nearest_station_name,nearest_station_m"
const CAP = "capacity_standing,capacity_seated,capacity_est_min_standing,capacity_est_max_standing,capacity_est_min_seated,capacity_est_max_seated,capacity_confidence"
const PRICE = "price_est_low,price_est_mid,price_est_high,price_est_unit,price_confidence,price_n_comparables"

async function loadVenues(): Promise<[Venue[], string]> {
  let extra = ""
  try { const r = await fetch(`${SB}/rest/v1/venues?select=*&limit=1`, { headers: { apikey: KEY } }); const j = r.ok ? await r.json() : []; extra = ["price_source_url", "price_basis"].filter(c => j[0] && c in j[0]).map(c => "," + c).join("") } catch {}
  const tries = [`${BASE}${extra},f:venue_features(${CAP},${PRICE})`, `${BASE},f:venue_features(${CAP},${PRICE})`, `${BASE},f:venue_features(${CAP})`]
  for (const sel of tries) {
    try {
      const url = `${SB}/rest/v1/venues?select=${sel}&order=id`, PG = 1000
      const get = (a: number, cnt = false) => fetch(url, { headers: { apikey: KEY, "Range-Unit": "items", Range: `${a}-${a + PG - 1}`, ...(cnt ? { Prefer: "count=exact" } : {}) } })
      const r = await get(0, true); if (!r.ok) continue
      const first: Venue[] = await r.json(); if (!first.length) continue
      const total = Math.min(+(r.headers.get("content-range")?.split("/")[1] || 0) || first.length, 40000)
      const offs: number[] = []; for (let a = PG; a < total; a += PG) offs.push(a)
      const rest = await Promise.all(offs.map(a => get(a).then(x => x.ok ? x.json() : [])))
      return [first.concat(...rest), "Supabase (live)"]
    } catch {}
  }
  const d = await (await fetch("data.json")).json(); return [d, "data.json fallback"]
}

function FeeBadge({ label }: { label?: string | null }) {
  let l = label || "Fee unknown"
  if (/^£0/.test(l)) return <Badge className="bg-canal text-white gap-1"><CheckCircle2 className="size-3" />{l}</Badge>
  if (/inimum spend/.test(l)) l = "Minimum spend, amount unknown"
  if (l === "fee unknown") l = "Fee unknown"
  return <Badge variant="outline" className="font-normal text-muted-foreground">{l}</Badge>
}
const ExBadge = ({ name }: { name: string }) => isEx(name) ? <Badge variant="outline" className="ml-1.5 align-middle border-orders text-orders text-[11px]">Example data</Badge> : null
const KINDS = [["meetup","Meetup or talk"],["comedy","Comedy night"],["gig","Gig or show"],["popup","Pop-up"],["screening","Film screening"],["workshop","Workshop"]]
const RADII = [["500","Within 500 m"],["1000","Within 1 km"],["2000","Within 2 km"],["5000","Within 5 km"]]
const DAYNAME: Record<string,string> = { Mon:"Monday", Tue:"Tuesday", Wed:"Wednesday", Thu:"Thursday", Fri:"Friday", Sat:"Saturday", Sun:"Sunday" }

/** 06:00 → 06:00 band; highlighted segment = chosen hours, with start/end labels */
function TimeBand({ hrs }: { hrs: [number, number] }) {
  const pct = (h: number) => ((h - 6) / 24) * 100
  const l = pct(hrs[0]), w = pct(hrs[1]) - l
  return (
    <div className="pt-6" aria-hidden>
      <div className="relative h-4 rounded-md bg-ink/[.07] ring-1 ring-inset ring-ink/10">
        {[12, 18, 24].map(h => <span key={h} className="absolute inset-y-1 w-px bg-ink/20" style={{ left: `${pct(h)}%` }} />)}
        <div className="band-lit absolute -inset-y-0.5 rounded-md bg-lamp ring-2 ring-ink/80" style={{ left: `${l}%`, width: `${w}%` }}>
          <span className="absolute -top-6 left-0 -translate-x-1/2 rounded bg-ink text-fog text-[11px] font-semibold px-1.5 py-0.5 whitespace-nowrap">{fmtH(hrs[0])}</span>
          <span className="absolute -top-6 right-0 translate-x-1/2 rounded bg-ink text-fog text-[11px] font-semibold px-1.5 py-0.5 whitespace-nowrap">{fmtH(hrs[1])}</span>
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1"><span>6am</span><span>Noon</span><span>6pm</span><span>Midnight</span><span>6am</span></div>
    </div>
  )
}

function Legend({ busy, slotLabel, nEst, is3d, breaks }: { busy: boolean; slotLabel: string; nEst: number; is3d?: boolean; breaks: number[] }) {
  const lab = (i: number) => i === 0 ? `<£${breaks[0]}` : i >= breaks.length ? `£${breaks[breaks.length - 1]}+` : `£${breaks[i - 1]}–${breaks[i]}`
  return (
    <div className="space-y-3 text-sm">
      
      <div>
        <div className="h-3 w-full rounded-sm" style={{ background: busy ? `linear-gradient(90deg,${P.free},${P.mid},${P.busy})` : `linear-gradient(90deg,${P.busy},${P.mid},${P.free})` }} />
        <div className="flex justify-between text-xs mt-1 text-muted-foreground"><span>{busy ? "Usually free" : "Usually busy"}</span><span className="font-semibold text-ink">{busy ? "Very likely busy" : "Very likely free"}</span></div>
        <p className="text-xs text-muted-foreground mt-1">Colour shows {busy ? "how busy" : "how likely free"} rooms are on {slotLabel}.</p>
      </div>
      {is3d ? <div>
        <p className="text-xs font-medium mb-1">Tower colour = est. spend per head</p>
        <div className="grid gap-0.5 text-[11px]" style={{ gridTemplateColumns: `repeat(${breaks.length + 1}, 1fr)` }}>{[...Array(breaks.length + 1)].map((_, i) => <div key={i}><div className="h-2.5 rounded-sm" style={{ background: PRICE_RAMP[i] }} /><span className="text-muted-foreground">{lab(i)}</span></div>)}</div>
        <p className="text-xs text-muted-foreground mt-1">Height = capacity (taller = bigger room). <span className="inline-block size-2.5 align-middle rounded-sm opacity-50 bg-[#A8A8A2]" /> Grey = price unknown. Hover a tower for how likely it is free.</p>
        <p className="text-xs font-medium mt-2 mb-1">Shape = room type</p>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground" data-testid="shape-legend">{([["cinema", "Wide hall + screen slab"], ["cafe", "Low cube + awning"], ["pub", "Gabled block"], ["bar", "Diamond + spire"], ["music", "Octagon drum"], ["community", "Stepped tiers"]] as const).map(([t, d]) => <li key={t}>{TYPE_EMOJI[t]} {d}</li>)}</ul>
      </div> : breaks.length > 0 && <div>
        <p className="text-xs font-medium mb-1">Dot size = est. spend per head</p>
        <div className="flex items-end gap-2 text-[11px] text-muted-foreground">{DOT_SIZES.slice(0, breaks.length + 1).map((d, i) => <div key={i} className="flex flex-col items-center gap-0.5"><span className="rounded-full border-2 border-ink bg-white" style={{ width: d * 0.7, height: d * 0.7 }} />{lab(i)}</div>)}</div>
        <p className="text-xs text-muted-foreground mt-1">Icons show the room type: {Object.entries(TYPE_EMOJI).map(([t, e]) => `${e} ${t}`).join(", ")}. Smallest dots: price unknown.</p>
      </div>}
      <ul className="grid gap-1.5 text-xs">
        <li className="flex items-center gap-2.5"><span className="size-3.5 rounded-full bg-ink ring-2 ring-white" />Room seen in Luma or Meetup listings</li>
        <li className="flex items-center gap-2.5"><span className="size-3.5 rounded-full bg-white border-2 border-ink" />Café, pub or bar from OpenStreetMap</li>
        {nEst > 0 && <li className="flex items-center gap-2.5"><span className="h-3.5 px-1 text-[10px] leading-3.5 rounded-sm bg-lamp/30 text-ink">Est.</span>Price estimated from {nEst} similar rooms nearby</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Pins match the list. Select one for details.</p>
    </div>
  )
}

const SAFETY_TIP = "Street crime in this ~1 km area vs other venue areas, police.uk Aug 2026"
export type CrimeCell = { gy: number; gx: number; n: number; score: number }
export function safetyBucket(x: number) { return x >= 67 ? { label: "Lower crime", Icon: ShieldCheck, color: "#43614A" } : x >= 34 ? { label: "Average", Icon: Shield, color: "#9A7B3F" } : { label: "Higher crime", Icon: ShieldAlert, color: "#8E4F7E" } }
function SafetyTag({ score }: { score: number }) {
  const b = safetyBucket(score)
  return <Tooltip><TooltipTrigger render={<span />} className="inline-flex items-center gap-1 font-medium align-middle" style={{ color: b.color }}><b.Icon className="size-3.5" />{b.label}</TooltipTrigger><TooltipContent className="max-w-60">{SAFETY_TIP}</TooltipContent></Tooltip>
}
const capNum = (v: Venue) => { const f = (Array.isArray(v.f) ? v.f[0] : v.f) || {}; return +(f.capacity_standing || f.capacity_seated || f.capacity_est_max_standing || f.capacity_est_max_seated || 0) }
const distM = (a: [number, number], b: [number, number]) => { const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) * k / 2), y = (b[0] - a[0]) * k; return 6371000 * Math.hypot(x, y) }
type Bx = [[number, number], [number, number]]
const PAGE = 50
const useMobile = () => { const q = "(max-width: 767px)"; const [m, setM] = useState(() => matchMedia(q).matches); useEffect(() => { const mm = matchMedia(q), f = () => setM(mm.matches); mm.addEventListener("change", f); return () => mm.removeEventListener("change", f) }, []); return m }

export default function App() {
  const mobile = useMobile()
  const [data, setData] = useState<Venue[]>([]), [src, setSrc] = useState("")
  const [day, setDay] = useState<string>("Wed"), [slot, setSlot] = useState<string>("evening")
  const [custom, setCustom] = useState(false), [range, setRange] = useState<[number, number]>([17, 21])
  const [busy, setBusy] = useState(false), [types, setTypes] = useState<string[]>(Object.keys(TYPES))
  const [hc, setHc] = useState("45"), [budget, setBudget] = useState("0"), [radius, setRadius] = useState("2000"), [kind, setKind] = useState("meetup")
  const [date, setDate] = useState(""), [sc, setSc] = useState<[number, number]>([51.4927, -0.2240])
  const todayISO = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}` })()
  const pickDate = (v: string) => { setDate(v); if (v) { const d = new Date(v + "T12:00:00"); setDay(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]) } }
  const [musts, setMusts] = useState<string[]>([]), [results, setResults] = useState<any[] | null>(null), [status, setStatus] = useState("")
  const [sortBy, setSortBy] = useState("match"), [minT, setMinT] = useState(0), [minS, setMinS] = useState(0), [freeOnly, setFreeOnly] = useState(false)
  const [here, setHere] = useState<[number, number] | null>(null), [locMsg, setLocMsg] = useState("")
  const [map, setMap] = useState<L.Map | null>(null), [enq, setEnq] = useState<EnqCtx | null>(null)
  const [is3d, setIs3d] = useState(() => new URLSearchParams(location.search).get("view") === "3d"), [fly, setFly] = useState<Fly>(null), [c3d, setC3d] = useState<[number, number]>([51.4927, -0.2240])
  const c3dLive = useRef<[number, number]>([51.4927, -0.2240])
  const [showKey, setShowKey] = useState(() => { try { return localStorage.getItem("ovdb-key") === "1" } catch { return false } })
  const toggleKey = (v: boolean) => { setShowKey(v); try { localStorage.setItem("ovdb-key", v ? "1" : "0") } catch {} }
  const [bounds, setBounds] = useState<Bx | null>(null), [mc, setMc] = useState<[number, number]>([51.4927, -0.2240])
  const [hot, setHot] = useState<string | null>(null), [sel, setSel] = useState<string | null>(null), selFromMap = useRef(false)
  const [chip, setChip] = useState<string | null>(null), [limit, setLimit] = useState(PAGE), [fitKey, setFitKey] = useState(0)
  const [anchor, setAnchor] = useState<[number, number] | null>(null), reAnchor = useRef(false)
  useEffect(() => { if (fitKey) reAnchor.current = true }, [fitKey])
  useEffect(() => { setAnchor(null) }, [sc])
  const [snap, setSnap] = useState(1), [dragH, setDragH] = useState<number | null>(null)
  const [vh, setVh] = useState(innerHeight); useEffect(() => { const f = () => setVh(innerHeight); addEventListener("resize", f); return () => removeEventListener("resize", f) }, [])
  const SNAPS = [148, Math.round(vh * 0.5), vh - 132], sheetH = dragH ?? SNAPS[snap]

  const hrs: [number, number] = custom ? range : (() => { const s = SLOTS.find(s => s.id === slot)!; return [s.from, s.to] })()
  const searchSlot = custom ? dominantSlot(range) : slot
  const slotLabel = `${day} ${fmtH(hrs[0])}–${fmtH(hrs[1])}`
  const score = useCallback((v: Venue) => { const f = freeScore(v, day, hrs); return busy ? 1 - f : f }, [day, hrs[0], hrs[1], busy])
  const counts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(v => { const t = typeOf(v); c[t] = (c[t] || 0) + 1 }); return c }, [data])
  const shown = useMemo(() => data.filter(v => types.includes(typeOf(v))), [data, types])
  const breaks = useMemo(() => priceBreaks(data), [data])
  const nEst = useMemo(() => data.filter(priceEst).length, [data])
  const [pins, setPins] = useState<any[] | null>(null)
  const byId = useMemo(() => { const m = new Map<string, Venue>(); data.forEach(v => m.set(String(v.id), v)); return m }, [data])

  /** Browse mode: the single source of truth for both list and map pins */
  const browse = useMemo<Item[]>(() => {
    const need = +hc || 0, bud = +budget || 0, R = +radius
    const out: Item[] = []
    for (const v of shown) {
      if (bounds && (v.lat < bounds[0][0] || v.lat > bounds[1][0] || v.lng < bounds[0][1] || v.lng > bounds[1][1])) continue
      const dist = distM(sc, [v.lat, v.lng]); if (dist > R) continue
      const cap = capNum(v); if (need && cap && cap < need) continue
      const pm = priceMid(v); if (bud && pm != null && pm > bud) continue
      if (minT && (v.transit_score ?? 0) < minT) continue
      if (minS && (v.safety_score ?? 0) < minS) continue
      const fr = freeScore(v, day, hrs); if (freeOnly && fr < 0.6) continue
      out.push({ v, free: fr, dist })
    }
    const key = sortBy === "transit" ? (i: Item) => -(i.v.transit_score ?? 0) : sortBy === "safety" ? (i: Item) => -(i.v.safety_score ?? 0) : sortBy === "near" ? (i: Item) => i.dist : (i: Item) => -(i.free * 2 + ((i.v.events || 0) > 0 ? 0.3 : 0)) + i.dist / 20000
    return out.sort((a, b) => key(a) - key(b))
  }, [shown, bounds, sc, radius, hc, budget, minT, minS, freeOnly, day, hrs[0], hrs[1], sortBy])
  const shortlist = useMemo<Item[] | null>(() => pins && pins.map((r: any) => { const v = byId.get(String(r.id)) || r; return { v: { ...v, ...(v.lat ? {} : { lat: r.lat, lng: r.lng }) }, free: r.likely_free ?? freeScore(v, day, hrs), dist: r.distance_m ?? distM(sc, [v.lat, v.lng]), rpc: r } }).filter((i: Item) => i.v.lat != null), [pins, byId])
  const list = shortlist ?? browse.slice(0, limit)
  const total = shortlist ? shortlist.length : browse.length
  useEffect(() => { setLimit(PAGE) }, [browse.length === 0, sc, types, hc, budget, radius, minT, minS, freeOnly, sortBy])

  function recentre(la: number, ln: number) { setSc([la, ln]); if (is3d) { c3dLive.current = [la, ln]; setFly({ lat: la, lng: ln, t: Date.now() }) } else map?.setView([la, ln], 15, { animate: false }) }
  function locate() {
    if (!navigator.geolocation) { setLocMsg("Your browser can't share location."); return }
    setLocMsg("Finding you…")
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: la, longitude: ln } = p.coords
      if (la < 51.28 || la > 51.70 || ln < -0.52 || ln > 0.34) { setLocMsg("You seem to be outside London, so we kept the current area."); return }
      setHere([la, ln]); setLocMsg(""); setPins(null); recentre(la, ln)
    }, e => setLocMsg(e.code === 1 ? "Location permission was denied." : "Couldn't get your location."), { timeout: 8000, maximumAge: 60000 })
  }
  const [crimeOn, setCrimeOn] = useState(false), [crime, setCrime] = useState<CrimeCell[] | null>(null)
  async function toggleCrime(v: boolean) {
    setCrimeOn(v); if (!v || crime) return
    try {
      const pages = await Promise.all([0, 1000, 2000].map(o => fetch(`${SB}/rest/v1/crime_cells?select=gy,gx,crime_count&order=gy,gx&limit=1000&offset=${o}`, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : [])))
      const rows: { gy: number; gx: number; crime_count: number }[] = pages.flat()
      const sorted = rows.map(x => x.crime_count).sort((a, b) => a - b)
      setCrime(rows.map(x => { const below = sorted.findIndex(c => c >= x.crime_count); return { gy: x.gy, gx: x.gx, n: x.crime_count, score: Math.round(100 * (1 - below / Math.max(1, sorted.length - 1))) } }))
    } catch { setCrime([]) }
  }
  const [place, setPlace] = useState(""), [placeMsg, setPlaceMsg] = useState("")
  async function centreOn() {
    const q = place.trim(); if (!q) return
    setPlaceMsg("Looking up…")
    try {
      let at: [number, number] | null = null
      if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(q)) {
        const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}`); if (r.ok) { const j = await r.json(); at = [j.result.latitude, j.result.longitude] }
      }
      if (!at) {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&viewbox=-0.52,51.70,0.34,51.28&bounded=1&q=${encodeURIComponent(q)}`)
        const j = r.ok ? await r.json() : []; if (j[0]) at = [+j[0].lat, +j[0].lon]
      }
      if (!at) { setPlaceMsg(`Couldn't find "${q}" in London. Try a postcode or station.`); return }
      setPlaceMsg(""); setPins(null); recentre(at[0], at[1])
    } catch { setPlaceMsg("Place search is unavailable right now.") }
  }
  async function search() {
    const c = { lat: mc[0], lng: mc[1] }
    setStatus("Searching…"); setSc([c.lat, c.lng]); setChip(null)
    try {
      const base = { lat: c.lat, lng: c.lng, radius_m: +radius, min_capacity: +hc || null, max_budget: budget === "" ? null : +budget, weekday: day, slot: searchSlot, types, lim: 15 }
      const extra: Record<string, any> = {}; if (sortBy === "transit" || sortBy === "safety") extra.sort = sortBy; if (minT) extra.min_transit_score = minT; if (minS) extra.min_safety_score = minS
      const call = (b: any) => fetch(`${SB}/rest/v1/rpc/search_venues`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(b) })
      let r = await call({ ...base, ...extra })
      if (!r.ok && Object.keys(extra).length) r = await call(base)
      if (!r.ok) throw r.status
      const rs = await r.json(); setResults(rs); setPins(rs); setFitKey(k => k + 1); setStatus(rs.length ? "" : "No rooms match those filters here. Try a wider radius or fewer people."); if (mobile) setSnap(1)
    } catch { setResults([]); setStatus("Search unavailable (Supabase unreachable).") }
  }
  useEffect(() => { loadVenues().then(([d, s]) => { setData(d.filter(v => v.lat)); setSrc(s) }) }, [])

  const slotObj = SLOTS.find(s => s.id === slot)!
  const dayLabel = date ? new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") : DAYNAME[day]
  const whenText = `${date ? dayLabel : day} ${custom ? `${fmtH(range[0])}–${fmtH(range[1])}` : slotObj.label.toLowerCase()}`
  const allTypes = Object.keys(TYPES)
  const resetFilters = () => { setTypes(allTypes); setMusts([]); setBudget("0"); setRadius("2000"); setHc("45"); setMinT(0); setMinS(0); setSortBy("match"); setFreeOnly(false) }
  const nActive = (types.length !== allTypes.length ? 1 : 0) + (budget !== "0" && budget !== "" ? 1 : 0) + (radius !== "2000" ? 1 : 0) + (hc !== "45" ? 1 : 0) + (minT ? 1 : 0) + (minS ? 1 : 0) + (freeOnly ? 1 : 0)
  const moved = distM(anchor ?? sc, mc) > Math.max(300, +radius * 0.35)
  const selectItem = (id: string, fromMap: boolean) => { selFromMap.current = fromMap; setSel(s => (!fromMap && s === id) ? null : id); if (fromMap && mobile && snap === 0) setSnap(1) }
  useEffect(() => { if (sel && selFromMap.current) document.getElementById(`r-${sel}`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }) }, [sel])
  useEffect(() => { if (sel && !list.some(i => String(i.v.id) === sel)) setSel(null) }, [list])
  const focusVenue = (v: Venue) => { if (is3d) setFly({ lat: v.lat, lng: v.lng, t: Date.now() }); else if (map) { if (map.getZoom() >= 14) map.panTo([v.lat, v.lng]); else map.setView([v.lat, v.lng], 15) } }
  const typeLabel = types.length === allTypes.length ? "All types" : types.length === 1 ? types[0][0].toUpperCase() + types[0].slice(1) : `${types.length} types`
  const bucket = minS === 67 ? "Lower crime" : minS === 34 ? "Average+" : "Safety"
  const CHIPS: [string, string, any, boolean][] = [
    ["when", whenText, CalendarDays, true], ["types", typeLabel, null, types.length !== allTypes.length], ["people", `${hc || "Any"} people`, Users, hc !== "45"],
    ["budget", +budget ? `Up to £${budget}` : "Any price", PoundSterling, !!+budget], ["radius", RADII.find(r => r[0] === radius)?.[1].replace("Within ", "") || "", CircleIco, radius !== "2000"],
    ["transit", minT ? `Transit ${minT}+` : "Transit", TrainFront, !!minT], ["safety", bucket, ShieldCheck, !!minS],
  ]
  const chipCls = (on: boolean, open: boolean) => `shrink-0 h-9 md:h-8 inline-flex items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors ${open ? "bg-ink text-fog border-ink" : on ? "bg-lamp/15 border-lamp text-lampink" : "bg-white border-ink/15 text-ink hover:bg-ink/5"}`

  const toolbar = (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-full bg-white border border-ink/15 shadow-sm pl-4 pr-1.5 h-12 focus-within:ring-2 focus-within:ring-ink/30" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); centreOn() } }}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input aria-label="Search a place or postcode" placeholder="Search a place or postcode" className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-muted-foreground" value={place} onChange={e => setPlace(e.target.value)} />
        {place && <button aria-label="Clear" onClick={() => { setPlace(""); setPlaceMsg("") }} className="size-9 grid place-items-center rounded-full hover:bg-ink/10"><X className="size-4" /></button>}
        <button aria-label="Use my location" title="Use my location" onClick={locate} className="size-9 grid place-items-center rounded-full hover:bg-ink/10"><LocateFixed className="size-4" /></button>
      </div>
      {(placeMsg || locMsg) && <p role="status" className="text-xs text-muted-foreground px-2 bg-white/90 rounded">{placeMsg || locMsg}</p>}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-0.5" role="toolbar" aria-label="Filters">
        {CHIPS.map(([k, l, Ic, on]) => <button key={k} aria-expanded={chip === k} onClick={() => { setChip(chip === k ? null : k); if (mobile && chip !== k && snap === 0) setSnap(1) }} className={chipCls(on, chip === k)}>{Ic && <Ic className="size-3.5" />}{l}<ChevronDown className={`size-3.5 transition-transform ${chip === k ? "rotate-180" : ""}`} /></button>)}
        <button aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)} className={chipCls(freeOnly, false)}><Sparkles className="size-3.5" />Likely free</button>
        <button aria-pressed={crimeOn} onClick={() => toggleCrime(!crimeOn)} className={chipCls(crimeOn, false)}><MapIco className="size-3.5" />Crime map</button>
        {nActive > 0 && <button onClick={resetFilters} className="shrink-0 h-9 md:h-8 inline-flex items-center gap-1 px-2 text-sm text-muted-foreground hover:text-ink"><RotateCcw className="size-3.5" />Reset</button>}
      </div>
    </div>
  )
  const panel = chip && (
    <div className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm space-y-3" role="region" aria-label="Filter options">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">{({ when: "When", types: "Kinds of room", people: "People", budget: "Room fee budget", radius: "Distance from search centre", transit: "Public transport", safety: "Street safety" } as any)[chip]}</h3>
        <button onClick={() => setChip(null)} className="text-sm font-semibold text-canal hover:underline px-2 h-8">Done</button></div>
      {chip === "when" && WhenPanel()}
      {chip === "types" && <>
        <div className="flex gap-3"><button type="button" className={mini} onClick={() => setTypes(allTypes)}>Select all</button><button type="button" className={mini} onClick={() => setTypes([])}>Clear</button></div>
        <ToggleGroup multiple aria-label="Kinds of room" variant="outline" size="sm" spacing={2} value={types} onValueChange={v => setTypes(v as string[])} className="flex-wrap justify-start">
          {Object.entries(TYPES).map(([t]) => <ToggleGroupItem key={t} value={t} className="h-9 rounded-full bg-white text-muted-foreground hover:bg-ink/5 data-[pressed]:bg-ink data-[pressed]:text-fog data-[pressed]:border-ink [&[data-pressed]_.cnt]:text-fog/70">
            {TYPE_EMOJI[t]} {t[0].toUpperCase() + t.slice(1)} <span className="cnt text-muted-foreground">{counts[t] || 0}</span></ToggleGroupItem>)}
        </ToggleGroup></>}
      {chip === "people" && <div className="flex flex-wrap gap-2">{["10", "25", "45", "80", "150", "300"].map(n => <button key={n} onClick={() => setHc(n)} className={chipCls(false, hc === n)}>{n}+</button>)}<Input type="number" inputMode="numeric" aria-label="People" className="w-24 h-9" value={hc} onChange={e => setHc(e.target.value)} /><p className="text-xs text-muted-foreground w-full">Hides rooms known to be smaller. Rooms with unknown capacity stay in.</p></div>}
      {chip === "budget" && <div className="flex flex-wrap gap-2">{[["0", "Any"], ["10", "£10"], ["20", "£20"], ["40", "£40"], ["100", "£100"]].map(([n, l]) => <button key={n} onClick={() => setBudget(n)} className={chipCls(false, budget === n)}>{l}</button>)}<p className="text-xs text-muted-foreground w-full">Uses estimated spend per head. Rooms with no price stay in.</p></div>}
      {chip === "radius" && <div className="flex flex-wrap gap-2">{RADII.map(([r, l]) => <button key={r} onClick={() => setRadius(r)} className={chipCls(false, radius === r)}>{l.replace("Within ", "")}</button>)}<p className="text-xs text-muted-foreground w-full">The dashed circle on the map. Move the map and tap "Search this area" to move it.</p></div>}
      {chip === "transit" && <div className="flex flex-wrap gap-2">{[[0, "Any"], [50, "50+ (good)"], [70, "70+ (great)"]].map(([n, l]) => <button key={n} onClick={() => setMinT(+n)} className={chipCls(false, minT === n)}>{l}</button>)}<button onClick={() => setSortBy(sortBy === "transit" ? "match" : "transit")} className={chipCls(false, sortBy === "transit")}>Sort by transit</button><p className="text-xs text-muted-foreground w-full">Score from walking distance to the nearest TfL station.</p></div>}
      {chip === "safety" && <div className="flex flex-wrap gap-2">{[[0, "Any", Shield], [34, "Average or better", Shield], [67, "Lower crime only", ShieldCheck]].map(([n, l, I]: any) => <button key={n} onClick={() => setMinS(n)} className={chipCls(false, minS === n)}><I className="size-3.5" />{l}</button>)}<button onClick={() => setSortBy(sortBy === "safety" ? "match" : "safety")} className={chipCls(false, sortBy === "safety")}>Sort by safety</button><p className="text-xs text-muted-foreground w-full">{SAFETY_TIP}.</p></div>}
    </div>
  )
  const results_ = (
    <section aria-label="Results" aria-live="polite" className="space-y-2">
      {shortlist ? <div className="flex items-center gap-2 rounded-xl bg-ink text-fog px-3 py-2 text-sm"><span className="flex-1">Top {shortlist.length} for {whenText}, {hc} people</span><button onClick={() => { setPins(null); setResults(null) }} className="inline-flex items-center gap-1 rounded-full bg-fog/15 hover:bg-fog/25 px-3 h-8 font-semibold"><ArrowLeft className="size-3.5" />Show all venues</button></div>
        : <div className="flex items-center justify-between gap-2"><p className="text-sm" data-testid="count"><b className="tabular-nums">{total.toLocaleString()}</b> {total === 1 ? "venue" : "venues"} in this area{total > list.length ? <span className="text-muted-foreground">, showing {list.length}</span> : ""}</p>
          <select aria-label="Sort by" value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-8 rounded-full border border-ink/15 bg-white px-2 text-sm"><option value="match">Best match</option><option value="near">Nearest</option><option value="transit">Near transit</option><option value="safety">Lower crime</option></select></div>}
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {!shortlist && <Button size="lg" className="w-full h-11 rounded-full bg-ink hover:bg-ink/85 text-fog" disabled={status === "Searching…"} onClick={search}><Sparkles className="size-4" />{status === "Searching…" ? "Searching…" : `Find best rooms for ${whenText}`}</Button>}
      {data.length > 0 && list.length === 0 && !status && <p className="text-sm text-muted-foreground py-6 text-center">No venues here with these filters. Zoom out, widen the distance or reset filters.</p>}
      {!data.length && <p className="text-sm text-muted-foreground py-6 text-center">Loading 12,000+ London venues…</p>}
      <ol className="divide-y divide-ink/10">{list.map((it, i) => Row(it, i))}</ol>
      {!shortlist && total > list.length && <Button variant="outline" className="w-full rounded-full" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, total - list.length)} more</Button>}
      <p className="text-[11px] leading-relaxed text-muted-foreground pt-3">Estimates only. Café, pub and bar scores come from opening hours, event rooms from Luma and Meetup listings. "~" capacities come from building size{nEst ? ", \"Est.\" prices from similar rooms nearby" : ""}. Map © OpenStreetMap contributors. Data: {src}.</p>
    </section>
  )
  const mapEl = is3d
    ? <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">Loading 3D map…</div>}><Map3D venues={shown} score={score} center={c3d} fly={fly} onCenter={(c, b) => { c3dLive.current = c; setMc(c); setBounds(b); if (reAnchor.current) { reAnchor.current = false; setAnchor(c) } }} breaks={breaks} here={here} ring={[sc[0], sc[1], +radius]} items={list} numbered={!!shortlist} fitKey={fitKey} onSelect={id => selectItem(id, true)} sel={sel} /></Suspense>
    : <MapView venues={shown} items={list} numbered={!!shortlist} fitKey={fitKey} padB={mobile ? sheetH : 0} score={score} onMap={setMap} onBounds={(b, c) => { setBounds([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]); setMc([c.lat, c.lng]); if (reAnchor.current) { reAnchor.current = false; setAnchor([c.lat, c.lng]) } }} crime={crimeOn ? crime : null} breaks={breaks} here={here} ring={[sc[0], sc[1], +radius]} hot={hot} sel={sel} onHover={setHot} onSelect={id => selectItem(id, true)} />
  const ctrlBottom = mobile ? sheetH + 12 : 24
  const floating = <>
    {moved && <button onClick={() => { if (shortlist) search(); else setSc(mc) }} className="absolute left-1/2 -translate-x-1/2 z-[1000] h-10 px-4 rounded-full bg-white border border-ink/15 shadow-lg text-sm font-semibold inline-flex items-center gap-2 hover:bg-fog" style={{ top: mobile ? "calc(env(safe-area-inset-top) + 124px)" : 16 }}><Search className="size-4" />Search this area</button>}
    <div className="absolute right-3 md:right-4 z-[1000] flex flex-col items-end gap-2" style={{ bottom: mobile ? ctrlBottom : 96 }}>
      {showKey && <div id="map-key" className="w-72 max-w-[calc(100vw-1.5rem)] max-h-[45vh] overflow-auto bg-white/95 backdrop-blur rounded-xl border border-ink/15 shadow-lg p-4">
        <div className="flex items-center justify-between mb-2"><h3 className="font-heading text-base font-semibold">How to read the map</h3>
          <button onClick={() => toggleKey(false)} aria-label="Hide map key" className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-ink/10"><X className="size-4" /></button></div>
        <Legend busy={busy} slotLabel={slotLabel} nEst={nEst} is3d={is3d} breaks={breaks} /></div>}
      <div className="flex gap-2">
        <div role="group" aria-label="Map view" className="inline-flex rounded-full border border-ink/15 bg-white shadow-md p-0.5">
          {[["2d", "2D"], ["3d", "3D"]].map(([k, l]) => <button key={k} aria-pressed={(k === "3d") === is3d} onClick={() => { if ((k === "3d") === is3d) return; if (k === "3d") { const c = map?.getCenter(); if (c) { setC3d([c.lat, c.lng]); c3dLive.current = [c.lat, c.lng] } setMap(null) } setIs3d(k === "3d") }} className={`h-10 md:h-9 px-3.5 rounded-full text-sm font-semibold ${(k === "3d") === is3d ? "bg-ink text-fog" : "text-ink hover:bg-ink/10"}`}>{l}</button>)}
        </div>
        <button onClick={() => toggleKey(!showKey)} aria-expanded={showKey} aria-controls="map-key" aria-label={showKey ? "Hide map key" : "Show map key"} title="Map key" className={`size-11 md:size-10 grid place-items-center rounded-full border shadow-md ${showKey ? "bg-ink text-fog border-ink" : "bg-white border-ink/15 hover:bg-fog"}`}><Layers className="size-4" /></button>
      </div>
    </div>
    {crimeOn && <div className="absolute z-[1000] left-3 md:left-4 rounded-full bg-white/95 border border-ink/10 shadow px-3 py-1.5 text-xs flex gap-3" style={{ bottom: mobile ? ctrlBottom + 56 : 24 }}>{[80, 50, 10].map(x => { const b = safetyBucket(x); return <span key={x} className="inline-flex items-center gap-1"><b.Icon className="size-3.5" style={{ color: b.color }} />{b.label}</span> })}{is3d && <span className="text-muted-foreground">2D only</span>}{crime === null && <span>Loading…</span>}</div>}
  </>

  // ---- bottom sheet drag (mobile) ----
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null)
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: sheetH, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dy = d.y - e.clientY; if (Math.abs(dy) > 4) d.moved = true; if (d.moved) setDragH(Math.max(SNAPS[0] - 40, Math.min(SNAPS[2], d.h + dy))) }
  const onUp = () => { const d = drag.current; drag.current = null; if (!d) return
    if (!d.moved) { setSnap(s => s === 2 ? 0 : s + 1); setDragH(null); return }
    const h = dragH ?? d.h, v = h - d.h; let best = 0; SNAPS.forEach((s, i) => { if (Math.abs(s - h) < Math.abs(SNAPS[best] - h)) best = i })
    if (Math.abs(v) > 60 && best === snap) best = Math.max(0, Math.min(2, snap + (v > 0 ? 1 : -1)))
    setSnap(best); setDragH(null) }

  return (
    <TooltipProvider>
    {enq && <Enquiry ctx={enq} onClose={() => setEnq(null)} />}
    {mobile ? (
      <div className="fixed inset-0 text-ink bg-fog overflow-hidden">
        <div className="absolute inset-0">{mapEl}</div>
        <div className="absolute inset-x-0 top-0 z-[1100] px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 bg-gradient-to-b from-fog/90 via-fog/60 to-transparent">{toolbar}</div>
        {floating}
        <div data-testid="sheet" data-snap={snap} className="absolute inset-x-0 bottom-0 z-[1200] bg-fog rounded-t-3xl shadow-[0_-6px_24px_#0002] flex flex-col" style={{ height: sheetH, transition: dragH == null ? "height .25s ease" : "none" }}>
          <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" tabIndex={0} aria-label="Drag or tap to resize the results panel" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSnap(s => s === 2 ? 0 : s + 1) }} data-testid="sheet-handle" className="touch-none cursor-grab pt-2.5 pb-2 px-4 select-none">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-ink/25" />
            <p className="text-center text-sm font-semibold mt-2">{shortlist ? `Top ${shortlist.length} matches` : `${total.toLocaleString()} venues in this area`}</p>
          </div>
          {panel && <div className="shrink-0 max-h-[45%] overflow-y-auto px-4 pb-2">{panel}</div>}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] space-y-3" id="list-scroll">{results_}</div>
        </div>
      </div>
    ) : (
      <div className="flex h-full w-full text-ink bg-fog">
        <aside className="w-[420px] shrink-0 h-full border-r border-ink/10 flex flex-col z-40 bg-fog">
          <div className="px-4 pt-4 pb-3 space-y-3 border-b border-ink/10">
            <div className="flex items-baseline justify-between px-1"><h1 className="font-heading text-[22px] font-semibold tracking-[-0.02em]">Offpeak</h1><span className="text-xs text-muted-foreground">Quiet London rooms for community events</span></div>
            {toolbar}
            {panel && <div className="max-h-[45vh] overflow-y-auto">{panel}</div>}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" id="list-scroll">{results_}</div>
        </aside>
        <main className="flex-1 relative">{mapEl}{floating}</main>
      </div>
    )}
    </TooltipProvider>
  )

  function Row(it: Item, i: number) {
    const v = it.v, r = it.rpc || {}, id = String(v.id), p = Math.round(100 * (busy ? 1 - it.free : it.free)), pe = priceEst(v), open = sel === id
    const barC = p >= 70 ? P.free : p >= 40 ? P.accentInk : P.busy
    const t = typeOf(v), st = v.nearest_station_name ?? r.nearest_station_name, stm = v.nearest_station_m ?? r.nearest_station_m, saf = v.safety_score ?? r.safety_score
    return (
      <li key={id} id={`r-${id}`} data-testid="result" data-id={id} onMouseEnter={() => setHot(id)} onMouseLeave={() => setHot(null)} className={`relative -mx-2 px-2 rounded-xl transition-colors ${open ? "bg-white ring-1 ring-ink/15 shadow-sm my-1" : hot === id ? "bg-ink/[.05]" : ""}`}>
        <button className="w-full text-left py-3 flex gap-3 items-start" aria-expanded={open} onClick={() => { selectItem(id, false); focusVenue(v) }}>
          <span className={`shrink-0 size-9 grid place-items-center rounded-full text-base ${shortlist ? "bg-ink text-fog text-sm font-semibold" : "bg-white border border-ink/15"}`}>{shortlist ? i + 1 : TYPE_EMOJI[t]}</span>
          <span className="flex-1 min-w-0">
            <span className="flex justify-between gap-2"><span className="font-semibold text-[15px] leading-snug truncate">{v.name}<ExBadge name={v.name} /></span><span className="text-sm font-semibold whitespace-nowrap tabular-nums" style={{ color: barC }}>{p}% {busy ? "busy" : "free"}</span></span>
            <span className="block text-[13px] text-muted-foreground truncate">{t[0].toUpperCase() + t.slice(1)} · {(it.dist / 1000).toFixed(1)} km · {v.f ? capText(v).replace(/ \(.*\)$/, "") : r.capacity ? `holds ${r.capacity}` : "capacity unknown"}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] mt-0.5">
              {pe && <span className="text-ink">Est. £{Math.round(pe.low)}–£{Math.round(pe.high)}{pe.unit === "gbp_per_head" ? "/head" : ""}</span>}
              {st && <span className="inline-flex items-center gap-1 text-muted-foreground"><TrainFront className="size-3.5" />{stm != null ? `${Math.max(1, Math.round(stm / 80))} min` : ""} {st}</span>}
              {saf != null && <SafetyTag score={saf} />}
            </span>
          </span>
        </button>
        {open && <div className="pb-3 pl-12 space-y-2.5">
          <div className="flex flex-wrap gap-1.5"><FeeBadge label={v.fee_label ?? r.fee_label} />{pe?.conf && <Badge variant="outline" className="font-normal">{pe.conf} confidence price</Badge>}</div>
          {v.price_basis && <p className="text-[13px]" data-testid="price-basis"><span className="text-muted-foreground">Price basis: </span>{String(v.price_basis)}</p>}
          {v.address && <p className="text-[13px] text-muted-foreground">{v.address}</p>}
          <p className="text-xs text-muted-foreground">Free estimate for {DAYNAME[day]} {searchSlot}{v.basis ? `, based on ${v.basis}` : ""}. Not a confirmed slot.</p>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full bg-ink text-fog hover:bg-ink/85 h-9" onClick={() => setEnq({ venue: v.name, vtype: v.type, address: v.address, email: v.email, cap: v.f ? capText(v) : undefined, fee: v.fee_label ?? r.fee_label, kind: KINDS.find(k => k[0] === kind)?.[1] || "event", people: hc, when: `${dayLabel} ${custom ? `${fmtH(range[0])} to ${fmtH(range[1])}` : `${slotObj.label.toLowerCase()} (${slotObj.hours.replace("–", ":00 to ")}:00)`}`, budget, musts })}>Draft an enquiry</Button>
            {(v.url || r.source_url) && <a href={v.url || r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center h-9 px-3 rounded-full border border-ink/15 text-sm font-medium hover:bg-ink/5">Source page</a>}
            {typeof v.price_source_url === "string" && /^https?:/.test(v.price_source_url) && <a href={v.price_source_url} target="_blank" rel="noreferrer" data-testid="price-source" className="inline-flex items-center h-9 px-3 rounded-full border border-ink/15 text-sm font-medium hover:bg-ink/5">Price source</a>}
          </div>
        </div>}
      </li>)
  }

  function WhenPanel() {
    return (
      <div className="space-y-3">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {DAYS.map(d => <button key={d} aria-pressed={day === d} aria-label={DAYNAME[d] + (d === TODAY ? ", today" : "")} onClick={() => { setDay(d); setDate("") }} className={`shrink-0 h-9 min-w-11 px-2 rounded-full text-sm font-medium ${day === d ? "bg-ink text-fog" : "hover:bg-ink/10 text-muted-foreground"}`}>{d}{d === TODAY && <span aria-hidden className="ml-0.5 size-1.5 rounded-full bg-lamp inline-block align-top" />}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Date <input type="date" aria-label="Specific date" min={todayISO} value={date} onChange={e => pickDate(e.target.value)} className="h-9 rounded-md border border-ink/15 bg-white px-2 text-sm" /></label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={custom} onCheckedChange={setCustom} />Pick hours</label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={busy} onCheckedChange={setBusy} className="data-[checked]:bg-orders" />Show busy</label>
        </div>
        <TimeBand hrs={hrs} />
        {!custom ? (
          <div className="grid grid-cols-4 gap-1">{SLOTS.map(s => <button key={s.id} aria-pressed={slot === s.id} onClick={() => setSlot(s.id)} className={`py-1.5 px-2 rounded-lg text-left border ${slot === s.id ? "bg-ink text-fog border-ink" : "border-ink/10 hover:bg-ink/5"}`}><span className="block text-sm font-semibold">{s.label}</span><span className={`block text-xs ${slot === s.id ? "text-fog/75" : "text-muted-foreground"}`}>{s.hours.replace("–", "–")}</span></button>)}</div>
        ) : (
          <div className="space-y-1"><Slider aria-label="Hours" min={6} max={30} step={1} value={range} onValueChange={v => setRange(v as [number, number])} /><p className="text-sm font-semibold">{fmtH(range[0])} to {fmtH(range[1])}</p></div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Event type</span><select value={kind} onChange={e => setKind(e.target.value)} className="w-full h-9 rounded-md border border-ink/15 bg-white px-2">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="space-y-1"><span className="text-xs text-muted-foreground flex items-center gap-1">Must have <Tooltip><TooltipTrigger aria-label="Why must-haves don't filter yet" className="rounded-sm"><Info className="size-3" /></TooltipTrigger><TooltipContent className="max-w-60">Saved into your enquiry. We don't have equipment data for most rooms yet, so these don't filter.</TooltipContent></Tooltip></span>
            <div className="flex flex-wrap gap-1">{MUSTS.map(([Icon, l]) => <button key={l} title={l} aria-label={l} aria-pressed={musts.includes(l)} onClick={() => setMusts(m => m.includes(l) ? m.filter(x => x !== l) : [...m, l])} className={`size-9 grid place-items-center rounded-md border ${musts.includes(l) ? "bg-ink text-fog border-ink" : "border-ink/15 bg-white"}`}><Icon className="size-4" /></button>)}</div></div>
        </div>
      </div>
    )
  }
}
const mini = "text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-ink rounded-sm"
