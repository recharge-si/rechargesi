/**
 * Page Transitions — seamless AJAX navigation
 *
 * Intercepts same-origin link clicks, fetches the new page,
 * and swaps only <main id="MainContent"> with a smooth animation.
 * Uses the View Transitions API where available, CSS fallback otherwise.
 */
(function () {
  'use strict';

  const MAIN_SELECTOR = '#MainContent';
  const TRANSITION_DURATION = 400; // ms — matches CSS animation total

  let isTransitioning = false;
  let progressBar = null;
  let currentAbortController = null;

  // ── Helpers ──────────────────────────────────────────────

  function shouldIntercept(anchor) {
    // Must be a same-origin, standard navigation link
    if (!anchor || !anchor.href) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.origin !== location.origin) return false;

    // Skip hash-only links on the same page
    const url = new URL(anchor.href);
    if (url.pathname === location.pathname && url.hash) return false;

    // Skip links that Shopify/apps need to handle natively
    if (anchor.closest('[data-no-transition]')) return false;
    if (anchor.closest('form')) return false;

    // Skip cart actions, checkout, account, admin
    const skip = ['/cart', '/checkout', '/account', '/admin', '/tools', '/apps'];
    if (skip.some((p) => url.pathname.startsWith(p))) return false;

    return true;
  }

  function getAnchor(event) {
    // Walk up from the click target to find the nearest <a>
    let el = event.target;
    while (el && el.tagName !== 'A') {
      el = el.parentElement;
    }
    return el;
  }

  // ── Progress bar ────────────────────────────────────────

  function showProgress() {
    hideProgress();
    progressBar = document.createElement('div');
    progressBar.className = 'pt-progress';
    progressBar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progressBar);
  }

  function hideProgress() {
    if (!progressBar) return;
    progressBar.classList.add('pt-progress--done');
    const bar = progressBar;
    setTimeout(() => bar.remove(), 300);
    progressBar = null;
  }

  // ── Content swap ────────────────────────────────────────

  function extractMain(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      main: doc.querySelector(MAIN_SELECTOR),
      title: doc.title,
      doc: doc,
    };
  }

  function reinitScripts(newMain) {
    // Re-register custom elements that were in the new content
    // by re-running inline <script> tags inside the new main
    const scripts = newMain.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      // Copy attributes
      Array.from(oldScript.attributes).forEach((attr) => {
        if (attr.name !== 'src') {
          newScript.setAttribute(attr.name, attr.value);
        }
      });
      oldScript.replaceWith(newScript);
    });
  }

  function updateActiveNav(url) {
    // Update header nav active states
    document.querySelectorAll('header a[aria-current]').forEach((a) => {
      a.removeAttribute('aria-current');
    });

    const pathname = new URL(url, location.origin).pathname;
    document.querySelectorAll('header a[href]').forEach((a) => {
      try {
        const linkPath = new URL(a.href, location.origin).pathname;
        if (linkPath === pathname) {
          a.setAttribute('aria-current', 'page');
        }
      } catch (e) {
        // skip malformed hrefs
      }
    });
  }

  async function performTransition(url, isPop) {
    if (isTransitioning) {
      // Abort the in-flight request
      if (currentAbortController) currentAbortController.abort();
    }

    isTransitioning = true;
    document.documentElement.classList.add('pt-transitioning');
    showProgress();

    // Close all mega menu dropdowns immediately
    document.querySelectorAll('header-menu').forEach((menu) => {
      menu.close();
      // Temporarily block hover from reopening during transition
      menu.style.pointerEvents = 'none';
    });

    currentAbortController = new AbortController();

    try {
      const response = await fetch(url, {
        signal: currentAbortController.signal,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });

      if (!response.ok) {
        // Fall back to normal navigation on error
        window.location = url;
        return;
      }

      const html = await response.text();
      const { main: newMain, title } = extractMain(html);

      if (!newMain) {
        // Page doesn't have a #MainContent — navigate normally
        window.location = url;
        return;
      }

      const currentMain = document.querySelector(MAIN_SELECTOR);

      // Use View Transitions API if available
      if (document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          currentMain.innerHTML = newMain.innerHTML;
          document.title = title;
          reinitScripts(currentMain);
        });

        await transition.finished;
      } else {
        // CSS fallback
        currentMain.classList.add('pt-exiting');
        await new Promise((r) => setTimeout(r, 300));

        currentMain.innerHTML = newMain.innerHTML;
        document.title = title;
        reinitScripts(currentMain);

        currentMain.classList.remove('pt-exiting');
        currentMain.classList.add('pt-entering');
        await new Promise((r) => setTimeout(r, 300));
        currentMain.classList.remove('pt-entering');
      }

      // Update URL (skip for popstate — browser already did it)
      if (!isPop) {
        history.pushState({ ptTransition: true }, title, url);
      }

      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Update nav active state
      updateActiveNav(url);

      // Dispatch a custom event so other scripts can react
      window.dispatchEvent(new CustomEvent('page:loaded', { detail: { url } }));

      // Re-trigger Shopify section rendering events
      if (window.Shopify && window.Shopify.designMode) {
        document.dispatchEvent(new CustomEvent('shopify:section:load'));
      }

      // Re-trigger scroll reveal animations if active
      if (typeof ScrollReveal !== 'undefined') {
        ScrollReveal().sync();
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Cancelled by newer navigation
      // On any fetch/parse error, fall back to normal navigation
      window.location = url;
      return;
    } finally {
      isTransitioning = false;
      document.documentElement.classList.remove('pt-transitioning');
      hideProgress();
      currentAbortController = null;

      // Re-enable mega menu hover after transition settles
      setTimeout(() => {
        document.querySelectorAll('header-menu').forEach((menu) => {
          menu.style.pointerEvents = '';
        });
      }, 100);
    }
  }

  // ── Event listeners ─────────────────────────────────────

  // Intercept link clicks
  document.addEventListener('click', (e) => {
    // Ignore modified clicks (new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const anchor = getAnchor(e);
    if (!shouldIntercept(anchor)) return;

    e.preventDefault();
    performTransition(anchor.href, false);
  });

  // Handle programmatic navigation (e.g. mega menu summary clicks)
  window.addEventListener('page:navigate', (e) => {
    const url = e.detail && e.detail.url;
    if (url) {
      performTransition(url, false);
    }
  });

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    // Always intercept popstate for smooth back navigation
    performTransition(location.href, true);
  });

  // Prefetch on hover for instant-feeling transitions
  let prefetchedUrls = new Set();

  document.addEventListener(
    'mouseover',
    (e) => {
      const anchor = getAnchor(e);
      if (!shouldIntercept(anchor)) return;
      if (prefetchedUrls.has(anchor.href)) return;

      prefetchedUrls.add(anchor.href);

      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = anchor.href;
      link.as = 'document';
      document.head.appendChild(link);
    },
    { passive: true }
  );

  // Clear prefetch cache periodically to avoid memory growth
  setInterval(() => {
    if (prefetchedUrls.size > 50) prefetchedUrls.clear();
  }, 60000);

  // Mark the initial page load in history state
  history.replaceState({ ptTransition: true }, document.title, location.href);
})();
