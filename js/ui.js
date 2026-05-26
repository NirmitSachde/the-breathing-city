// =============================================================================
// UI. Hero particles, counter animation, time-of-day readout.
// =============================================================================

const HOUR_LABELS = [
  'Pre-dawn',  'Pre-dawn',  'Pre-dawn',  'Pre-dawn',  'Pre-dawn',     //  0-4
  'Pre-dawn',  'Daybreak',  'Morning',   'Morning',   'Morning lift', //  5-9
  'Late morning','Late morning','Midday','Midday',    'Afternoon',    // 10-14
  'Afternoon drop','Afternoon drop','Evening','Evening','Evening low',// 15-19
  'Evening low','Late evening','Night',  'Late night',                // 20-23
];

export function initHero() {
  // Spawn floating particles in the hero
  const layer = document.getElementById('heroParticles');
  if (!layer) return;
  const COUNT = 22;
  for (let i = 0; i < COUNT; i++) {
    const s = document.createElement('span');
    const size = 1 + Math.random() * 3;
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.left = `${Math.random() * 100}%`;
    s.style.bottom = `${-10 - Math.random() * 30}%`;
    s.style.animationDuration = `${10 + Math.random() * 18}s`;
    s.style.animationDelay = `${-Math.random() * 18}s`;
    s.style.opacity = String(0.3 + Math.random() * 0.5);
    // alternate colors
    if (Math.random() < 0.3) s.style.background = '#4FA08A';
    else if (Math.random() < 0.5) s.style.background = '#E74C3C';
    layer.appendChild(s);
  }
}

export function animateCounters(container) {
  const els = container.matches('[data-counter]')
    ? [container]
    : container.querySelectorAll('[data-counter]');

  els.forEach(el => {
    const target = parseInt(el.dataset.counter, 10);
    const suffix = el.dataset.suffix || '';
    const dur = 1400;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(target * eased);
      el.textContent = v + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    };
    requestAnimationFrame(tick);
  });
}

export function updateTimeReadout(hour) {
  const nowEl = document.getElementById('timeNow');
  const labEl = document.getElementById('timeLabel');
  const arc   = document.getElementById('timeArcFill');
  if (nowEl) nowEl.textContent = `${String(hour).padStart(2, '0')}:00`;
  if (labEl) labEl.textContent = HOUR_LABELS[hour] || '';

  if (arc) {
    // Full circumference for r=46 is 2*PI*46 ≈ 289.03
    const C = 289.03;
    const frac = hour / 23;
    arc.style.strokeDashoffset = String(C * (1 - frac));
    // Hue follows the day's actual PM2.5 shape: warmer at the morning crest
    // (around 9am), cooler during the afternoon dip and evening low.
    const isCrest = hour >= 7 && hour <= 11;
    const isLow   = hour >= 16 && hour <= 20;
    arc.style.stroke = isCrest ? '#E74C3C' : (isLow ? '#4FA08A' : '#F2A93B');
  }
}
