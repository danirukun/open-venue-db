import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Venue } from "./data"
import { capText, priceEst, priceMid, priceClass, PRICE_RAMP } from "./data"
import { P } from "./palette"
export const RAMP = ["#8E4F7E", "#B48AA6", "#DCCFB4", "#A9C2A3", "#6B8F71", "#2F5D4C"]

export type Fly = { lat: number; lng: number; t: number } | null
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches
const capNum = (v: Venue) => { const f = (Array.isArray(v.f) ? v.f[0] : v.f) || {}; return +(f.capacity_standing || f.capacity_seated || f.capacity_est_max_standing || f.capacity_est_max_seated || 0) }
function square(lng: number, lat: number, r = 6) {
  const dx = r / (111320 * Math.cos(lat * Math.PI / 180)), dy = r / 110540
  return [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]]
}
function ringGeo(r?: [number, number, number]): any {
  if (!r) return { type: "FeatureCollection", features: [] }
  const [lat, lng, m] = r, dl = m / 111320, dg = m / (111320 * Math.cos(lat * Math.PI / 180))
  const ring = Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * 2 * Math.PI; return [lng + dg * Math.cos(a), lat + dl * Math.sin(a)] })
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }
}
export default function Map3D({ venues, score, center, fly, onCenter, breaks, here, ring }: { venues: Venue[]; score: (v: Venue) => number; center: [number, number]; fly: Fly; onCenter?: (c: [number, number]) => void; breaks: number[]; here?: [number, number] | null; ring?: [number, number, number] }) {
  const el = useRef<HTMLDivElement>(null), m = useRef<maplibregl.Map | null>(null), ready = useRef(false)
  const data = () => {
    const pts = { type: "FeatureCollection", features: venues.map(v => ({ type: "Feature", properties: { s: score(v) }, geometry: { type: "Point", coordinates: [v.lng, v.lat] } })) }
    const cols = { type: "FeatureCollection", features: venues.map(v => { const pe = priceEst(v); return { type: "Feature", properties: { id: v.id, s: score(v), k: priceClass(priceMid(v), breaks) >= 0 ? 1 : 0, pc: Math.max(priceClass(priceMid(v), breaks), 0), h: capNum(v) > 0 ? Math.min(8 + 9 * Math.sqrt(capNum(v)), 220) : 6, name: v.name, cap: capText(v), price: /inimum spend/.test(v.fee_label || "") ? "Minimum spend applies" : pe ? `Est. £${Math.round(pe.low)}–£${Math.round(pe.high)}${pe.unit === "gbp_per_head" ? " a head" : ""}` : (v.fee_label || "Fee unknown"), lat: v.lat, lng: v.lng }, geometry: { type: "Polygon", coordinates: square(v.lng, v.lat) } } }) }
    return { pts, cols } as any
  }
  useEffect(() => {
    const map = new maplibregl.Map({ container: el.current!, style: "https://tiles.openfreemap.org/styles/positron", center: [center[1], center[0]], zoom: 13.5, pitch: 0, bearing: 0, attributionControl: { compact: true } })
    m.current = map
    map.on("moveend", () => { const c = map.getCenter(); onCenter?.([c.lat, c.lng]) })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")
    map.on("load", () => {
      const d = data()
      const lbl = map.getStyle().layers.find(l => l.type === "symbol")?.id
      map.addSource("pts", { type: "geojson", data: d.pts }); map.addSource("cols", { type: "geojson", data: d.cols })
      if (map.getSource("openmaptiles")) map.addLayer({ id: "bld", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
        paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], 0, P.mid, 60, P.line, 150, P.accent], "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.75 } }, lbl)
      map.addLayer({ id: "heat", type: "heatmap", source: "pts", paint: { "heatmap-weight": ["get", "s"], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 12, 16, 40], "heatmap-opacity": 0.6,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.15, P.busy, 0.5, P.mid, 1, P.free] } }, lbl)
      const ramp: any[] = ["interpolate", ["linear"], ["get", "s"]]; RAMP.forEach((c, i) => ramp.push(i / (RAMP.length - 1), c))
      map.addLayer({ id: "cols0", type: "fill-extrusion", source: "cols", filter: ["==", ["get", "k"], 0], paint: { "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.35, "fill-extrusion-color": "#A8A8A2" } })
      map.addLayer({ id: "cols", type: "fill-extrusion", source: "cols", filter: ["==", ["get", "k"], 1], paint: { "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.95, "fill-extrusion-vertical-gradient": true, "fill-extrusion-color": ["match", ["get", "pc"], 0, PRICE_RAMP[0], 1, PRICE_RAMP[1], 2, PRICE_RAMP[2], 3, PRICE_RAMP[3], PRICE_RAMP[4]] as any } })
      map.addSource("ring", { type: "geojson", data: ringGeo(ringRef.current) })
      map.addLayer({ id: "ring-f", type: "fill", source: "ring", paint: { "fill-color": "#6B8F71", "fill-opacity": 0.06 } }, lbl)
      map.addLayer({ id: "ring-l", type: "line", source: "ring", paint: { "line-color": "#43614A", "line-width": 2, "line-dasharray": [3, 3] } }, lbl)
      ready.current = true
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
      for (const id of ["cols", "cols0"]) {
      map.on("mousemove", id, e => { const p = e.features?.[0]?.properties as any; if (!p) return; map.getCanvas().style.cursor = "pointer"
        pop.setLngLat(e.lngLat).setHTML(`<div style="font:13px/1.35 inherit"><b>${String(p.name).replace(/</g, "&lt;")}</b><br>${p.cap}<br>${p.price}<br>Likely free: ${Math.round(p.s * 100)}%</div>`).addTo(map) })
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; pop.remove() })
      map.on("click", id, e => { const p = e.features?.[0]?.properties as any; if (p) go(map, p.lng, p.lat, 17) }) }
      go(map, center[1], center[0], 14.5)
    })
    return () => { map.remove(); m.current = null; ready.current = false }
  }, [])
  useEffect(() => { const map = m.current; if (!map || !ready.current) return; const d = data(); (map.getSource("pts") as any)?.setData(d.pts); (map.getSource("cols") as any)?.setData(d.cols) }, [venues, score])
  const ringRef = useRef(ring); ringRef.current = ring
  useEffect(() => { if (m.current && ready.current) (m.current.getSource("ring") as any)?.setData(ringGeo(ring)) }, [ring?.[0], ring?.[1], ring?.[2]])
  useEffect(() => { if (fly && m.current) go(m.current, fly.lng, fly.lat, 17) }, [fly])
  useEffect(() => { if (!here || !m.current) return; const el = document.createElement("div"); el.title = "You are here"; el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2F5BEA;border:3px solid #fff;box-shadow:0 0 0 2px #2F5BEA55"
    const mk = new maplibregl.Marker({ element: el }).setLngLat([here[1], here[0]]).addTo(m.current); return () => { mk.remove() } }, [here])
  return <div ref={el} className="h-full w-full" data-testid="map3d" />
}
function go(map: maplibregl.Map, lng: number, lat: number, zoom: number) {
  const o = { center: [lng, lat] as [number, number], zoom, pitch: 55, bearing: -17 }
  reduced() ? map.jumpTo(o) : map.flyTo({ ...o, duration: 2200, essential: true })
}
