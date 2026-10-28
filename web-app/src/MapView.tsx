import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Rectangle, Tooltip as LTooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet"
import L from "./leaflet-global"
import "leaflet.heat"
import type { Venue } from "./data"
import { priceMid, priceClass, typeOf, TYPE_EMOJI } from "./data"
export const DOT_SIZES = [24, 27, 30, 34, 38]
import { P } from "./palette"

function Heat({ points }: { points: [number,number,number][] }) {
  const map = useMap()
  const layer = useMemo(() => (L as any).heatLayer([], { radius: 30, blur: 24, maxZoom: 16, gradient: { 0.1: P.busy, 0.5: P.mid, 1: P.free } }), [])
  useEffect(() => { layer.addTo(map); return () => { map.removeLayer(layer) } }, [map, layer])
  useEffect(() => { layer.setLatLngs(points) }, [layer, points])
  return null
}
function Watch({ onMap, onBounds }: { onMap: (m:L.Map)=>void; onBounds: (b: L.LatLngBounds, c: L.LatLng)=>void }) {
  const map = useMapEvents({ moveend: () => onBounds(map.getBounds(), map.getCenter()) })
  useEffect(() => { onMap(map); onBounds(map.getBounds(), map.getCenter()) }, [map])
  return null
}
export type Item = { v: Venue; free: number; dist: number; rpc?: any }
type Props = { venues: Venue[]; items: Item[]; numbered: boolean; fitKey: number; padB: number; score: (v:Venue)=>number; onMap:(m:L.Map)=>void; onBounds:(b:L.LatLngBounds, c:L.LatLng)=>void; breaks: number[]; here?: [number, number] | null; ring?: [number, number, number]; crime?: { gy: number; gx: number; n: number; score: number }[] | null; hot: string | null; sel: string | null; onHover:(id:string|null)=>void; onSelect:(id:string)=>void }
export default function MapView({ venues, items, numbered, fitKey, padB, score, onMap, onBounds, breaks, here, ring, crime, hot, sel, onHover, onSelect }: Props) {
  const [mapRef, setMapRef] = useState<L.Map | null>(null)
  useEffect(() => { if (!mapRef || !fitKey) return; const pts = items.map(i => [i.v.lat, i.v.lng] as [number, number]); if (!pts.length) return
    mapRef.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [60, 60], paddingBottomRight: [60, padB + 40], maxZoom: 16, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches }) }, [mapRef, fitKey])
  const points = useMemo(() => venues.map(v => [v.lat, v.lng, score(v)] as [number,number,number]), [venues, score])
  return (
    <MapContainer center={[51.4927, -0.2240]} zoom={14} zoomControl={false} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <ZoomControl position="bottomright" />
      <Watch onMap={m => { setMapRef(m); onMap(m) }} onBounds={onBounds} />
      <Heat points={points} />
      {crime?.map(c => { const col = c.score >= 67 ? "#43614A" : c.score >= 34 ? "#9A7B3F" : "#8E4F7E"
        return <Rectangle key={c.gy + "_" + c.gx} bounds={[[c.gy * 0.009, c.gx * 0.0144], [(c.gy + 1) * 0.009, (c.gx + 1) * 0.0144]]} interactive={false} pathOptions={{ stroke: false, fillColor: col, fillOpacity: 0.28 }} /> })}
      {ring && <Circle center={[ring[0], ring[1]]} radius={ring[2]} interactive={false} pathOptions={{ color: P.accentInk, weight: 2, dashArray: "6 6", fillColor: P.accent, fillOpacity: 0.05 }} />}
      {items.map((it, i) => { const id = String(it.v.id), h = id === hot || id === sel
        return <Marker key={id} position={[it.v.lat, it.v.lng]} icon={numbered ? numIcon(i + 1, h) : icon(it.v, breaks, h)} zIndexOffset={h ? 3000 : numbered ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(id), mouseover: () => onHover(id), mouseout: () => onHover(null) }}>
          <LTooltip direction="top" offset={[0, -14]}>{it.v.name}</LTooltip></Marker> })}
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
