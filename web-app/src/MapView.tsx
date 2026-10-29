import { useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Tooltip as LTooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet"
import L from "./leaflet-global"
import "leaflet.heat"
import "leaflet.markercluster"
import "leaflet.markercluster/dist/MarkerCluster.css"
import type { Venue } from "./data"
import { priceMid, priceClass, typeOf, TYPE_EMOJI } from "./data"
export const DOT_SIZES = [24, 27, 30, 34, 38]
import { P } from "./palette"

export type HeatCfg = { points: [number, number, number][]; gradient: Record<number, string>; opacity: number; radius?: number; blur?: number; max?: number }
function Heat({ cfg }: { cfg: HeatCfg }) {
  const map = useMap()
  const layer = useMemo(() => (L as any).heatLayer([], { radius: cfg.radius ?? 28, blur: cfg.blur ?? 22, maxZoom: 14, max: cfg.max ?? 1, gradient: cfg.gradient }), [cfg.gradient, cfg.radius, cfg.blur, cfg.max])
  useEffect(() => { layer.addTo(map); return () => { map.removeLayer(layer) } }, [map, layer])
  useEffect(() => { layer.setLatLngs(cfg.points) }, [layer, cfg.points])
  useEffect(() => { const c = layer._canvas as HTMLCanvasElement | undefined; if (c) c.style.opacity = String(cfg.opacity) }, [layer, cfg.opacity, cfg.points])
  return null
}
/** Stable pin set: every filtered venue is always on the map; at low zoom nearby pins merge into count bubbles instead of disappearing. */
function Pins({ items, breaks, hot, sel, onHover, onSelect }: { items: Item[]; breaks: number[]; hot: string | null; sel: string | null; onHover:(id:string|null)=>void; onSelect:(id:string)=>void }) {
  const map = useMap()
  const cb = useRef({ onHover, onSelect }); cb.current = { onHover, onSelect }
  const group = useMemo(() => (L as any).markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 16, maxClusterRadius: 44,
    iconCreateFunction: (c: any) => { const n = c.getChildCount(), d = n < 10 ? 32 : n < 100 ? 38 : 46
      return L.divIcon({ className: "venue-cluster", iconSize: [d, d], html: `<div data-n="${n}" style="width:${d}px;height:${d}px;border-radius:50%;display:grid;place-items:center;font:600 13px/1 inherit;background:${P.ink};color:#fff;border:3px solid #ffffffd0;box-shadow:0 1px 4px #0004">${n}</div>` }) } }), [])
  const marks = useRef(new Map<string, L.Marker>())
  useEffect(() => { map.addLayer(group); return () => { map.removeLayer(group) } }, [map, group])
  useEffect(() => {
    group.clearLayers(); const m = new Map<string, L.Marker>()
    const ls = items.map(it => { const id = String(it.v.id); const mk = L.marker([it.v.lat, it.v.lng], { icon: icon(it.v, breaks, id === hot || id === sel) }) as any
      mk._v = it.v; mk.on("click", () => cb.current.onSelect(id)); mk.on("mouseover", () => cb.current.onHover(id)); mk.on("mouseout", () => cb.current.onHover(null))
      mk.bindTooltip(it.v.name.replace(/</g, "&lt;"), { direction: "top", offset: [0, -14] }); m.set(id, mk); return mk })
    marks.current = m; group.addLayers(ls)
  }, [group, items, breaks])
  const prev = useRef<string[]>([])
  useEffect(() => { const on = [hot, sel].filter(Boolean) as string[]
    for (const id of new Set([...prev.current, ...on])) { const mk: any = marks.current.get(id); if (mk) { const h = on.includes(id); mk.setIcon(icon(mk._v, breaks, h)); mk.setZIndexOffset(h ? 3000 : 0) } }
    prev.current = on }, [hot, sel, items])
  return null
}
function Watch({ onMap, onBounds }: { onMap: (m:L.Map)=>void; onBounds: (b: L.LatLngBounds, c: L.LatLng)=>void }) {
  const map = useMapEvents({ moveend: () => onBounds(map.getBounds(), map.getCenter()) })
  useEffect(() => { onMap(map); onBounds(map.getBounds(), map.getCenter()) }, [map])
  return null
}
export type Item = { v: Venue; free: number; dist: number; rpc?: any }
type Props = { venues?: Venue[]; items: Item[]; numbered: boolean; fitKey: number; padB: number; score?: (v:Venue)=>number; onMap:(m:L.Map)=>void; onBounds:(b:L.LatLngBounds, c:L.LatLng)=>void; breaks: number[]; here?: [number, number] | null; ring?: [number, number, number]; heat?: HeatCfg | null; hot: string | null; sel: string | null; onHover:(id:string|null)=>void; onSelect:(id:string)=>void }
export default function MapView({ items, numbered, fitKey, padB, onMap, onBounds, breaks, here, ring, heat, hot, sel, onHover, onSelect }: Props) {
  const [mapRef, setMapRef] = useState<L.Map | null>(null)
  useEffect(() => { if (!mapRef || !fitKey) return; const pts = items.map(i => [i.v.lat, i.v.lng] as [number, number]); if (!pts.length) return
    mapRef.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [60, 60], paddingBottomRight: [60, padB + 40], maxZoom: 16, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches }) }, [mapRef, fitKey])
  useEffect(() => { (window as any).__offpeak = { map: mapRef, items } }, [mapRef, items])
  return (
    <MapContainer center={[51.4927, -0.2240]} zoom={14} zoomControl={false} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <ZoomControl position="bottomright" />
      <Watch onMap={m => { setMapRef(m); onMap(m) }} onBounds={onBounds} />
      {heat && <Heat cfg={heat} />}
      {ring && <Circle center={[ring[0], ring[1]]} radius={ring[2]} interactive={false} pathOptions={{ color: P.accentInk, weight: 2, dashArray: "6 6", fillColor: P.accent, fillOpacity: 0.05 }} />}
      {numbered ? items.map((it, i) => { const id = String(it.v.id), h = id === hot || id === sel
        return <Marker key={id} position={[it.v.lat, it.v.lng]} icon={numIcon(i + 1, h)} zIndexOffset={h ? 3000 : 1000}
          eventHandlers={{ click: () => onSelect(id), mouseover: () => onHover(id), mouseout: () => onHover(null) }}>
          <LTooltip direction="top" offset={[0, -14]}>{it.v.name}</LTooltip></Marker> })
        : <Pins items={items} breaks={breaks} hot={hot} sel={sel} onHover={onHover} onSelect={onSelect} />}
      {here && <CircleMarker center={here} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2F5BEA", fillOpacity: 1 }}><LTooltip direction="top">You are here</LTooltip></CircleMarker>}
    </MapContainer>
  )
}
const hotCss = (h: boolean) => h ? `transform:scale(1.3);box-shadow:0 0 0 4px ${P.accent}88,0 3px 10px #0006;` : "box-shadow:0 1px 3px #0003;"
function numIcon(n: number, h: boolean) { return L.divIcon({ className: "venue-pin" + (h ? " hot" : ""), iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:600 13px/1 inherit;background:${h ? P.accentInk : P.ink};color:#fff;border:2px solid #fff;${hotCss(h)}">${n}</div>` }) }
const iconCache = new Map<string, L.DivIcon>()
function icon(v: Venue, br: number[], h: boolean) {
  const c = priceClass(priceMid(v), br), d = DOT_SIZES[Math.max(c, 0)] - (c < 0 ? 4 : 0), ev = (v.events || 0) > 0, t = typeOf(v)
  const k = `${t}|${c}|${ev}|${h}`; let i = iconCache.get(k); if (i) return i
  i = L.divIcon({ className: "venue-pin" + (h ? " hot" : ""), iconSize: [d, d], iconAnchor: [d / 2, d / 2],
    html: `<div style="width:${d}px;height:${d}px;border-radius:50%;display:grid;place-items:center;font-size:${Math.round(d * 0.5)}px;line-height:1;background:${h ? P.accent : ev ? P.ink : "#fff"};border:2px solid ${h ? "#fff" : ev ? "#fff" : P.ink};${hotCss(h)}">${TYPE_EMOJI[t] || "📍"}</div>` })
  iconCache.set(k, i); return i
}
