/*
 * Reveals the fixed checkout bar only while the real CHECK OUT button is off
 * screen, so the two are never visible at once.
 *
 * This exists because the sticky summary panel cannot cover the whole page: a
 * sticky element's containing block is its column, so it necessarily releases
 * once its bottom reaches the column bottom and then drifts. The bar picks up
 * where the panel stops, and on mobile — where the summary sits below every line
 * item — it does the whole job.
 *
 * It also hides as soon as the real site footer starts entering the viewport.
 * Without that check the bar stays visible for the entire scroll through the
 * footer (the CHECK OUT button is long off screen by then) and sits fixed on
 * top of the footer's contact info for the rest of the page.
 *
 * A plain scroll check rather than IntersectionObserver, whose callback proved
 * unreliable in this theme. It is one rect read per animation frame on one page.
 * The button and footer are re-queried on every check, so this survives Dawn
 * re-rendering the section on quantity changes with no re-binding.
 */
(function () {
  function init() {
    var bar = document.querySelector('.cart__sticky-bar');
    if (!bar) return;

    var ticking = false;

    function update() {
      ticking = false;
      var target = document.querySelector('.cart__checkout-button');
      if (!target) {
        bar.classList.remove('is-visible');
        return;
      }
      // The bar lives outside the re-rendered .js-contents, so copy the total
      // from the freshly rendered summary rather than keeping the page-load value.
      var total = document.querySelector('.cart-summary__total-value');
      var barValue = bar.querySelector('.cart__sticky-bar-value');
      if (total && barValue && barValue.textContent !== total.textContent) {
        barValue.textContent = total.textContent;
      }

      var rect = target.getBoundingClientRect();
      var buttonVisible = rect.bottom > 0 && rect.top < window.innerHeight - 20;

      var footer = document.querySelector('.footer');
      var footerInView = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;

      bar.classList.toggle('is-visible', !buttonVisible && !footerInView);
    }

    function schedule() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('cart:refresh', schedule);
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, schedule);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
