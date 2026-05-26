// =============================================================================
// LINE CHART. Citywide PM2.5 across 24 hours.
// Full curve is always drawn; a clip mask sweeps right to mark "past so far",
// the dot smoothly tracks the current hour.
// =============================================================================

import { colorFor, WHO_ANNUAL } from './palette.js';

let svg, x, y, areaGen, lineGen;
let citywide24 = [];
let currentHour = 5;
const W = 800, H = 220;
const MARGIN = { top: 20, right: 26, bottom: 28, left: 38 };

export function initLineChart(data) {
  svg = d3.select('#lineChart');
  svg.selectAll('*').remove();

  citywide24 = data.hourly.map(hr => d3.mean(hr, d => d.pm25));

  x = d3.scaleLinear().domain([0, 23]).range([MARGIN.left, W - MARGIN.right]);
  const yMax = d3.max(citywide24) * 1.15;
  y = d3.scaleLinear().domain([0, yMax]).range([H - MARGIN.bottom, MARGIN.top]);

  const defs = svg.append('defs');

  // Past area gradient (warm)
  const gradPast = defs.append('linearGradient')
    .attr('id', 'chartAreaGrad')
    .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  gradPast.append('stop').attr('offset', '0%').attr('stop-color', '#F2A93B').attr('stop-opacity', 0.38);
  gradPast.append('stop').attr('offset', '100%').attr('stop-color', '#F2A93B').attr('stop-opacity', 0);

  // Future area gradient (muted)
  const gradFuture = defs.append('linearGradient')
    .attr('id', 'chartAreaGradFuture')
    .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  gradFuture.append('stop').attr('offset', '0%').attr('stop-color', '#4FA08A').attr('stop-opacity', 0.10);
  gradFuture.append('stop').attr('offset', '100%').attr('stop-color', '#4FA08A').attr('stop-opacity', 0);

  // Two horizontal clip rects: one expanding left-to-right (past), the other its complement (future)
  defs.append('clipPath').attr('id', 'clipPast')
    .append('rect').attr('id', 'clipPastRect')
    .attr('x', MARGIN.left).attr('y', 0)
    .attr('width', 0).attr('height', H);

  // Gridlines
  const yTicks = y.ticks(4);
  svg.append('g').attr('class', 'grid')
    .selectAll('line')
    .data(yTicks)
    .join('line')
    .attr('class', 'line-chart-grid')
    .attr('x1', MARGIN.left).attr('x2', W - MARGIN.right)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  // WHO annual guideline reference line (5 µg/m³)
  svg.append('line')
    .attr('x1', MARGIN.left).attr('x2', W - MARGIN.right)
    .attr('y1', y(WHO_ANNUAL)).attr('y2', y(WHO_ANNUAL))
    .attr('stroke', '#fff')
    .attr('stroke-dasharray', '3 3')
    .attr('stroke-width', 0.6)
    .attr('opacity', 0.55);
  svg.append('text')
    .attr('x', W - MARGIN.right)
    .attr('y', y(WHO_ANNUAL) - 4)
    .attr('text-anchor', 'end')
    .attr('class', 'line-chart-label')
    .attr('fill', 'rgba(255,255,255,0.6)')
    .text('WHO 5');

  // X axis ticks
  const xTicks = [0, 6, 12, 18, 23];
  svg.append('g')
    .selectAll('text')
    .data(xTicks)
    .join('text')
    .attr('class', 'line-chart-label')
    .attr('x', d => x(d))
    .attr('y', H - 8)
    .attr('text-anchor', 'middle')
    .text(d => `${String(d).padStart(2, '0')}:00`);

  // Y axis ticks
  svg.append('g')
    .selectAll('text')
    .data(yTicks)
    .join('text')
    .attr('class', 'line-chart-label')
    .attr('x', MARGIN.left - 6)
    .attr('y', d => y(d) + 3)
    .attr('text-anchor', 'end')
    .text(d => d);

  // Title
  svg.append('text')
    .attr('class', 'line-chart-label')
    .attr('x', MARGIN.left)
    .attr('y', 12)
    .attr('fill', 'rgba(255,255,255,0.7)')
    .text('CITYWIDE PM2.5 · 24h');

  areaGen = d3.area()
    .x((_, i) => x(i))
    .y0(y(0))
    .y1(d => y(d))
    .curve(d3.curveMonotoneX);

  lineGen = d3.line()
    .x((_, i) => x(i))
    .y(d => y(d))
    .curve(d3.curveMonotoneX);

  // Future area (full curve, dim teal)
  svg.append('path')
    .datum(citywide24)
    .attr('d', areaGen)
    .attr('fill', 'url(#chartAreaGradFuture)');

  // Future line (full curve, dim)
  svg.append('path')
    .datum(citywide24)
    .attr('class', 'chart-future-line')
    .attr('d', lineGen)
    .attr('fill', 'none')
    .attr('stroke', '#4FA08A')
    .attr('stroke-width', 1)
    .attr('opacity', 0.55);

  // Past area (full curve, warm, masked)
  svg.append('path')
    .datum(citywide24)
    .attr('d', areaGen)
    .attr('fill', 'url(#chartAreaGrad)')
    .attr('clip-path', 'url(#clipPast)');

  // Past line (full curve, accent, masked)
  svg.append('path')
    .datum(citywide24)
    .attr('class', 'chart-past-line')
    .attr('d', lineGen)
    .attr('fill', 'none')
    .attr('stroke', '#F2A93B')
    .attr('stroke-width', 1.8)
    .attr('clip-path', 'url(#clipPast)');

  // Tracking dot
  svg.append('circle')
    .attr('class', 'line-chart-dot chart-dot')
    .attr('r', 4)
    .attr('opacity', 0);
}

// Smoothly slide the "past" mask to the new hour.
export function drawLineUpTo(hour) {
  if (!svg) return;
  currentHour = hour;
  const targetX = x(hour);
  const newWidth = Math.max(0, targetX - MARGIN.left);

  svg.select('#clipPastRect')
    .transition()
    .duration(900)
    .ease(d3.easeCubicInOut)
    .attr('width', newWidth);

  const val = citywide24[hour];
  svg.select('.chart-dot')
    .transition()
    .duration(900)
    .ease(d3.easeCubicInOut)
    .attr('cx', targetX)
    .attr('cy', y(val))
    .attr('opacity', 1)
    .attr('fill', colorFor(val));
}

export function showLineChart() {
  const el = document.getElementById('chartOverlay');
  if (el) el.classList.add('show');
}
