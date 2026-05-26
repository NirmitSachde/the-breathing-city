# The Breathing City

[![Live Demo](https://img.shields.io/badge/Live-nirmitsachde.github.io-F2A93B?style=flat-square&logo=github&logoColor=white&labelColor=0D3B3E)](https://nirmitsachde.github.io/the-breathing-city/)
[![License: MIT](https://img.shields.io/badge/License-MIT-4FA08A?style=flat-square&labelColor=0D3B3E)](LICENSE)
[![D3 v7](https://img.shields.io/badge/D3-v7-F9A03C?style=flat-square&logo=d3.js&logoColor=white&labelColor=0D3B3E)](https://d3js.org/)
[![Scrollama](https://img.shields.io/badge/Scrollama-v3-1A6E6B?style=flat-square&labelColor=0D3B3E)](https://github.com/russellsamora/scrollama)
[![No Build](https://img.shields.io/badge/No%20Build-Vanilla%20JS-E74C3C?style=flat-square&logo=javascript&logoColor=white&labelColor=0D3B3E)](#run-it-locally)
[![Data: PurpleAir](https://img.shields.io/badge/Data-PurpleAir-9B59B6?style=flat-square&labelColor=0D3B3E)](https://www2.purpleair.com/)

> A scroll-driven narrative of how Cambridge breathes across 24 hours, traced
> through PM<sub>2.5</sub> sensor data.

```
13 neighborhoods · 36 sensors · 90 days of PurpleAir history · 7 chapters
```

[**Open the live demo →**](https://nirmitsachde.github.io/the-breathing-city/)

---

## What this is

A single-page, framework-free scrollytelling piece. The user does not steer
the data, the story does. Each scroll position triggers a coordinated
transition across the choropleth map, the time-of-day readout, the rank
panel and an animated citywide line chart during the rush chapters.

The aesthetic is intentional. Custom 7-stop palette, Space Grotesk + Inter
type, dark basemap and hand-positioned annotations. No default chart styling
anywhere.

---

## Run it locally

```bash
# from the repo root
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Any static server works (Vite, `serve`,
`caddy file-server`, GitHub Pages). The data files are ordinary JSON and
GeoJSON, no build step required.

---

## Project layout

```
index.html              page entry point
css/styles.css          design system and scrolly layout
js/
  main.js               boot, data load and scroll orchestration
  map.js                d3 choropleth, sensors, legend and 24h loop
  chart.js              citywide PM2.5 line chart, animated by hour
  scroll.js             scrollama bridge
  ui.js                 hero particles, counters and time arc
  stats.js              binds narrative numbers to the dataset
  palette.js            shared 7-stop color scale
data/
  cambridge_neighborhoods.geojson   Cambridge CDD polygons
  air_quality_24h.json              24h x 13 neighborhoods x sensors

preprocessing/
  fetch_purpleair.py      live PurpleAir pipeline (needs API key)
  generate_synthetic.py   reproducible local fallback
```

---

## Data pipeline

The browser only loads JSON. The fetch and aggregation happen in Python,
offline. This keeps the page fast and the API key off the client.

### Live data (PurpleAir)

```bash
# Request a free key from PurpleAir, then:
export PURPLEAIR_API_KEY="your-key-here"
python3 preprocessing/fetch_purpleair.py --days 90
```

The script queries every PurpleAir sensor inside the Cambridge bounding
box, pulls hourly history for each station over a 90-day window, drops
bad rows (channel disagreement, spikes above 500 µg/m³ and missing
values), computes a typical-day median profile per sensor, then
interpolates each hour to the 13 CDD neighborhood polygons with
inverse-distance weighting (p=2). Output goes to
`data/air_quality_24h.json`.

### Fallback (synthetic)

For local development without a key, `generate_synthetic.py` produces a
deterministic dataset matching the same schema. It models the typical
urban PM<sub>2.5</sub> diurnal pattern (two rush peaks, midday recovery
and overnight baseline) and the per-neighborhood traffic and green-space
character.

```bash
python3 preprocessing/generate_synthetic.py
```

### Auto-refresh (GitHub Actions)

`.github/workflows/refresh-data.yml` runs on the 1st of each month,
fetches the last 30 days, rebuilds the JSON and commits it back to
`main`. The Pages deploy picks it up automatically. The same workflow
can be triggered on demand from the **Actions** tab with a custom
`--days` value.

Required secret: `PURPLEAIR_API_KEY` (READ key). Add via
*Settings → Secrets and variables → Actions*.

Geometry comes from the [Cambridge GIS open-data
repo](https://github.com/cambridgegis/cambridgegis_data) under
`CDD_Neighborhoods`.

---

## Design system

| Token            | Value |
|------------------|-------|
| Palette          | 7-stop sequential: `#0D3B3E` to `#1A6E6B` to `#4FA08A` to `#C9D87C` to `#F2A93B` to `#E66A2F` to `#E74C3C` |
| Anchor stops     | `3 · 6 · 9 · 12 · 15 · 19 · 24` µg/m³ |
| Display type     | Space Grotesk 400 and 500 |
| Body type        | Inter 300, 400 and 500 |
| Mono             | JetBrains Mono 400 and 500 |
| Surface          | `#050B0D` page, `#0A1518` cards, `#102225` raised |
| Motion           | 800ms cubic-bezier(0.65, 0, 0.35, 1) for state transitions |

The WHO daily PM<sub>2.5</sub> guideline of 15 µg/m³ is marked on both
the choropleth legend and the citywide line chart so the reader always
has a reference point.

---

## Stack

- **D3 v7** for projection, scales, transitions and line generators
- **Scrollama** for intersection-observer scroll triggers
- **Vanilla** HTML, CSS and JavaScript everywhere else, no build step

---

## Accessibility

- Honors `prefers-reduced-motion`, transitions collapse to instant
- WCAG AA contrast on body text against the dark surfaces
- The 7-stop palette stays distinguishable under deuteranopia simulation
- Keyboard scroll works, no mouse-only listeners

---

## License

Code: MIT. Data: PurpleAir (public, free for research) and Cambridge GIS
(open data).
