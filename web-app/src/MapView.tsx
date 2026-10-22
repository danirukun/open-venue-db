import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup, Rectangle, Tooltip as LTooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet"
import L from "./leaflet-global"
import "leaflet.heat"
import type { Venue } from "./data"
import { capText, isEx, priceEst } from "./data"
import { P } from "./palette"

function Heat({ points }: { points: [number,number,number][] }) {
  const map = useMap()
  const layer = useMemo(() => (L as any).heatLayer([], { radius: 30, blur: 24, maxZoom: 16, gradient: { 0.1: P.busy, 0.5: P.mid, 1: P.free } }), [])
  useEffect(() => { layer.addTo(map); return () => { map.removeLayer(layer) } }, [map, layer])
  useEffect(() => { layer.setLatLngs(points) }, [layer, points])
  return null
}
function ZoomWatch({ onZoom, onMap }: { onZoom: (z:number)=>void; onMap: (m:L.Map)=>void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()), moveend: () => onZoom(map.getZoom() + Math.random() * 1e-9) })
  useEffect(() => { onMap(map) }, [map])
  return null
}
const feeNum = (l?:string|null) => { const m = (l||"").match(/£(\d+)/); return m && /^~?£/.test(l||"") ? +m[1] : null }

export default function MapView({ venues, all, score, slotLabel, onMap }: { venues: Venue[]; all: Venue[]; score: (v:Venue)=>number; slotLabel: string; onMap:(m:L.Map)=>void }) {
  const [zoom, setZoom] = useState(15), [mapRef, setMapRef] = useState<L.Map | null>(null)
  const points = useMemo(() => venues.map(v => [v.lat, v.lng, score(v)] as [number,number,number]), [venues, score])
  const cells = useMemo(() => {
    const dl = 0.0027, dg = 0.0043, c: Record<string, Venue[]> = {}
    all.forEach(v => { const k = Math.floor(v.lat/dl) + "_" + Math.floor(v.lng/dg); (c[k] = c[k] || []).push(v) })
    return Object.entries(c).map(([k, vs]) => {
      const [a, b] = k.split("_").map(Number)
      const nums = vs.map(v => feeNum(v.fee_label)).filter((x): x is number => x != null)
      const ests = vs.map(priceEst).filter(Boolean) as NonNullable<ReturnType<typeof priceEst>>[]
      const ms = vs.filter(v => /inimum spend/.test(v.fee_label||"")).length
      return { k, bounds: [[a*dl, b*dg], [(a+1)*dl, (b+1)*dg]] as [[number,number],[number,number]], n: vs.length, nums, ests, ms, unk: vs.length - nums.length }
    })
  }, [all])
  return (
    <MapContainer center={[51.5245, -0.0805]} zoom={15} zoomControl={false} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <ZoomControl position="bottomright" />
      <ZoomWatch onZoom={setZoom} onMap={m => { setMapRef(m); onMap(m) }} />
      <Heat points={points} />
      {zoom >= 13 && cells.filter(c => mapRef?.getBounds().pad(0.2).intersects(c.bounds as any)).map(c => (
        <Rectangle key={c.k} bounds={c.bounds} pathOptions={{ weight: 0.5, color: P.ink, fillOpacity: c.nums.length ? 0.02 : 0.06, fillColor: c.nums.length ? P.ink : P.muted, dashArray: c.nums.length ? undefined : "2 3" }}>
          <LTooltip sticky>
            <div className="p-1 text-[13px] leading-tight">
              <div className="font-bold mb-1">{c.n} venues in this area</div>
              <div className="text-slate-600 mb-1">Stated fee or minimum spend: <b >{c.nums.length ? `£${Math.min(...c.nums)}–£${Math.max(...c.nums)}` : "price unknown"}</b></div>
              {c.ests.length > 0 && <div className="text-slate-600 mb-1">Estimated hire: <b >£{Math.round(Math.min(...c.ests.map(e=>e.low)))}–£{Math.round(Math.max(...c.ests.map(e=>e.high)))}</b> <span className="text-slate-400">({c.ests.length} est.)</span></div>}
              {c.ms > 0 && <div className="text-slate-600">{c.ms} say "minimum spend applies" (amount unknown)</div>}
              <div className="text-slate-400 italic">{Math.round(100*c.unk/c.n)}% no stated price</div>
            </div>
          </LTooltip>
        </Rectangle>
      ))}
      {zoom >= 15 && venues.filter(v => mapRef?.getBounds().pad(0.2).contains([v.lat, v.lng])).map(v => { const f = score(v), pe = priceEst(v); return (
        <CircleMarker key={v.id} center={[v.lat, v.lng]} radius={7} pathOptions={{ color: (v.events||0) > 0 ? "#fff" : P.ink, weight: 2, fillOpacity: 1, fillColor: (v.events||0) > 0 ? P.ink : "#fff" }}>
          <Popup>
            <div className="min-w-[220px]">
              <div className="flex justify-between items-start gap-2"><b className="text-[15px] leading-tight">{v.name}{isEx(v.name) && <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-bold ml-1">Example data</span>}</b><span className="text-[10px] bg-slate-100 px-1 rounded">{v.type}</span></div>
              <div className="text-xs text-slate-500 my-1">{capText(v)}</div>
              <div className="text-xs mb-2">Free {slotLabel}: <b className="text-canal">{f.toFixed(2)}</b><span className="text-[10px] text-slate-400 block">({v.basis||""})</span></div>
              <div className="bg-slate-50 text-slate-600 text-[11px] px-2 py-1 rounded-md mb-1">{/inimum spend/.test(v.fee_label||"") ? "Minimum spend applies (amount unknown)" : v.fee_label || "fee unknown"}</div>
              {pe && <div className="bg-amber-50 text-amber-800 text-[11px] px-2 py-1 rounded-md mb-2">Est. £{Math.round(pe.low)}–£{Math.round(pe.high)}{pe.unit === "gbp_per_head" ? "/head" : pe.unit ? ` ${pe.unit.replace(/_/g," ")}` : ""} {pe.conf ? `(${pe.conf} conf.` : "("}{pe.n != null ? `, ${pe.n} comparables)` : ")"}</div>}
              <a href={v.url || "#"} target="_blank" className="text-canal text-[11px] font-bold">Open source page</a>
            </div>
          </Popup>
        </CircleMarker>) })}
    </MapContainer>
  )
}
