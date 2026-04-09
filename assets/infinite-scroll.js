/**
 * Infinite scroll for the collection product grid.
 * Watches #InfiniteScrollSentinel via IntersectionObserver, fetches the next
 * page's section HTML, appends product <li> items to #product-grid, and
 * updates the sentinel's data-next-url for the following page.
 *
 * Re-initialises automatically when facets.js replaces #ProductGridContainer
 * (filter / sort changes) via a MutationObserver.
 */
(function () {
  let observer = null;
  let loading = false;

  function init() {
    teardown();
    const sentinel = document.getElementById('InfiniteScrollSentinel');
    if (!sentinel) return;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !loading) loadNextPage();
        });
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
  }

  function teardown() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    loading = false;
  }

  function loadNextPage() {
    const sentinel = document.getElementById('InfiniteScrollSentinel');
    if (!sentinel) return;

    const nextUrl = sentinel.dataset.nextUrl;
    if (!nextUrl) return;

    loading = true;
    const spinner = sentinel.querySelector('.infinite-scroll-spinner');
    if (spinner) spinner.classList.remove('hidden');

    const sectionId = sentinel.dataset.sectionId;
    const separator = nextUrl.includes('?') ? '&' : '?';
    const fetchUrl = `${nextUrl}${separator}section_id=${sectionId}`;

    fetch(fetchUrl)
      .then((r) => r.text())
      .then((html) => {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const newItems = parsed.querySelectorAll('#product-grid > li');
        const grid = document.getElementById('product-grid');
        if (!grid || newItems.length === 0) {
          removeSentinel();
          return;
        }

        // Append new product cards
        newItems.forEach((li) => {
          // Cancel scroll-trigger animation so items appear immediately
          li.querySelectorAll('.scroll-trigger').forEach((el) =>
            el.classList.add('scroll-trigger--cancel')
          );
          grid.appendChild(li);
        });

        // Update sentinel with next page info from fetched HTML
        const newSentinel = parsed.getElementById('InfiniteScrollSentinel');
        if (newSentinel && newSentinel.dataset.nextUrl) {
          sentinel.dataset.nextUrl = newSentinel.dataset.nextUrl;
          sentinel.dataset.currentPage = newSentinel.dataset.currentPage;
        } else {
          // No more pages
          removeSentinel();
          return;
        }

        loading = false;
        if (spinner) spinner.classList.add('hidden');
      })
      .catch(() => {
        loading = false;
        if (spinner) spinner.classList.add('hidden');
      });
  }

  function removeSentinel() {
    teardown();
    const sentinel = document.getElementById('InfiniteScrollSentinel');
    if (sentinel) sentinel.remove();
  }

  // Re-init when facets.js replaces #ProductGridContainer (filter/sort change)
  const container = document.getElementById('ProductGridContainer');
  if (container) {
    new MutationObserver(() => init()).observe(container, { childList: true, subtree: false });
  }

  // Initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
