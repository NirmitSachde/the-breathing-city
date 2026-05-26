// =============================================================================
// STATS. Computes the chapter-level numbers from the dataset and writes them
// into every <span data-stat="..."> placeholder in the prose. This is what
// keeps the narrative honest when the underlying PurpleAir data refreshes.
// =============================================================================

const WHO_ANNUAL = 5; // µg/m³

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pickPeak(rows) {
  return rows.reduce((a, b) => (a.pm25 > b.pm25 ? a : b));
}

function pickLow(rows) {
  return rows.reduce((a, b) => (a.pm25 < b.pm25 ? a : b));
}

// Fallback for older JSON files that recorded the window only in the
// source string (e.g. "...(90-day median profile)").
function extractDaysFromSource(s) {
  if (!s) return null;
  const m = s.match(/(\d+)\s*-?\s*day/i);
  return m ? Number(m[1]) : null;
}

export function computeStats(data) {
  const h = data.hourly;
  const stats = {};

  // Data-shape counts (everything in the prologue + hero subtitle reads from
  // these, so a fresh PurpleAir fetch with different sensor coverage updates
  // every visible number automatically).
  const sensors = data.meta.sensors;
  const neighborhoods = data.meta.neighborhoods;
  const hours = data.meta.hours;
  const days = data.meta.days ?? extractDaysFromSource(data.meta.source);

  stats['data.sensors']       = sensors;
  stats['data.neighborhoods'] = neighborhoods;
  stats['data.readings']      = neighborhoods * hours;
  stats['data.days']          = days;

  // Prologue: citywide 24h average.
  const allCity = h.map(hr => mean(hr.map(d => d.pm25)));
  stats['prologue.cityAvg'] = mean(allCity).toFixed(1);

  // Chapter 1 (05:00). Pre-dawn citywide median.
  stats['ch1.median'] = median(h[5].map(d => d.pm25)).toFixed(1);

  // Chapter 2 (09:00). Hottest neighborhood during the morning lift.
  const peak2 = pickPeak(h[9]);
  stats['ch2.peakName'] = peak2.name;
  stats['ch2.peak'] = peak2.pm25.toFixed(1);

  // Chapter 3 (12:00). Citywide mean + spread (range) showing how even it is.
  const noon = h[12].map(d => d.pm25);
  stats['ch3.avg'] = mean(noon).toFixed(1);
  stats['ch3.spread'] = (Math.max(...noon) - Math.min(...noon)).toFixed(1);

  // Chapter 4 (15:00). Afternoon mean + % drop from morning peak hour mean.
  const morningAvg = mean(h[9].map(d => d.pm25));
  const afternoonAvg = mean(h[15].map(d => d.pm25));
  stats['ch4.avg'] = afternoonAvg.toFixed(1);
  stats['ch4.dropPct'] = Math.max(0, Math.round((morningAvg - afternoonAvg) / morningAvg * 100));

  // Chapter 5 (20:00). Global minimum: the cleanest reading from the
  // cleanest neighborhood at the quietest hour, anywhere in the day.
  let globalMin = { name: '', pm25: Infinity, hour: 0 };
  h.forEach((hr, hi) => {
    hr.forEach(r => {
      if (r.pm25 < globalMin.pm25) globalMin = { name: r.name, pm25: r.pm25, hour: hi };
    });
  });
  stats['ch5.lowName'] = globalMin.name;
  stats['ch5.low'] = globalMin.pm25.toFixed(1);

  // Chapter 6 (23:00). Citywide mean as the curve climbs back.
  stats['ch6.avg'] = mean(h[23].map(d => d.pm25)).toFixed(1);

  // Chapter 7. Loop duration in seconds. 24 hours x 620ms per hour.
  stats['ch7.dur'] = Math.round(24 * 620 / 1000);

  return stats;
}

export function bindStats(data) {
  const stats = computeStats(data);

  // Plain text bindings: every <span data-stat="..."> in the prose.
  document.querySelectorAll('[data-stat]').forEach(el => {
    const key = el.dataset.stat;
    const v = stats[key];
    if (v != null) el.textContent = v;
  });

  // Prologue counters animate from 0 to their target. The targets live in
  // stats[`data.${key}`] so they refresh with every fetch.
  document.querySelectorAll('[data-counter-key]').forEach(el => {
    const k = el.dataset.counterKey;
    const target = stats[`data.${k}`];
    if (target != null) el.setAttribute('data-counter', String(target));
  });
}
