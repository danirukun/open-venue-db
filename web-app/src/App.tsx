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
  let l = label || "fee unknown"
  if (/^£0/.test(l)) return <Badge className="bg-teal-50 text-teal-700 hover:bg-teal-50 gap-1"><CheckCircle2 className="size-3" />{l}</Badge>
  if (/inimum spend/.test(l)) l = "Minimum spend applies (amount unknown)"
  return <Badge variant="secondary" className="font-normal">{l}</Badge>
}
const ExBadge = ({ name }: { name: string }) => isEx(name) ? <Badge className="ml-1 bg-purple-100 text-purple-700 text-[10px] hover:bg-purple-100">EXAMPLE DATA</Badge> : null

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

  return (
    <TooltipProvider>
    <div className="flex h-full w-full text-slate-900">
      <aside className="w-[390px] h-full bg-white border-r flex flex-col z-40">
        <header className="p-5 border-b">
          <div className="flex items-center gap-2 mb-1"><MapPin className="text-teal-600 size-5" /><h1 className="text-xl font-bold tracking-tight">Open Venue DB</h1></div>
          <p className="text-xs text-muted-foreground">Open, community-maintained London venue database for organisers and show runners.</p>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Search className="size-3.5" />Find a venue</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="hc">Headcount</Label><div className="relative"><Users className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input id="hc" type="number" className="pl-8" value={hc} onChange={e => setHc(e.target.value)} /></div></div>
              <div className="space-y-1.5"><Label htmlFor="bud">Venue fee budget</Label><div className="relative"><span className="absolute left-3 top-1.5 text-muted-foreground text-sm">£</span><Input id="bud" type="number" className="pl-7" value={budget} onChange={e => setBudget(e.target.value)} /></div></div>
              <div className="space-y-1.5"><Label>Event type</Label>
                <Select value={kind} onValueChange={v => setKind(String(v))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{[["meetup","Meetup / talk"],["comedy","Comedy night"],["gig","Gig / show"],["popup","Pop-up"],["workshop","Workshop"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Within</Label>
                <Select value={radius} onValueChange={v => setRadius(String(v))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{["500","1000","2000","5000"].map(r => <SelectItem key={r} value={r}>{+r < 1000 ? `${r} m` : `${+r/1000} km`} of map centre</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">Must-haves
                <Tooltip><TooltipTrigger className="text-muted-foreground"><Info className="size-3.5" /></TooltipTrigger><TooltipContent className="max-w-56">Feature data (PA, projector…) isn't collected yet, so must-haves are saved with the request but don't filter results.</TooltipContent></Tooltip>
              </Label>
              <ToggleGroup multiple variant="outline" size="sm" spacing={2} value={musts} onValueChange={v => setMusts(v as string[])} className="flex-wrap justify-start">
                {MUSTS.map(([Icon, l]) => <ToggleGroupItem key={l} value={l} className="rounded-full data-[pressed]:bg-teal-600 data-[pressed]:text-white"><Icon className="size-3.5" />{l}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            <Button className="w-full" onClick={search}><Search className="size-4" />Search venues · {day} {custom ? `${fmtH(range[0])}–${fmtH(range[1])}` : SLOTS.find(s => s.id === slot)!.label.toLowerCase()}</Button>
          </section>
          <Separator />
          <section className="space-y-3">
            <div className="flex justify-between items-end"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ranked results</h2><span className="text-xs text-muted-foreground">{status}</span></div>
            {results === null && <p className="text-xs text-muted-foreground">Ranks venues by capacity fit, estimated fee vs budget and how likely they are to be free.</p>}
            {results?.length === 0 && status.startsWith("Showing") && <p className="text-xs text-muted-foreground">No matches. Try a bigger area or lower headcount.</p>}
            {results?.map(v => {
              const p = Math.round(100 * v.likely_free), d = data.find(x => x.id == v.id) || ({} as Venue), pe = priceEst(d.id ? d : v)
              const cl = p >= 70 ? "bg-green-100 text-green-700" : p >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
              return (
                <Card key={v.id} size="sm" className={`cursor-pointer hover:ring-teal-500 ${isEx(v.name) ? "ring-purple-300 bg-purple-50/40" : ""}`} onClick={() => d.lat && map?.setView([d.lat, d.lng], 17)}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-[15px]">{v.name}<ExBadge name={v.name} /></CardTitle>
                      <HoverCard><HoverCardTrigger render={<span />}><Badge className={`${cl} hover:${cl} text-[10px] font-bold whitespace-nowrap`}>{p}% FREE</Badge></HoverCardTrigger>
                        <HoverCardContent className="text-xs w-64">Likelihood the venue is free {day} {searchSlot}. {d.basis ? `Basis: ${d.basis}.` : ""} Estimate only, never confirmed availability.</HoverCardContent></HoverCard>
                    </div>
                    <CardDescription className="text-xs">{v.type} • {d.f ? capText(d) : v.capacity ? `${v.capacity} cap` : "capacity unknown"} • {(v.distance_m / 1000).toFixed(1)} km</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-1"><FeeBadge label={v.fee_label} />
                      {!pe && v.price_label && <Badge variant="outline" className="text-amber-800 border-amber-300">{v.price_label}</Badge>}
                      {!pe && !v.price_label && <Badge variant="outline" className="text-muted-foreground font-normal">price unknown</Badge>}
                      {pe && <Tooltip><TooltipTrigger render={<span />}><Badge variant="outline" className="text-amber-800 border-amber-300">Est. £{Math.round(pe.low)}–£{Math.round(pe.high)}{pe.unit === "gbp_per_head" ? "/head" : pe.unit ? ` ${pe.unit.replace(/_/g," ")}` : ""}</Badge></TooltipTrigger><TooltipContent>Estimated from {pe.n ?? "nearby"} comparable venues{pe.conf ? ` · ${pe.conf} confidence` : ""}</TooltipContent></Tooltip>}
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <Button variant="secondary" size="sm" className="flex-1" render={<a href={v.source_url || "#"} target="_blank" />}>Source</Button>
                      <Tooltip><TooltipTrigger render={<span className="flex-1" />}><Button size="sm" disabled className="w-full bg-teal-600">Draft enquiry</Button></TooltipTrigger><TooltipContent>Outreach is draft-only; drafts need approval</TooltipContent></Tooltip>
                    </div>
                  </CardContent>
                </Card>)
            })}
          </section>
        </div>
        <footer className="p-4 border-t bg-slate-50"><p className="text-[11px] leading-relaxed text-muted-foreground italic">Indicative only. Cafe/pub/bar free scores come from OSM opening hours; event venues from sparse Luma/Meetup listings. Capacity "~" = estimated from building footprint{nEst ? "; price \"Est.\" = estimated from comparable nearby venues" : ""}. Venues named EXAMPLE are illustrative demo data. Map data © OpenStreetMap contributors (ODbL). Data: {src}.</p></footer>
      </aside>

      <main className="flex-1 relative">
        <MapView venues={shown} all={data} score={score} slotLabel={slotLabel} onMap={setMap} />
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 w-max max-w-[95%]">
          <Card size="sm" className="shadow-xl py-2">
            <CardContent className="flex items-center gap-4 flex-wrap justify-center">
              <ToggleGroup variant="outline" size="sm" value={[day]} onValueChange={v => v[0] && setDay(v[0] as string)}>
                {DAYS.map(d => <ToggleGroupItem key={d} value={d} className={`px-2.5 data-[pressed]:bg-slate-900 data-[pressed]:text-white ${d === TODAY ? "font-bold underline decoration-teal-500 decoration-2 underline-offset-4" : ""}`} title={d === TODAY ? "Today" : undefined}>{d}</ToggleGroupItem>)}
              </ToggleGroup>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1"><Clock className="size-3" />Time</span>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"><SlidersHorizontal className="size-3" />Custom range<Switch size="sm" checked={custom} onCheckedChange={setCustom} /></label>
                </div>
                {!custom ? (
                  <ToggleGroup variant="outline" value={[slot]} onValueChange={v => v[0] && setSlot(v[0] as string)}>
                    {SLOTS.map(s => <ToggleGroupItem key={s.id} value={s.id} className="h-auto py-1 px-3 flex-col gap-0 data-[pressed]:bg-teal-600 data-[pressed]:text-white"><span className="text-xs font-semibold">{s.label}</span><span className="text-[10px] opacity-70 font-mono">{s.hours}</span></ToggleGroupItem>)}
                  </ToggleGroup>
                ) : (
                  <div className="w-[300px] pt-1">
                    <Slider min={6} max={30} step={1} value={range} onValueChange={v => setRange(v as [number, number])} />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1.5"><span>06</span><span>12</span><span>17</span><span>21</span><span>06</span></div>
                    <div className="text-center text-[11px] font-semibold text-teal-700">{fmtH(range[0])} – {fmtH(range[1])}</div>
                  </div>
                )}
              </div>
              <Separator orientation="vertical" className="h-8" />
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer"><span className={busy ? "text-muted-foreground" : "text-teal-700"}>Quiet</span><Switch checked={busy} onCheckedChange={setBusy} /><span className={busy ? "text-orange-700" : "text-muted-foreground"}>Busy</span></label>
            </CardContent>
          </Card>
          <ToggleGroup multiple variant="outline" size="sm" spacing={2} value={types} onValueChange={v => setTypes(v as string[])} className="flex-wrap justify-center">
            {Object.entries(TYPES).map(([t, c]) => <ToggleGroupItem key={t} value={t} className="rounded-full bg-white/95 shadow-sm data-[pressed]:bg-white data-[pressed]:opacity-100 opacity-45"><span className="size-2 rounded-full" style={{ background: c }} />{t[0].toUpperCase() + t.slice(1)}<span className="text-muted-foreground font-normal">{counts[t] || 0}</span></ToggleGroupItem>)}
          </ToggleGroup>
        </div>

        <Card size="sm" className="absolute bottom-8 right-14 z-[1000] w-72 shadow-2xl">
          <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Map key</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><div className="flex justify-between text-[11px] font-semibold mb-1.5"><span className="text-slate-500">{busy ? "Usually free" : "Usually busy"}</span><span className={busy ? "text-orange-700" : "text-teal-600"}>{busy ? "Very likely busy" : "Very likely free"}</span></div>
              <div className="h-2.5 w-full rounded-full" style={{ background: "linear-gradient(90deg,#7C2D12,#FDE68A,#15803D)" }} />
              <div className="text-[10px] text-muted-foreground mt-1">Heat = {busy ? "busy" : "free"} likelihood, {slotLabel}</div></div>
            <div className="grid gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-3"><span className="size-4 rounded-full bg-red-500 border-2 border-white shadow" />Event venue (Luma/Meetup)</div>
              <div className="flex items-center gap-3"><span className="size-4 rounded-full bg-blue-500 border-2 border-white shadow" />Local venue (OSM cafe/pub/bar)</div>
              <div className="flex items-center gap-3"><span className="size-4 border border-slate-400" />300 m grid cell (hover for prices)</div>
              <div className="flex items-center gap-3"><span className="size-4 hatched border border-slate-300" />Cell with no known prices</div>
              {nEst > 0 && <div className="flex items-center gap-3"><Badge variant="outline" className="text-amber-800 border-amber-300 text-[10px] px-1">Est.</Badge>Price estimated from neighbours ({nEst})</div>}
            </div>
            <p className="text-[10px] text-muted-foreground">Markers appear from zoom 15. Click a pin for details.</p>
          </CardContent>
        </Card>
      </main>
    </div>
    </TooltipProvider>
  )
}
