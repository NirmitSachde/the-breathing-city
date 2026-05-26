// =============================================================================
// SCROLL. Bridge between Scrollama events and the visualization.
// On mobile, the figure occupies the top portion of the viewport, so the
// scroll trigger needs to fire further down (below the figure).
// =============================================================================

function currentOffset() {
  if (window.matchMedia('(max-width: 767px)').matches) return 0.82;
  if (window.matchMedia('(max-width: 1023px)').matches) return 0.72;
  return 0.55;
}

export function initScroll({ onStep }) {
  const scroller = scrollama();

  scroller
    .setup({
      step: '.step',
      offset: currentOffset(),
      progress: false,
    })
    .onStepEnter(({ element, index }) => {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('is-active'));
      element.classList.add('is-active');

      const hour = parseInt(element.dataset.hour, 10) || 0;
      const mode = element.dataset.mode || 'map';
      onStep({ hour, mode, index });
    });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      scroller.offset(currentOffset());
      scroller.resize();
    }, 120);
  });
}
