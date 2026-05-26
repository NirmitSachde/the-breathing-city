// =============================================================================
// THE BREATHING CITY entry point
// =============================================================================

import { initMap, renderHour, animateLoop, stopLoop } from './map.js';
import { initLineChart, drawLineUpTo, showLineChart } from './chart.js';
import { initScroll } from './scroll.js';
import { initHero, animateCounters, updateTimeReadout } from './ui.js';
import { bindStats } from './stats.js';

const DATA_URL  = 'data/air_quality_24h.json';
const GEO_URL   = 'data/cambridge_neighborhoods.geojson';

async function main() {
  initHero();

  const [data, geo] = await Promise.all([
    fetch(DATA_URL).then(r => r.json()),
    fetch(GEO_URL).then(r => r.json()),
  ]);

  initMap(geo, data);
  initLineChart(data);
  bindStats(data);                // populate narrative numbers from the data
  renderHour(5, data);
  updateTimeReadout(5);
  showLineChart();
  drawLineUpTo(5, data);

  requestAnimationFrame(() => {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
  });

  // Chart stays visible across every chapter; the dot tracks current hour
  // and the past-mask sweeps right.
  initScroll({
    onStep: ({ hour, mode }) => {
      updateTimeReadout(hour);
      if (mode === 'loop') {
        animateLoop(data, (h) => {
          updateTimeReadout(h);
          drawLineUpTo(h, data);
        });
      } else {
        renderHour(hour, data);
        drawLineUpTo(hour, data);
        stopLoop();
      }
    },
  });

  setupCounterObserver();
  setupScrollProgress();
  setupScrollyClass();
}

// Toggle body.in-scrolly while the scrolly section is on screen,
// so the topbar fades away and the time-readout has clear space.
function setupScrollyClass() {
  const scrolly = document.getElementById('scrolly');
  if (!scrolly) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      document.body.classList.toggle('in-scrolly', e.isIntersecting);
    });
  }, { threshold: 0 });
  io.observe(scrolly);
}

function setupCounterObserver() {
  const els = document.querySelectorAll('[data-counter]');
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounters(e.target);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  els.forEach(el => io.observe(el));
}

function setupScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const pct = Math.min(100, (window.scrollY / max) * 100);
        bar.style.width = `${pct}%`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

main().catch(err => {
  console.error('Boot failed:', err);
  const loader = document.getElementById('loader');
  if (loader) {
    loader.querySelector('.loader-label').textContent = 'Failed to load data. See console.';
  }
});
