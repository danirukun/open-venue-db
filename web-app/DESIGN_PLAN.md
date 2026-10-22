# Design plan: Open Venue DB map

**Subject:** an open map of London rooms (pub back rooms, cafés after closing, small music and comedy rooms) and the nights they sit quiet.
**Audience:** community organisers and show runners with little or no budget.
**Primary job:** "Which rooms near here are probably free on Wednesday evening, and what will it cost me?"

## First pass
- Palette: white, slate, teal accent (#0EA5A4), traffic-light heat (brown → yellow → green).
- Type: Geist for everything.
- Layout: sidebar of rounded cards, floating card toolbar, floating legend card.
- Principles: clean, modern, trustworthy.

## Critique of the first pass
- Teal on white with Geist and a stack of identical rounded, shadowed cards is the SaaS-card kit (tell 4). It could be any dashboard.
- "FIND A VENUE", "RANKED RESULTS", "MAP KEY" are tracked ALL-CAPS eyebrows (tell 5).
- Result meta is "pub · ~33–55 standing · 0.9 km" with middle dots, and hours use a mono face (tell 5).
- Brown → green heat is a generic traffic light; it says nothing about nights out.
- Nothing is memorable. The subject (the evening, the week) has no visual form.

## Revised plan

### Palette (current: C "Sage", default; A/B via ?palette=a|b, defined in src/palette.ts as CSS vars)
| Role | C Sage (default) | A Stone | B Slate |
|---|---|---|---|
| Ink (text, selected states) | `#262626` | `#1C1917` | `#0F172A` |
| Background | `#FAFAF7` | `#F5F5F4` | `#F1F5F9` |
| Lines | `#E7E7E1` | `#E7E5E4` | `#E2E8F0` |
| Muted text | `#5C5C57` | `#57534E` | `#475569` |
| Accent (time band) | `#6B8F71` | `#B7791F` | `#4F6D8F` |
| Accent text | `#43614A` | `#7A4E0E` | `#334A66` |
| Heat free / mid / busy | `#3D6E5E` / `#ECEBE4` / `#8E4F7E` | `#2C5F7C` / `#E9E4DA` / `#B4532A` | `#2F5B8A` / `#E2E8F0` / `#C0623A` |

Heat scales are two-hue diverging (green–purple or blue–orange) to stay colour-blind friendly.

### Type
- **Geist** (variable) for everything, tabular figures. Headings semibold with tight tracking.
- Scale: 12 / 14 / 16 / 20 / 31. Sentence case, no tracked caps, no monospace.

### Selected states
Selected day, slot, room-type and must-have chips are filled ink with light text; unselected types are dashed. Time band shows the chosen hours filled in the accent with start/end labels. Map key can be hidden/shown (persisted in localStorage).

### Layout
```
desktop                                     mobile
+-----------+------------------------------+ +---------------------+
| Open Venue|  [when strip: Mon..Sun       | | Open Venue DB       |
| DB        |   ========lamplight band===] | | when strip (scroll) |
| question  |                              | +---------------------+
| form      |          MAP + heat          | |   MAP (52vh)        |
|-----------|                              | |                     |
| results   |                   key (flat) | +---------------------+
| list with |                              | | form, results list  |
| free bar  |                              | | key                 |
+-----------+------------------------------+ +---------------------+
```
- Everything left-aligned. The sidebar reads top to bottom as a sentence: who, budget, when, results.
- Results are a divided list, not cards in cards: each row has a left bar whose height or colour is the free likelihood.
- The "when" strip is the memorable element: days as plain text tabs over a 24-hour band (06:00 to 06:00) with the chosen slot lit in Lamplight, like a lit window on a dark street. Slots sit on that band, so hours are shown by position, not by a label.
- Legend sits flat on the map edge, with a plain sentence title "How to read the map".

### Principles
1. Spend the boldness on the time band. Everything else is quiet ink on fog.
2. Say what we don't know plainly: "Fee unknown", "Estimate", "Example data".
3. Sentence case, plain verbs: "Find rooms", "Open source page", "Draft an enquiry".
4. Motion only when the person acts (the band moves to the chosen slot); none with reduced motion.
5. Radius by hierarchy: 14 px panels, 8 px controls, full pills only for type filters.

## Self-critique after the first build
- The full-colour OSM tiles drowned the heat. Fix: the basemap is mostly greyscale now, so Lamplight and Canal carry the colour.
- Kept: the time band reads as the one memorable element. The results list without card chrome scans faster.
- Still open: the "When" panel is wide on 1024–1280 px screens, and the legend could collapse on short screens.
