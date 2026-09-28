/*
 * Mobile sticky Add-to-cart bar (product page).
 *
 * Visibility: same rAF scroll-check pattern as cart-sticky-bar.js — shown
 * while the real submit button is off screen, hidden once the footer enters
 * the viewport. Elements are re-queried on every check so Dawn re-rendering
 * the section never orphans a reference.
 *
 * Live state: the bar's price and button mirror the real ones through
 * MutationObservers rather than pubsub — product-info.js swaps the price
 * container's innerHTML and toggles the submit button in place, so observing
 * those two elements catches every variant change with zero ordering
 * assumptions. The observed elements themselves are never replaced (Dawn
 * swaps innerHTML, not the nodes), so the observers survive re-renders.
 */
(function () {
  function init() {
    var bar = document.querySelector('.sticky-atc');
    if (!bar) return;

    var sectionId = bar.dataset.section;
    var barButton = document.getElementById('StickyAtcButton-' + sectionId);
    var barPrice = document.getElementById('StickyAtcPrice-' + sectionId);
    var ticking = false;

    function mainButton() {
      return document.getElementById('ProductSubmitButton-' + sectionId);
    }

    function mainPrice() {
      return document.getElementById('price-' + sectionId);
    }

    // ── Visibility ─────────────────────────────────────────

    function update() {
      ticking = false;
      var target = mainButton();
      if (!target) {
        bar.classList.remove('is-visible');
        return;
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

    // ── Mirroring ──────────────────────────────────────────

    function syncButton() {
      var source = mainButton();
      if (!source || !barButton) return;
      barButton.disabled = source.disabled;
      var sourceLabel = source.querySelector('span');
      var barLabel = barButton.querySelector('span');
      if (sourceLabel && barLabel) barLabel.textContent = sourceLabel.textContent.trim();
    }

    function syncPrice() {
      var source = mainPrice();
      if (!source || !barPrice) return;
      barPrice.innerHTML = source.innerHTML;
    }

    var source = mainButton();
    if (source) {
      new MutationObserver(syncButton).observe(source, {
        attributes: true,
        attributeFilter: ['disabled', 'class'],
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    var priceSource = mainPrice();
    if (priceSource) {
      new MutationObserver(syncPrice).observe(priceSource, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    syncButton();
    syncPrice();
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
