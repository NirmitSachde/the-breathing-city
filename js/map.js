// =============================================================================
// MAP. Choropleth of Cambridge neighborhoods, sensor dots, dynamic legend,
// ranked side panel, 24h auto-loop.
// =============================================================================

import { PALETTE, STOPS, colorFor, WHO_ANNUAL } from './palette.js';

let svg, gNhood, gGlow, gSensor, gLabel;
let projection, pathGen;
let nhoodFeatures = [];
let nameById = new Map();
let loopTimer = null;
let currentHour = 5;
let currentByNhood = new Map(); // id -> pm25 at currentHour, for hover lookups

export function initMap(geo, data) {
  nhoodFeatures = geo.features;
  nameById = new Map(nhoodFeatures.map(f => [f.properties.N_HOOD, f]));

  svg = d3.select('#map');

  // Fit projection
  const w = 800, h = 600;
  projection = d3.geoMercator().fitSize([w - 40, h - 40], geo);
  // Center it
  const t = projection.translate();
  projection.translate([t[0] + 20, t[1] + 20]);
  pathGen = d3.geoPath().projection(projection);

  // Defs (filters, gradients used inline elsewhere)
  const defs = svg.append('defs');

  const glow = defs.append('filter')
    .attr('id', 'softGlow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  glow.append('feGaussianBlur').attr('stdDeviation', 8).attr('result', 'blur');
  const merge = glow.append('feMerge');
  merge.append('feMergeNode').attr('in', 'blur');
  merge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Subtle base graticule (concentric arcs for atmosphere)
  const bgGroup = svg.append('g').attr('class', 'map-bg');
  for (let r = 60; r < 800; r += 80) {
    bgGroup.append('circle')
      .attr('cx', w / 2).attr('cy', h / 2).attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', '#1A3033')
      .attr('stroke-width', 0.3)
      .attr('opacity', 0.4);
  }

  // Layer order: glow underneath, then polygons, then borders, then sensors, then labels
  gGlow   = svg.append('g').attr('class', 'g-glow');
  gNhood  = svg.append('g').attr('class', 'g-nhood');
  gSensor = svg.append('g').attr('class', 'g-sensor');
  gLabel  = svg.append('g').attr('class', 'g-label');

  // Glow layer (blurred mirror of polygons)
  gGlow.selectAll('path')
    .data(nhoodFeatures)
    .join('path')
    .attr('class', 'nhood-glow')
    .attr('d', pathGen)
    .attr('fill', '#0D3B3E')
    .attr('filter', 'url(#softGlow)');

  // Main polygons
  gNhood.selectAll('path')
    .data(nhoodFeatures)
    .join('path')
    .attr('class', 'nhood')
    .attr('d', pathGen)
    .attr('fill', '#0D3B3E')
    .attr('data-id', d => d.properties.N_HOOD)
    .on('mouseenter', function(event, d) {
      d3.select(this).raise();
      showTooltip(event, d);
    })
    .on('mousemove', function(event) {
      moveTooltip(event);
    })
    .on('mouseleave', function() {
      hideTooltip();
    })
    .on('touchstart', function(event, d) {
      event.preventDefault();
      d3.select(this).raise();
      const t = event.touches[0] || event.changedTouches[0];
      showTooltip({ clientX: t.clientX, clientY: t.clientY }, d);
    }, { passive: false });

  // Tap anywhere else inside the map area dismisses the tooltip
  document.addEventListener('touchstart', (event) => {
    if (!event.target.closest('#map path.nhood')) hideTooltip();
  }, { passive: true });

  // Neighborhood labels (only for larger polygons; D3-style placement at centroid)
  gLabel.selectAll('text')
    .data(nhoodFeatures.filter(f => pathGen.area(f) > 1200))
    .join('text')
    .attr('class', 'nhood-label')
    .attr('text-anchor', 'middle')
    .attr('x', d => pathGen.centroid(d)[0])
    .attr('y', d => pathGen.centroid(d)[1])
    .text(d => d.properties.NAME);

  // Sensors
  const sensors = data.sensors;
  const sensorG = gSensor.selectAll('g.sensor-group')
    .data(sensors)
    .join('g')
    .attr('class', 'sensor-group')
    .attr('transform', d => {
      const [x, y] = projection([d.lng, d.lat]);
      return `translate(${x}, ${y})`;
    });

  sensorG.append('circle')
    .attr('class', 'sensor-pulse')
    .attr('r', 2.5);
  sensorG.append('circle')
    .attr('class', 'sensor')
    .attr('r', 2.2);

  // Build the legend (gradient is in CSS; we add the tick labels here)
  buildLegendAxis();
  buildRankPanel(data);
}

function buildLegendAxis() {
  const axis = document.getElementById('legendAxis');
  if (!axis) return;
  // 3 anchor labels: min, ~middle, max
  axis.innerHTML = `<span>${STOPS[0]}</span><span>${STOPS[3]}</span><span>${STOPS[STOPS.length - 1]}+</span>`;
}

function buildRankPanel(data) {
  const ul = document.getElementById('rankList');
  if (!ul) return;

  // Build empty rows once; later updates only tween values.
  ul.innerHTML = Array.from({ length: 5 }).map(() => `
    <li class="rank-item">
      <span class="rank-swatch"></span>
      <span class="rank-name"></span>
      <span class="rank-val">0.0</span>
      <span class="rank-bar"></span>
    </li>
  `).join('');

  updateRank(5, data);
}

// Hold previous values so we can tween between snapshots.
let lastRank = [0, 0, 0, 0, 0];
const maxObserved = 28; // a touch above the data's peak so bars never hit 100%

function updateRank(hour, data) {
  const ul = document.getElementById('rankList');
  if (!ul) return;

  const rows = data.hourly[hour]
    .slice()
    .sort((a, b) => b.pm25 - a.pm25)
    .slice(0, 5);

  const items = ul.querySelectorAll('.rank-item');
  rows.forEach((r, i) => {
    const li = items[i];
    if (!li) return;
    const swatch = li.querySelector('.rank-swatch');
    const nameEl = li.querySelector('.rank-name');
    const valEl = li.querySelector('.rank-val');
    const bar = li.querySelector('.rank-bar');

    nameEl.textContent = r.name;
    swatch.style.background = colorFor(r.pm25);

    bar.style.color = colorFor(r.pm25);
    bar.style.transform = `scaleX(${Math.min(1, r.pm25 / maxObserved)})`;

    tweenNumber(valEl, lastRank[i] || 0, r.pm25, 700);
    lastRank[i] = r.pm25;
  });

  // Update the title's hour stamp.
  const timeEl = document.getElementById('rankTitleTime');
  if (timeEl) timeEl.textContent = `${String(hour).padStart(2, '0')}:00`;
}

function tweenNumber(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * eased;
    el.textContent = v.toFixed(1);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = to.toFixed(1);
  }
  requestAnimationFrame(step);
}

export function renderHour(hour, data) {
  currentHour = hour;
  const byId = new Map(data.hourly[hour].map(d => [d.id, d.pm25]));
  currentByNhood = byId;
  refreshTooltipIfOpen();

  gNhood.selectAll('path.nhood')
    .transition()
    .duration(800)
    .ease(d3.easeCubicInOut)
    .attr('fill', d => {
      const v = byId.get(d.properties.N_HOOD);
      return v != null ? colorFor(v) : '#0D3B3E';
    });

  gGlow.selectAll('path.nhood-glow')
    .transition()
    .duration(800)
    .ease(d3.easeCubicInOut)
    .attr('fill', d => {
      const v = byId.get(d.properties.N_HOOD);
      // Only glow when concentration is above the WHO annual guideline
      if (v == null || v < WHO_ANNUAL) return 'transparent';
      return colorFor(v);
    })
    .attr('opacity', d => {
      const v = byId.get(d.properties.N_HOOD);
      if (v == null) return 0;
      return Math.min(0.7, Math.max(0, (v - WHO_ANNUAL) / 3));
    });

  updateRank(hour, data);
  updateMapAnnotation(hour, data);
}

function updateMapAnnotation(hour, data) {
  const layer = document.getElementById('mapAnnotations');
  if (!layer) return;
  layer.innerHTML = '';

  // Annotation: at the morning crest (hour 9) highlight the hottest
  // neighborhood. At the evening low (hour 20) highlight the cleanest.
  let target, kind;
  if (hour === 9) {
    target = data.hourly[hour].reduce((a, b) => (a.pm25 > b.pm25 ? a : b));
    kind = 'peak';
  } else if (hour === 20) {
    target = data.hourly[hour].reduce((a, b) => (a.pm25 < b.pm25 ? a : b));
    kind = 'low';
  } else {
    return;
  }

  const feat = nameById.get(target.id);
  if (!feat) return;
  const [cx, cy] = pathGen.centroid(feat);

  const svgEl = document.getElementById('map');
  const rect = svgEl.getBoundingClientRect();
  const vb = svgEl.viewBox.baseVal;
  const scaleX = rect.width / vb.width;
  const scaleY = rect.height / vb.height;
  const px = cx * scaleX;
  const py = cy * scaleY;

  const ann = document.createElement('div');
  ann.className = 'annotation';
  ann.innerHTML = `
    <span class="annotation-value">${target.pm25.toFixed(1)} <span style="font-size:12px;color:var(--c-fg-3);">µg/m³</span></span>
    <span class="annotation-label">${target.name} · ${kind}</span>
  `;
  const offsetX = px > rect.width / 2 ? -220 : 24;
  const offsetY = -40;
  ann.style.left = (px + offsetX) + 'px';
  ann.style.top  = (py + offsetY) + 'px';
  layer.appendChild(ann);

  requestAnimationFrame(() => ann.classList.add('show'));
}

export function animateLoop(data, onTick) {
  stopLoop();
  // Cycle through all 24 hours, ~600ms per hour = 14.4s/loop
  let h = currentHour;
  const tick = () => {
    h = (h + 1) % 24;
    renderHour(h, data);
    if (onTick) onTick(h);
  };
  loopTimer = setInterval(tick, 620);
}

export function stopLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

// =============================================================================
// Hover tooltip
// =============================================================================

let activeTooltipId = null;

function showTooltip(event, feature) {
  const el = document.getElementById('mapTooltip');
  if (!el) return;
  activeTooltipId = feature.properties.N_HOOD;
  el.hidden = false;
  paintTooltip(feature);
  moveTooltip(event);
  requestAnimationFrame(() => el.classList.add('visible'));
}

function moveTooltip(event) {
  const el = document.getElementById('mapTooltip');
  const wrap = document.querySelector('.map-wrap');
  if (!el || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
}

function hideTooltip() {
  const el = document.getElementById('mapTooltip');
  if (!el) return;
  activeTooltipId = null;
  el.classList.remove('visible');
  // Wait for the fade transition before hiding so it's not flashy.
  setTimeout(() => { if (!activeTooltipId) el.hidden = true; }, 200);
}

function refreshTooltipIfOpen() {
  if (!activeTooltipId) return;
  const feat = nameById.get(activeTooltipId);
  if (feat) paintTooltip(feat);
}

function paintTooltip(feature) {
  const el = document.getElementById('mapTooltip');
  if (!el) return;
  const v = currentByNhood.get(feature.properties.N_HOOD);
  if (v == null) {
    el.innerHTML = `<div class="tooltip-name">${feature.properties.NAME}</div>`;
    return;
  }
  const delta = v - WHO_ANNUAL;
  const deltaClass = delta > 0 ? 'over' : 'under';
  const deltaText = delta > 0
    ? `${delta.toFixed(1)} above WHO annual`
    : `${Math.abs(delta).toFixed(1)} below WHO annual`;
  el.innerHTML = `
    <div class="tooltip-name">${feature.properties.NAME}</div>
    <div class="tooltip-row">
      <span><span class="tooltip-swatch" style="background:${colorFor(v)}"></span>PM<sub>2.5</sub></span>
      <strong>${v.toFixed(1)} <span style="font-size:10px;color:var(--c-fg-3);">µg/m³</span></strong>
    </div>
    <div class="tooltip-row">
      <span>Hour</span>
      <strong>${String(currentHour).padStart(2, '0')}:00</strong>
    </div>
    <div class="tooltip-delta ${deltaClass}">${deltaText}</div>
  `;
}
