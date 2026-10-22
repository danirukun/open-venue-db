import { useCallback, useEffect, useMemo, useState } from "react"
import type L from "leaflet"
import { MapPin, Search, Users, Speaker, Monitor, Mic2, Accessibility, GlassWater, CheckCircle2, Clock, SlidersHorizontal, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import MapView from "./MapView"
import { SB, KEY, DAYS, SLOTS, TYPES, type Venue, typeOf, isEx, capText, priceEst, freeScore, dominantSlot, fmtH } from "./data"

const MUSTS = [[Speaker, "PA system"], [Monitor, "Projector"], [Mic2, "Mics"], [Accessibility, "Step-free"], [GlassWater, "Bar"]] as const
const TODAY = DAYS[(new Date().getDay() + 6) % 7]
const BASE = "id,name,type,lat,lng,free:free_grid,basis,events:event_count,fee_label,url:source_url"
const CAP = "capacity_standing,capacity_seated,capacity_est_min_standing,capacity_est_max_standing,capacity_est_min_seated,capacity_est_max_seated,capacity_confidence"
const PRICE = "price_est_low,price_est_mid,price_est_high,price_est_unit,price_confidence,price_n_comparables"

async function loadVenues(): Promise<[Venue[], string]> {
  const tries = [`${BASE},f:venue_features(${CAP},${PRICE})`, `${BASE},f:venue_features(${CAP})`]
  for (const sel of tries) {
    try { const r = await fetch(`${SB}/rest/v1/venues?select=${sel}&limit=5000`, { headers: { apikey: KEY } }); if (r.ok) { const d = await r.json(); if (d.length) return [d, "Supabase (live)"] } } catch {}
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
const KINDS = [["meetup","Meetup or talk"],["comedy","Comedy night"],["gig","Gig or show"],["popup","Pop-up"],["workshop","Workshop"]]
const RADII = [["500","Within 500 m"],["1000","Within 1 km"],["2000","Within 2 km"],["5000","Within 5 km"]]
const DAYNAME: Record<string,string> = { Mon:"Monday", Tue:"Tuesday", Wed:"Wednesday", Thu:"Thursday", Fri:"Friday", Sat:"Saturday", Sun:"Sunday" }

/** 06:00 → 06:00 band; lit segment = chosen hours */
function TimeBand({ hrs }: { hrs: [number, number] }) {
  const pct = (h: number) => ((h - 6) / 24) * 100
  return (
    <div className="relative h-2 rounded-full bg-ink/90" aria-hidden>
      <div className="band-lit absolute inset-y-0 rounded-full bg-lamp shadow-[0_0_12px_#F2B134]" style={{ left: `${pct(hrs[0])}%`, width: `${pct(hrs[1]) - pct(hrs[0])}%` }} />
    </div>
  )
}

function Legend({ busy, slotLabel, nEst }: { busy: boolean; slotLabel: string; nEst: number }) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-heading text-base font-semibold">How to read the map</h3>
      <div>
        <div className="h-3 w-full rounded-sm" style={{ background: busy ? "linear-gradient(90deg,#2E6F6A,#F2B134,#E8D9B0,#A23B5A)" : "linear-gradient(90deg,#A23B5A,#E8D9B0,#F2B134,#2E6F6A)" }} />
        <div className="flex justify-between text-xs mt-1 text-muted-foreground"><span>{busy ? "Usually free" : "Usually busy"}</span><span className="font-semibold text-ink">{busy ? "Very likely busy" : "Very likely free"}</span></div>
        <p className="text-xs text-muted-foreground mt-1">Colour shows {busy ? "how busy" : "how likely free"} rooms are on {slotLabel}.</p>
      </div>
      <ul className="grid gap-1.5 text-xs">
        <li className="flex items-center gap-2.5"><span className="size-3.5 rounded-full bg-ink ring-2 ring-white" />Room seen in Luma or Meetup listings</li>
        <li className="flex items-center gap-2.5"><span className="size-3.5 rounded-full bg-white border-2 border-ink" />Café, pub or bar from OpenStreetMap</li>
        <li className="flex items-center gap-2.5"><span className="size-3.5 border border-ink/60" />Area about 300 m wide. Hover to see prices.</li>
        <li className="flex items-center gap-2.5"><span className="size-3.5 hatched border border-ink/30" />Area with no stated prices</li>
        {nEst > 0 && <li className="flex items-center gap-2.5"><span className="h-3.5 px-1 text-[10px] leading-3.5 rounded-sm bg-lamp/30 text-ink">Est.</span>Price estimated from {nEst} similar rooms nearby</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Zoom in to see each room. Select one for details.</p>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<Venue[]>([]), [src, setSrc] = useState("")
  const [day, setDay] = useState<string>("Wed"), [slot, setSlot] = useState<string>("evening")
  const [custom, setCustom] = useState(false), [range, setRange] = useState<[number, number]>([17, 21])
  const [busy, setBusy] = useState(false), [types, setTypes] = useState<string[]>(Object.keys(TYPES))
  const [hc, setHc] = useState("45"), [budget, setBudget] = useState("0"), [radius, setRadius] = useState("2000"), [kind, setKind] = useState("meetup")
  const [musts, setMusts] = useState<string[]>([]), [results, setResults] = useState<any[] | null>(null), [status, setStatus] = useState("")
  const [map, setMap] = useState<L.Map | null>(null)

  const hrs: [number, number] = custom ? range : (() => { const s = SLOTS.find(s => s.id === slot)!; return [s.from, s.to] })()
  const searchSlot = custom ? dominantSlot(range) : slot
  const slotLabel = `${day} ${fmtH(hrs[0])}–${fmtH(hrs[1])}`
  const score = useCallback((v: Venue) => { const f = freeScore(v, day, hrs); return busy ? 1 - f : f }, [day, hrs[0], hrs[1], busy])
  const counts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(v => { const t = typeOf(v); c[t] = (c[t] || 0) + 1 }); return c }, [data])
  const shown = useMemo(() => data.filter(v => types.includes(typeOf(v))), [data, types])
  const nEst = useMemo(() => data.filter(priceEst).length, [data])

  async function search() {
    const c = map?.getCenter() ?? { lat: 51.5245, lng: -0.0805 }
    setStatus("Searching…")
    try {
      const r = await fetch(`${SB}/rest/v1/rpc/search_venues`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ lat: c.lat, lng: c.lng, radius_m: +radius, min_capacity: +hc || null, max_budget: budget === "" ? null : +budget, weekday: day, slot: searchSlot, types, lim: 15 }) })
      if (!r.ok) throw r.status
      const rs = await r.json(); setResults(rs); setStatus(`Showing ${rs.length} matches`)
    } catch { setResults([]); setStatus("Search unavailable (Supabase unreachable).") }
  }
  useEffect(() => { loadVenues().then(([d, s]) => { setData(d.filter(v => v.lat)); setSrc(s) }) }, [])
  useEffect(() => { if (data.length && results === null) search() }, [data, map])

  const slotObj = SLOTS.find(s => s.id === slot)!
  return (
    <TooltipProvider>
    <div className="flex flex-col md:flex-row md:h-full w-full text-ink bg-fog">
      <aside className="order-2 md:order-1 md:w-[400px] md:h-full bg-fog md:border-r border-ink/10 flex flex-col z-40">
        <header className="hidden md:block px-6 pt-6 pb-4">
          <h1 className="font-heading text-[31px] leading-none font-extrabold tracking-tight">Open Venue DB</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-[34ch]">Quiet London rooms for meetups, comedy and gigs. Open data, kept up to date by organisers.</p>
        </header>
        <div className="flex-1 md:overflow-y-auto px-5 md:px-6 pb-6 space-y-7">
          <section aria-labelledby="ask" className="space-y-4 pt-5 md:pt-2">
            <h2 id="ask" className="font-heading text-xl font-semibold">What are you running?</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Event type</Label>
                <Select items={KINDS.map(([value,label]) => ({ value, label }))} value={kind} onValueChange={v => setKind(String(v))}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="hc">People</Label><div className="relative"><Users className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input id="hc" type="number" inputMode="numeric" className="pl-8 bg-white" value={hc} onChange={e => setHc(e.target.value)} /></div></div>
              <div className="space-y-1.5"><Label htmlFor="bud">Room fee budget</Label><div className="relative"><span className="absolute left-3 top-1.5 text-muted-foreground text-sm">£</span><Input id="bud" type="number" inputMode="numeric" className="pl-7 bg-white" value={budget} onChange={e => setBudget(e.target.value)} /></div></div>
              <div className="space-y-1.5 col-span-2"><Label>Distance from the map centre</Label>
                <Select items={RADII.map(([value,label]) => ({ value, label }))} value={radius} onValueChange={v => setRadius(String(v))}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{RADII.map(([r,l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium flex items-center gap-1">Must have
                <Tooltip><TooltipTrigger aria-label="Why must-haves don't filter yet" className="text-muted-foreground rounded-sm"><Info className="size-3.5" /></TooltipTrigger><TooltipContent className="max-w-60">We don't have equipment data for most rooms yet. Your choices are saved with the request but don't narrow the results.</TooltipContent></Tooltip>
              </legend>
              <ToggleGroup multiple variant="outline" size="sm" spacing={2} value={musts} onValueChange={v => setMusts(v as string[])} className="flex-wrap justify-start">
                {MUSTS.map(([Icon, l]) => <ToggleGroupItem key={l} value={l} className="bg-white data-[pressed]:bg-ink data-[pressed]:text-white data-[pressed]:border-ink"><Icon className="size-3.5" />{l}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <Button size="lg" className="w-full bg-canal hover:bg-canal/90 text-white" onClick={search}><Search className="size-4" />Find rooms for {DAYNAME[day]} {custom ? `${fmtH(range[0])}–${fmtH(range[1])}` : slotObj.label.toLowerCase()}</Button>
          </section>

          <section aria-labelledby="res" aria-live="polite" className="space-y-2">
            <div className="flex justify-between items-baseline"><h2 id="res" className="font-heading text-xl font-semibold">Best matches</h2><span className="text-xs text-muted-foreground">{status.replace("Showing ", "").replace(" matches", " rooms")}</span></div>
            {results === null && <p className="text-sm text-muted-foreground">Ranked by fit for your headcount, likely fee against your budget, and how likely the room is free.</p>}
            {results?.length === 0 && status.startsWith("Showing") && <p className="text-sm text-muted-foreground">No rooms match yet. Zoom out, move the map or lower the headcount, then search again.</p>}
            <ol className="divide-y divide-ink/10 border-y border-ink/10">
            {results?.map(v => {
              const p = Math.round(100 * v.likely_free), d = data.find(x => x.id == v.id) || ({} as Venue), pe = priceEst(d.id ? d : v)
              const barC = p >= 70 ? "#2E6F6A" : p >= 40 ? "#F2B134" : "#A23B5A"
              const dist = (v.distance_m / 1000).toFixed(1)
              return (
                <li key={v.id}>
                <Card size="sm" className={`rounded-none ring-0 shadow-none bg-transparent gap-2 py-3 pl-3 relative ${isEx(v.name) ? "bg-orders/5" : ""}`}>
                  <span aria-hidden className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-ink/10"><span className="absolute bottom-0 left-0 w-1 rounded-full" style={{ height: `${Math.max(p, 6)}%`, background: barC }} /></span>
                  <CardHeader className="px-2">
                    <div className="flex justify-between items-start gap-3">
                      <CardTitle className="font-heading text-[17px] leading-snug"><button className="text-left hover:underline underline-offset-2 rounded-sm" onClick={() => d.lat && map?.setView([d.lat, d.lng], 17)}>{v.name}</button><ExBadge name={v.name} /></CardTitle>
                      <HoverCard><HoverCardTrigger render={<button className="rounded-sm" />}><span className="text-sm font-semibold whitespace-nowrap" style={{ color: barC === "#F2B134" ? "#8A5A00" : barC }}>{p}% likely free</span></HoverCardTrigger>
                        <HoverCardContent className="text-xs w-64">Our estimate for {DAYNAME[day]} {searchSlot}. {d.basis ? `Based on ${d.basis}.` : ""} It is not a confirmed booking slot.</HoverCardContent></HoverCard>
                    </div>
                    <CardDescription className="text-[13px]">{v.type[0].toUpperCase() + v.type.slice(1)}, {dist} km away. {d.f ? capText(d)[0].toUpperCase() + capText(d).slice(1) : v.capacity ? `Holds ${v.capacity}` : "Capacity unknown"}.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5"><FeeBadge label={v.fee_label} />
                      {!pe && v.price_label && v.price_label !== "price unknown" && <Badge variant="outline" className="bg-lamp/20 border-lamp text-ink">{v.price_label}</Badge>}
                      {pe && <Tooltip><TooltipTrigger render={<span tabIndex={0} className="rounded-sm" />}><Badge variant="outline" className="bg-lamp/20 border-lamp text-ink">Est. £{Math.round(pe.low)}–£{Math.round(pe.high)}{pe.unit === "gbp_per_head" ? " a head" : ""}</Badge></TooltipTrigger><TooltipContent>Estimated from {pe.n ?? "nearby"} similar rooms{pe.conf ? `, ${pe.conf} confidence` : ""}</TooltipContent></Tooltip>}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <a href={v.source_url || "#"} target="_blank" rel="noreferrer" className="text-canal font-medium underline-offset-2 hover:underline rounded-sm">Open source page</a>
                      <Tooltip><TooltipTrigger render={<span tabIndex={0} className="rounded-sm" />}><span className="text-muted-foreground">Draft an enquiry</span></TooltipTrigger><TooltipContent>Coming soon. Every enquiry will need your approval before it's sent.</TooltipContent></Tooltip>
                    </div>
                  </CardContent>
                </Card>
                </li>)
            })}
            </ol>
          </section>
          <div className="md:hidden"><Legend busy={busy} slotLabel={slotLabel} nEst={nEst} /></div>
        </div>
        <footer className="px-6 py-4 border-t border-ink/10"><p className="text-xs leading-relaxed text-muted-foreground max-w-[60ch]">These are estimates. Café, pub and bar scores come from opening hours, event rooms from a small set of Luma and Meetup listings. "~" capacities come from building size{nEst ? ", and \"Est.\" prices from similar rooms nearby" : ""}. Rooms marked example data are made up for the demo. Map © OpenStreetMap contributors. Data from {src}.</p></footer>
      </aside>

      <main className="order-1 md:order-2 flex-1 relative flex flex-col">
        <header className="md:hidden px-5 pt-5 pb-3"><h1 className="font-heading text-2xl font-extrabold tracking-tight">Open Venue DB</h1><p className="text-sm text-muted-foreground">Quiet London rooms for meetups, comedy and gigs.</p></header>
        <div className="relative h-[52vh] md:h-full md:flex-1">
          <MapView venues={shown} all={data} score={score} slotLabel={slotLabel} onMap={setMap} />
          <section aria-label="When" className="md:absolute md:top-4 md:left-4 md:right-4 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 z-[1000] hidden md:block">
            {WhenPanel()}
          </section>
          <div className="hidden md:block absolute bottom-6 right-14 z-[1000] w-72 bg-white/95 backdrop-blur rounded-[14px] border border-ink/10 p-4"><Legend busy={busy} slotLabel={slotLabel} nEst={nEst} /></div>
        </div>
        <section aria-label="When" className="md:hidden px-4 py-3 bg-white border-b border-ink/10">{WhenPanel()}</section>
      </main>
    </div>
    </TooltipProvider>
  )

  function WhenPanel() {
    return (
      <div className="md:bg-white md:rounded-[14px] md:border md:border-ink/10 md:shadow-[0_6px_24px_-12px_rgba(28,37,65,.45)] md:p-4 space-y-3 md:w-[620px] max-w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ToggleGroup aria-label="Day of the week" value={[day]} onValueChange={v => v[0] && setDay(v[0] as string)} className="gap-0.5">
            {DAYS.map(d => <ToggleGroupItem key={d} value={d} aria-label={DAYNAME[d] + (d === TODAY ? ", today" : "")} className="px-2.5 h-8 font-heading font-semibold text-[15px] text-muted-foreground data-[pressed]:bg-ink data-[pressed]:text-white">
              {d}{d === TODAY && <span aria-hidden className="ml-0.5 size-1.5 rounded-full bg-lamp inline-block align-top" />}</ToggleGroupItem>)}
          </ToggleGroup>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={custom} onCheckedChange={setCustom} />Pick hours</label>
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={busy} onCheckedChange={setBusy} className="data-[checked]:bg-orders" />Show busy</label>
          </div>
        </div>
        <TimeBand hrs={hrs} />
        {!custom ? (
          <ToggleGroup aria-label="Time of day" value={[slot]} onValueChange={v => v[0] && setSlot(v[0] as string)} className="w-full gap-0 -mt-1">
            {SLOTS.map(s => <ToggleGroupItem key={s.id} value={s.id} style={{ flexGrow: s.to - s.from, flexBasis: 0 }} className="h-auto py-1.5 px-1 flex-col items-start gap-0 rounded-md text-left data-[pressed]:bg-lamp/25">
              <span className="text-sm font-semibold">{s.label}</span><span className="text-xs text-muted-foreground">{s.hours.replace("–", " to ")}</span></ToggleGroupItem>)}
          </ToggleGroup>
        ) : (
          <div className="space-y-1">
            <Slider aria-label="Hours" min={6} max={30} step={1} value={range} onValueChange={v => setRange(v as [number, number])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>6am</span><span>Noon</span><span>6pm</span><span>Midnight</span><span>6am</span></div>
            <p className="text-sm font-semibold">{fmtH(range[0])} to {fmtH(range[1])}</p>
          </div>
        )}
        <ToggleGroup multiple aria-label="Kinds of room" variant="outline" size="sm" spacing={2} value={types} onValueChange={v => setTypes(v as string[])} className="flex-wrap justify-start">
          {Object.entries(TYPES).map(([t, c]) => <ToggleGroupItem key={t} value={t} className="rounded-full text-muted-foreground line-through decoration-ink/40 data-[pressed]:no-underline data-[pressed]:text-ink data-[pressed]:bg-white">
            <span className="size-2 rounded-full" style={{ background: c }} />{t[0].toUpperCase() + t.slice(1)} <span className="text-muted-foreground">{counts[t] || 0}</span></ToggleGroupItem>)}
        </ToggleGroup>
      </div>
    )
  }
}
