import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Search, X, LocateFixed, MapPin, Clock, SlidersHorizontal } from "lucide-react"
import type { Venue } from "./data"
import { typeOf, TYPE_EMOJI, TYPES } from "./data"

export type LayerId = "crime" | "density" | "price" | "transit" | "free"
export const LAYERS: { id: LayerId; label: string; lo: string; hi: string; src: string; gradient: Record<number, string> }[] = [
  { id: "crime", label: "Crime rate", lo: "Fewer crimes", hi: "More crimes", src: "police.uk street crime, Aug 2026, ~1 km cells", gradient: { 0.2: "#F3E3C3", 0.5: "#D9925B", 0.8: "#B4473F", 1: "#6E1F3A" } },
  { id: "density", label: "Venue density", lo: "Few venues", hi: "Many venues", src: "All venues of the selected types", gradient: { 0.2: "#DCE6F2", 0.5: "#86A8CF", 0.8: "#3D6A9E", 1: "#1D3557" } },
  { id: "price", label: "Price level", lo: "Cheaper", hi: "Pricier", src: "Estimated spend per head", gradient: { 0.2: "#E3EFD9", 0.5: "#C9B458", 0.8: "#C0763A", 1: "#8C2F2F" } },
  { id: "transit", label: "Transit access", lo: "Far from stations", hi: "Near stations", src: "Walk to nearest TfL station", gradient: { 0.2: "#E6E0F0", 0.5: "#A08BC6", 0.8: "#6A4FA0", 1: "#3B2470" } },
  { id: "free", label: "Likely free", lo: "Usually busy", hi: "Very likely free", src: "Estimated for the chosen day and hours", gradient: { 0.2: "#E8EFE6", 0.5: "#A9C2A3", 0.8: "#6B8F71", 1: "#2F5D4C" } },
]

/** Details card anchored to the pin (desktop) or docked above the bottom sheet (mobile). */
export function VenueCard({ proj, sub, tick, mobile, bottom, onClose, title, meta, children, v }: { v: Venue; proj: (la: number, ln: number) => [number, number]; sub: any; tick: number; mobile: boolean; bottom: number; onClose: () => void; title: ReactNode; meta: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null), [, force] = useState(0), [h, setH] = useState(300)
  useEffect(() => { if (!sub) return; const f = () => force(x => x + 1); sub.on("move", f); sub.on("zoom", f); sub.on("resize", f); return () => { sub.off("move", f); sub.off("zoom", f); sub.off("resize", f) } }, [sub, tick])
  useLayoutEffect(() => { if (el.current) setH(el.current.offsetHeight) })
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; addEventListener("keydown", k); return () => removeEventListener("keydown", k) }, [onClose])
  const par = el.current?.parentElement, W = par?.clientWidth ?? innerWidth, H = par?.clientHeight ?? innerHeight
  const [px, py] = proj(v.lat, v.lng), CW = Math.min(340, W - 24)
  let style: React.CSSProperties, caret: React.CSSProperties | null = null
  if (mobile) style = { left: 8, right: 8, bottom, maxHeight: "44vh" }
  else { let x = px + 22, side = "l"; if (x + CW > W - 12) { x = px - 22 - CW; side = "r" } x = Math.max(12, Math.min(x, W - CW - 12))
    const y = Math.max(12, Math.min(py - 70, H - h - 12)); style = { left: x, top: y, width: CW, maxHeight: H - 24 }
    const cy = py - y; if (cy > 14 && cy < h - 14 && px > 0 && px < W) caret = { top: cy - 7, [side === "l" ? "left" : "right"]: -7 } }
  return <div ref={el} data-testid="venue-card" role="dialog" aria-label={v.name} className="absolute z-[1150] bg-white rounded-2xl border border-ink/15 shadow-xl flex flex-col" style={style}>
    {caret && <span aria-hidden className="absolute size-3.5 rotate-45 bg-white border-l border-b border-ink/15" style={{ ...caret, ...(caret.right != null ? { transform: "rotate(225deg)" } : {}) }} />}
    <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-ink/10">
      <div className="flex-1 min-w-0"><h3 className="font-semibold text-[15px] leading-snug truncate">{title}</h3><p className="text-[13px] text-muted-foreground truncate">{meta}</p></div>
      <button onClick={onClose} aria-label="Close details" className="shrink-0 size-9 -mr-2 grid place-items-center rounded-full hover:bg-ink/10"><X className="size-4" /></button>
    </div>
    <div className="overflow-y-auto px-4 py-3 space-y-2.5">{children}</div>
  </div>
}

// ---- typeahead ----
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "")
function scoreName(name: string, q: string): number {
  const n = norm(name); if (n.startsWith(q)) return 100 - n.length / 100
  if (n.split(/[\s\-&,.]+/).some(w => w.startsWith(q))) return 80 - n.length / 100
  const i = n.indexOf(q); if (i >= 0) return 60 - i / 10
  let j = 0, gaps = 0, last = -1; for (let k = 0; k < n.length && j < q.length; k++) if (n[k] === q[j]) { if (last >= 0 && k - last > 1) gaps++; last = k; j++ }
  return j === q.length && q.length >= 3 && gaps <= 2 ? 30 - gaps * 5 : -1
}
export function Hl({ text, q }: { text: string; q: string }) {
  const n = norm(text), i = q ? n.indexOf(norm(q)) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<b className="font-semibold text-ink">{text.slice(i, i + q.length)}</b>{text.slice(i + q.length)}</>
}
type Opt = { kind: "venue"; v: Venue; area: string } | { kind: "place"; label: string; sub: string; lat: number; lng: number } | { kind: "type"; t: string } | { kind: "recent"; label: string; lat: number; lng: number; vid?: string }
const PLURAL: Record<string, string[]> = { cinema: ["cinemas", "screening", "film"], cafe: ["cafes", "café", "coffee"], pub: ["pubs"], bar: ["bars"], music: ["music venues", "gig"], community: ["community spaces", "hall"] }
const areaOf = (v: Venue) => { const a = String(v.address || "").split(",").map(x => x.trim()).filter(Boolean); return a.find(x => /^[A-Z]{1,2}\d/.test(x)) || a[a.length - 1] || "" }
export function SearchBox({ value, onChange, venues, center, onVenue, onPlace, onType, onSubmit, onLocate }: { value: string; onChange: (s: string) => void; venues: Venue[]; center: [number, number]; onVenue: (v: Venue) => void; onPlace: (la: number, ln: number) => void; onType: (t: string) => void; onSubmit: () => void; onLocate: () => void }) {
  const [open, setOpen] = useState(false), [idx, setIdx] = useState(-1), [dq, setDq] = useState(""), [places, setPlaces] = useState<Opt[]>([])
  const [recent, setRecent] = useState<Opt[]>(() => { try { return JSON.parse(localStorage.getItem("offpeak-recent") || "[]") } catch { return [] } })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setTimeout(() => setDq(value.trim()), 150); return () => clearTimeout(t) }, [value])
  useEffect(() => { const q = dq; if (q.length < 2) { setPlaces([]); return } const ac = new AbortController()
    ;(async () => { const out: Opt[] = []
      try { if (/^[a-z]{1,2}\d/i.test(q)) { const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}/autocomplete?limit=3`, { signal: ac.signal }); const j = r.ok ? await r.json() : null
          for (const pc of (j?.result || []).slice(0, 3)) { const g = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { signal: ac.signal }).then(r => r.ok ? r.json() : null); if (g?.result) out.push({ kind: "place", label: pc, sub: g.result.admin_district || "Postcode", lat: g.result.latitude, lng: g.result.longitude }) } } } catch {}
      try { const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&bbox=-0.52,51.28,0.34,51.70&lat=${center[0]}&lon=${center[1]}`, { signal: ac.signal }); const j = r.ok ? await r.json() : null
        for (const f of j?.features || []) { const p = f.properties || {}; if (p.osm_key === "amenity" && /pub|bar|cafe|cinema/.test(p.osm_value)) continue; const [lng, lat] = f.geometry.coordinates; if (lat < 51.28 || lat > 51.7 || lng < -0.52 || lng > 0.34) continue
          const label = p.name || p.street || p.postcode; if (!label || out.some(o => o.kind === "place" && o.label === label)) continue
          out.push({ kind: "place", label, sub: [p.district || p.city, p.osm_value?.replace(/_/g, " ")].filter(Boolean).join(" · "), lat, lng }); if (out.length >= 4) break } } catch {}
      if (!ac.signal.aborted) setPlaces(out) })()
    return () => ac.abort() }, [dq])
  const q = norm(dq)
  const vs = useMemo<Opt[]>(() => { if (q.length < 2) return []; const r: [number, Venue][] = []
    for (const v of venues) { const s = scoreName(v.name || "", q); if (s >= 0) r.push([s, v]) }
    return r.sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, v]) => ({ kind: "venue", v, area: areaOf(v) })) }, [q, venues])
  const ts = useMemo<Opt[]>(() => q.length < 2 ? [] : Object.keys(TYPES).filter(t => [t, ...(PLURAL[t] || [])].some(w => norm(w).startsWith(q) || q.startsWith(norm(w)))).map(t => ({ kind: "type", t })), [q])
  const groups: [string, Opt[]][] = q.length < 2 ? [["Recent", recent]] : [["Venues", vs], ["Places", places], ["Filter", ts]]
  const flat = groups.flatMap(g => g[1])
  useEffect(() => setIdx(-1), [dq, open])
  const remember = (o: Opt) => { const rr = [o, ...recent.filter(x => (x as any).label !== (o as any).label)].slice(0, 5); setRecent(rr); try { localStorage.setItem("offpeak-recent", JSON.stringify(rr)) } catch {} }
  function pick(o: Opt) {
    setOpen(false)
    if (o.kind === "venue") { onChange(o.v.name); remember({ kind: "recent", label: o.v.name, lat: o.v.lat, lng: o.v.lng, vid: String(o.v.id) }); onVenue(o.v) }
    else if (o.kind === "place") { onChange(o.label); remember({ kind: "recent", label: o.label, lat: o.lat, lng: o.lng }); onPlace(o.lat, o.lng) }
    else if (o.kind === "type") { onChange(""); onType(o.t) }
    else { onChange(o.label); const v = o.vid ? venues.find(x => String(x.id) === o.vid) : undefined; v ? onVenue(v) : onPlace(o.lat, o.lng) }
  }
  useEffect(() => { const f = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }; addEventListener("pointerdown", f); return () => removeEventListener("pointerdown", f) }, [])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx(i => Math.min(flat.length - 1, i + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(-1, i - 1)) }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLElement).blur() }
    else if (e.key === "Enter") { e.preventDefault(); if (open && idx >= 0 && flat[idx]) pick(flat[idx]); else if (open && vs[0] && scoreName(vs[0].kind === "venue" ? vs[0].v.name : "", q) >= 100 - 1) pick(vs[0]); else { setOpen(false); onSubmit() } }
  }
  let n = -1
  return <div ref={box} className="relative">
    <div className="flex items-center gap-2 rounded-full bg-white border border-ink/15 shadow-sm pl-4 pr-1.5 h-12 focus-within:ring-2 focus-within:ring-ink/30">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input role="combobox" aria-expanded={open && flat.length > 0} aria-controls="search-list" aria-autocomplete="list" aria-activedescendant={idx >= 0 ? `opt-${idx}` : undefined} aria-label="Search a place or postcode" placeholder="Search venues, places or postcodes" className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none text-[15px] placeholder:text-muted-foreground"
        value={value} onFocus={() => setOpen(true)} onChange={e => { onChange(e.target.value); setOpen(true) }} onKeyDown={onKey} />
      {value && <button aria-label="Clear" onClick={() => { onChange(""); setOpen(true) }} className="size-9 grid place-items-center rounded-full hover:bg-ink/10"><X className="size-4" /></button>}
      <button aria-label="Use my location" title="Use my location" onClick={onLocate} className="size-9 grid place-items-center rounded-full hover:bg-ink/10"><LocateFixed className="size-4" /></button>
    </div>
    {open && flat.length > 0 && <ul id="search-list" role="listbox" data-testid="typeahead" className="absolute z-[1300] left-0 right-0 mt-1.5 max-h-[60vh] overflow-y-auto rounded-2xl bg-white border border-ink/15 shadow-xl py-1.5">
      {groups.filter(g => g[1].length).map(([g, os]) => <li key={g} role="presentation"><p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
        <ul role="group" aria-label={g}>{os.map(o => { n++; const i = n, on = i === idx
          const [ic, main, sub] = o.kind === "venue" ? [TYPE_EMOJI[typeOf(o.v)] || "📍", o.v.name, [typeOf(o.v), o.area].filter(Boolean).join(" · ")] : o.kind === "place" ? [<MapPin className="size-4" />, o.label, o.sub] : o.kind === "type" ? [<SlidersHorizontal className="size-4" />, `Show only ${PLURAL[o.t]?.[0] || o.t}`, `${TYPE_EMOJI[o.t] || ""} Type filter`] : [<Clock className="size-4" />, o.label, "Recent"]
          return <li key={i} id={`opt-${i}`} role="option" aria-selected={on} onPointerDown={e => e.preventDefault()} onClick={() => pick(o)} onMouseMove={() => setIdx(i)}
            className={`flex items-center gap-3 px-4 min-h-12 py-1.5 cursor-pointer ${on ? "bg-ink/[.06]" : ""}`}>
            <span className="shrink-0 size-8 grid place-items-center rounded-full bg-fog text-base text-muted-foreground">{ic}</span>
            <span className="min-w-0"><span className="block text-[15px] truncate text-ink/80"><Hl text={main as string} q={dq} /></span>{sub && <span className="block text-xs text-muted-foreground truncate capitalize">{sub}</span>}</span>
          </li> })}</ul></li>)}
    </ul>}
  </div>
}
