/*
 * Reveals the scroll-to-top button after one viewport of scroll and hides it
 * again near the top. Same rAF scroll-check pattern as cart-sticky-bar.js —
 * one class toggle per animation frame, no IntersectionObserver (unreliable in
 * this theme, and its callbacks don't run in a hidden automation tab either).
 */
(function () {
  function init() {
    var button = document.querySelector('.scroll-top');
    if (!button) return;

    var ticking = false;

    function update() {
      ticking = false;
      button.classList.toggle('is-visible', window.scrollY > window.innerHeight);
    }

    function schedule() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    button.addEventListener('click', function () {
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
