# Open Venue DB – web app (Vite + React + TS + Tailwind v4 + shadcn/ui)

React port of `web/index.html`: Leaflet/OSM quiet-nights heatmap (react-leaflet + leaflet.heat), 300 m hover grid with price ranges, legend card, Supabase-backed search (`search_venues` RPC).

- Time: segmented slot bar (Morning 06–12, Afternoon 12–17, Evening 17–21, Late 21–06) or a two-thumb custom hour range (overlap-weighted free score).
- Weekday chips (today underlined), Quiet/Busy switch, venue-type chips with counts.
- Price estimates (`venue_features.price_est_*`) shown when present; otherwise honest "price unknown" / "fee unknown".

```bash
npm i && npm run dev        # local
npm run build               # single-file dist/index.html (+ data.json fallback)
```
Only the public Supabase publishable key is used (read-only, RLS).
