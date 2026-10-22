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

### Palette (5)
| Name | Hex | Role |
|---|---|---|
| Night ink | `#1C2541` | Text, the selected day, the sidebar heading |
| Lamplight | `#F2B134` | The one bold colour: the time band and "likely free" heat peak |
| Canal | `#2E6F6A` | Actions and links (AA on white: 5.6:1) |
| Last orders | `#A23B5A` | Busy end of the heat scale, "busy" mode |
| Fog | `#F3F4F1` | Sidebar background, quiet panels |

Heat scale: Last orders `#A23B5A` → `#E8D9B0` → Lamplight `#F2B134` → Canal `#2E6F6A`. Busy reads as wine-red, quiet as canal green, with a lamplit middle.

### Type
- **Bricolage Grotesque** (variable): display and headings. Quirky, slightly condensed at heavy weights, like a hand-painted pub sign without pastiche. Used large for the wordmark and for the question "When are you running it?".
- **Public Sans** (variable): body, labels, numbers (tabular figures). Plain and highly legible at 12–14 px.
- Scale (1.25): 12 / 14 / 16 / 20 / 25 / 31. Labels in sentence case, never tracked caps. No monospace.

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
