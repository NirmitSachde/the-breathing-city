// =============================================================================
// Shared color logic. Kept in one place so the map, legend and rank panel
// always agree.
// =============================================================================

export const PALETTE = [
  '#0D3B3E', // 0  clean
  '#1A6E6B', // 1
  '#4FA08A', // 2
  '#C9D87C', // 3  moderate
  '#F2A93B', // 4  warm
  '#E66A2F', // 5
  '#E74C3C', // 6  hot
];

// PM2.5 stops in µg/m³ aligned with the 7 palette colors.
// Anchored to Cambridge's actual real-world range (2.5 to 12 µg/m³ covers
// every neighborhood-hour we see, with headroom for spike days). WHO 15 sits
// at the top of the scale as the reference threshold.
export const STOPS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.5, 12];

// Smooth interpolation across the stops
export const colorScale = d3
  .scaleLinear()
  .domain(STOPS)
  .range(PALETTE)
  .interpolate(d3.interpolateRgb.gamma(2.2))
  .clamp(true);

export function colorFor(pm25) {
  return colorScale(pm25);
}

// WHO 2021 air-quality guidelines:
//   annual mean PM2.5: 5  µg/m³
//   24-hour mean PM2.5: 15 µg/m³
// We compare typical-day medians to the annual guideline.
export const WHO_DAILY  = 15;   // kept for compatibility
export const WHO_ANNUAL = 5;
