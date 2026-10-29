// Flags buttons/chips whose label wraps or overflows. Usage: node check-wrap.mjs <url> <tag>
import { chromium } from "playwright"
const [url = "http://localhost:4173", tag = "after"] = process.argv.slice(2)
const sizes = [[1280, 800], [1440, 900], [390, 844]]
const b = await chromium.launch(); let bad = 0
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(2500)
  const q = p.getByLabel("Search a place or postcode"); await q.fill("Leicester Square"); await q.press("Enter"); await p.waitForTimeout(3000)
  // cinema-only filter so Prince Charles is in the list; audit the filter panel while open
  await p.getByRole("button", { name: /types/i }).first().click(); await p.waitForTimeout(400)
  const fr = p.getByRole("region", { name: "Filter options" }); await fr.getByText("Clear", { exact: true }).click(); await fr.getByRole("button", { name: /Cinema/ }).click(); await p.waitForTimeout(400)
  await p.screenshot({ path: `screenshot-polish-${tag}-${w}x${h}-filters.png` })
  await fr.getByRole("button", { name: "Done" }).click(); await p.waitForTimeout(1500)
  if (w < 768) { const hd = p.getByTestId("sheet-handle"); for (let i = 0; i < 1; i++) { await hd.click().catch(() => {}); await p.waitForTimeout(400) } }
  const card = p.locator("li button[aria-expanded]", { hasText: "Prince Charles" }).first()
  if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.click(); await p.waitForTimeout(800) } else console.log(`${w}x${h}: Prince Charles card not found`)
  const issues = await p.evaluate(() => [...document.querySelectorAll('button, a[class*="rounded-full"], [role=button], [data-slot=badge], [data-testid=price-block] span, select')].filter(e => {
    if (e.closest(".leaflet-pane, .maplibregl-canvas-container") || e.closest("li button[aria-expanded]") === e) return false
    const r = e.getBoundingClientRect(); if (!r.width || !(e.innerText || "").trim()) return false
    // wrapped: any text node renders on >1 line
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n, wrapped = false
    while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); const tops = [...rg.getClientRects()].map(x => x.top); if (tops.length && Math.max(...tops) - Math.min(...tops) > 6) wrapped = true }
    const cs = getComputedStyle(e); const scrolls = /auto|scroll/.test(cs.overflowX)
    return wrapped || (!scrolls && e.scrollWidth > e.clientWidth + 1)
  }).map(e => `${e.tagName} "${e.innerText.trim().replace(/\s+/g, " ").slice(0, 40)}" ${e.scrollWidth}/${e.clientWidth}`))
  issues.forEach(i => console.log(`${w}x${h} WRAP/OVERFLOW: ${i}`)); bad += issues.length
  await p.locator("li:has(button[aria-expanded=true]) a, li:has(button[aria-expanded=true]) button:has-text('enquiry')").last().scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(300)
  await p.screenshot({ path: `screenshot-polish-${tag}-${w}x${h}.png` }); await p.close()
}
await b.close(); console.log(bad ? `${bad} issues` : "OK: no wrapped/overflowing buttons or chips"); process.exit(bad ? 1 : 0)
