export const SB = "https://bwkxqyhycuwqpuieggbt.supabase.co"
export const KEY = "sb_publishable_Uvss-chcbx2MEckOcsQwXg_QsSnbE62"
export const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const
export const SLOTS = [
  { id: "morning", label: "Morning", hours: "06–12", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon", hours: "12–17", from: 12, to: 17 },
  { id: "evening", label: "Evening", hours: "17–21", from: 17, to: 21 },
  { id: "late", label: "Late", hours: "21–06", from: 21, to: 30 },
] as const
export const TYPES: Record<string,string> = { pub:"#fbbf24", bar:"#fb7185", cafe:"#60a5fa", music:"#818cf8", community:"#2dd4bf", other:"#94a3b8" }
export type Feat = Record<string, any>
export type Venue = { id:number|string; name:string; type:string; lat:number; lng:number; free?:Record<string,number>; basis?:string; events?:number; fee_label?:string|null; url?:string; f?:Feat|null; [k:string]:any }
export const typeOf = (v:{type:string}) => TYPES[v.type] ? v.type : "other"
export const isEx = (n?:string) => /^EXAMPLE/.test(n||"")
export function capText(v: Venue) {
  const f = (Array.isArray(v.f) ? v.f[0] : v.f) || {}
  if (f.capacity_standing || f.capacity_seated) return `${f.capacity_standing||"?"} standing / ${f.capacity_seated||"?"} seated (stated)`
  if (f.capacity_est_max_standing) return `~${f.capacity_est_min_standing}–${f.capacity_est_max_standing} standing, ~${f.capacity_est_min_seated}–${f.capacity_est_max_seated} seated (est., ${f.capacity_confidence} conf.)`
  return "capacity unknown"
}
/** price estimate fields may live on the venue or its features; absent → null */
export function priceEst(v: any): { low:number; mid:number; high:number; conf?:string; n?:number; unit?:string } | null {
  const srcs = [v, Array.isArray(v?.f) ? v.f[0] : v?.f].filter(Boolean)
  for (const s of srcs) if ((s.price_est_mid ?? s.price_est_low) != null)
    return { low: s.price_est_low ?? s.price_est_mid, mid: s.price_est_mid ?? s.price_est_low, high: s.price_est_high ?? s.price_est_mid, conf: s.price_confidence, n: s.price_n_comparables ?? s.n_comparables, unit: s.price_est_unit }
  return null
}
/** overlap-weighted free score for an hour range [a,b] (b may exceed 24 → next day) */
export function freeScore(v: Venue, day: string, range: [number,number]) {
  let tot = 0, w = 0
  for (const s of SLOTS) {
    const o = Math.max(0, Math.min(range[1], s.to) - Math.max(range[0], s.from))
    if (!o) continue
    tot += o * ((v.free||{})[`${day}_${s.id}`] ?? 0.5); w += o
  }
  return w ? tot / w : 0.5
}
export function dominantSlot(range:[number,number]) {
  let best = "evening", bo = -1
  for (const s of SLOTS) { const o = Math.min(range[1], s.to) - Math.max(range[0], s.from); if (o > bo) { bo = o; best = s.id } }
  return best
}
export const fmtH = (h:number) => String(h % 24).padStart(2,"0") + ":00"
