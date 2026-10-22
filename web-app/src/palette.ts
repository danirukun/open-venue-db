/** Themeable neutral palettes. Select with ?palette=a|b|c (remembered in localStorage). */
export type Pal = { name: string; ink: string; fog: string; line: string; muted: string; accent: string; accentInk: string; free: string; mid: string; busy: string }
export const PALETTES: Record<string, Pal> = {
  // Warm stone + graphite, muted ochre accent; heat = blue (free) to rust (busy)
  a: { name: "Stone", ink: "#1C1917", fog: "#F5F5F4", line: "#E7E5E4", muted: "#57534E", accent: "#B7791F", accentInk: "#7A4E0E", free: "#2C5F7C", mid: "#E9E4DA", busy: "#B4532A" },
  // Cool slate, muted blue accent; heat = blue to burnt orange
  b: { name: "Slate", ink: "#0F172A", fog: "#F1F5F9", line: "#E2E8F0", muted: "#475569", accent: "#4F6D8F", accentInk: "#334A66", free: "#2F5B8A", mid: "#E2E8F0", busy: "#C0623A" },
  // Off-white + charcoal, sage accent; heat = sage-teal to plum (CB-safe pair)
  c: { name: "Sage", ink: "#262626", fog: "#FAFAF7", line: "#E7E7E1", muted: "#5C5C57", accent: "#6B8F71", accentInk: "#43614A", free: "#3D6E5E", mid: "#ECEBE4", busy: "#8E4F7E" },
}
function pick(): string {
  const q = new URLSearchParams(location.search).get("palette")?.toLowerCase()
  if (q && PALETTES[q]) { try { localStorage.setItem("ovdb-palette", q) } catch {} ; return q }
  try { const s = localStorage.getItem("ovdb-palette"); if (s && PALETTES[s]) return s } catch {}
  return "a"
}
export const PID = pick()
export const P = PALETTES[PID]
const r = document.documentElement.style
Object.entries(P).forEach(([k, v]) => k !== "name" && r.setProperty(`--p-${k}`, v))
document.documentElement.dataset.palette = PID
