import { chromium } from "playwright"
const url = process.argv[2] || "http://localhost:4173", tag = process.argv[3] || "local"
const b = await chromium.launch(); let fail = 0
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()) }); p.on("pageerror", e => errs.push(String(e)))
  await p.goto(url, { waitUntil: "networkidle" }); await p.waitForFunction(() => window.__offpeak?.items?.length > 50, null, { timeout: 60000 }); await p.waitForTimeout(1500)
  const ids0 = await p.evaluate(() => window.__offpeak.items.map(i => String(i.v.id)).sort().join())
  const rep = []
  for (const z of [12, 13, 14, 15, 16, 17, 16, 15, 14, 13, 12]) {
    await p.evaluate(z => window.__offpeak.map.setZoom(z, { animate: false }), z); await p.waitForTimeout(900)
    const r = await p.evaluate(() => { const m = window.__offpeak.map, bd = m.getBounds(); const inView = window.__offpeak.items.filter(i => bd.contains([i.v.lat, i.v.lng])).length
      let rendered = 0; document.querySelectorAll(".leaflet-marker-icon").forEach(e => { const n = e.querySelector("[data-n]"); rendered += n ? +n.dataset.n : e.classList.contains("venue-pin") ? 1 : 0 })
      return { inView, rendered, ids: window.__offpeak.items.map(i => String(i.v.id)).sort().join() } })
    rep.push(`${z}:${r.rendered}/${r.inView}`)
    // every in-view venue represented (cluster bubbles may also count a few just outside view, so rendered >= inView)
    if (r.rendered < r.inView || r.ids !== ids0) { fail++; console.log(`${w} z${z} FAIL rendered ${r.rendered} < inView ${r.inView} or set changed`) }
  }
  console.log(`${w}x${h} pins rendered/in-view per zoom: ${rep.join(" ")}`)
  await p.evaluate(() => window.__offpeak.map.setZoom(14, { animate: false })); await p.waitForTimeout(800)
  // layers
  await p.getByTestId("layers-btn").click(); await p.getByRole("radio", { name: "Crime rate" }).click(); await p.waitForTimeout(2500)
  await p.screenshot({ path: `screenshot-layers-${tag}-${w}x${h}-crime.png` })
  if (!/layer=crime/.test(p.url())) { fail++; console.log("url param missing") }
  await p.getByRole("radio", { name: "Transit access" }).click(); await p.waitForTimeout(1200); await p.screenshot({ path: `screenshot-layers-${tag}-${w}x${h}-transit.png` })
  await p.getByRole("radio", { name: "None" }).click(); await p.getByRole("button", { name: "Close layers" }).click()
  // typeahead
  const q = p.getByLabel("Search a place or postcode"); await q.click(); await q.fill("prince char"); await p.waitForTimeout(1500)
  await p.screenshot({ path: `screenshot-layers-${tag}-${w}x${h}-typeahead.png` })
  await q.press("ArrowDown"); await q.press("Enter"); await p.waitForTimeout(2000)
  const card = await p.getByTestId("venue-card").count(); if (!card) { fail++; console.log("no card after typeahead") }
  await p.screenshot({ path: `screenshot-layers-${tag}-${w}x${h}-card.png` })
  const cb = await p.getByTestId("venue-card").boundingBox(); if (cb && (cb.x < 0 || cb.y < 0 || cb.x + cb.width > w + 1 || cb.y + cb.height > h + 1)) { fail++; console.log("card outside viewport", cb) }
  // 3D card
  await p.getByRole("button", { name: "Close details" }).click()
  await p.getByRole("button", { name: "3D", exact: true }).click(); await p.waitForTimeout(5000)
  await q.click(); await q.fill("prince char"); await p.waitForTimeout(1200); await q.press("ArrowDown"); await q.press("Enter"); await p.waitForTimeout(3000)
  await p.screenshot({ path: `screenshot-layers-${tag}-${w}x${h}-3d.png` })
  console.log(`${w}x${h} card2d=${card} card3d=${await p.getByTestId("venue-card").count()} errors: ${errs.length ? errs.join(" | ") : "none"}`); if (errs.length) fail++
  await p.close()
}
await b.close(); console.log(fail ? `FAIL ${fail}` : "PASS"); process.exit(fail ? 1 : 0)
