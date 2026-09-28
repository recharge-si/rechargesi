if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        if (!this.elements.thumbnails) return;

        this.elements.thumbnails.enableSliderLooping = false;
        this.initInfiniteScroll();

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
          mediaToSwitch
            .querySelector('button')
            .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
        });
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();

        this.syncThumbnailWidth = this.syncThumbnailWidth.bind(this);
      }

      /*
       * The constructor runs while the parser is still inside this element, so its
       * `querySelector` calls come back empty and it bails at the thumbnails check.
       * Sizing therefore has to be set up here, after the children exist.
       */
      connectedCallback() {
        if (this.layoutInitialized) return;
        this.layoutInitialized = true;

        this.syncThumbnailWidth = this.syncThumbnailWidth.bind(this);
        this.fitToViewport = this.fitToViewport.bind(this);
        this.refreshLayout = this.refreshLayout.bind(this);
        this.onWindowResize = debounce(this.refreshLayout, 200);
        window.addEventListener('resize', this.onWindowResize);

        const start = () => {
          this.elements.viewer = this.elements.viewer || this.querySelector('[id^="GalleryViewer"]');
          this.elements.thumbnails = this.elements.thumbnails || this.querySelector('[id^="GalleryThumbnails"]');
          requestAnimationFrame(this.refreshLayout);
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
          start();
        }

        // Web fonts change the height of the title above the gallery, which moves
        // the measurement this sizing depends on.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(this.refreshLayout);
      }

      /* Dawn replaces this element wholesale on variant change — drop the window
         listener with it so handlers don't pile up on detached galleries. */
      disconnectedCallback() {
        if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
        this.layoutInitialized = false;
      }

      refreshLayout() {
        this.fitToViewport();
        this.syncMediaColumnWidth();
        this.syncThumbnailWidth();
      }

      onSlideChanged(event) {
        const thumbnail = this.elements.thumbnails.querySelector(
          `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      setActiveMedia(mediaId, prepend) {
        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');

        if (prepend) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            if (activeThumbnail) {
              activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
            }
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        });
        this.playActiveMedia(activeMedia);
        requestAnimationFrame(this.syncThumbnailWidth);

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        if (activeThumbnail) {
          this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
        }
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      /* Linear thumbnail nav: scrolls one step at a time, stops at each end */
      initInfiniteScroll() {
        const thumbSlider = this.elements.thumbnails;
        if (!thumbSlider.prevButton || !thumbSlider.nextButton) return;

        // Clone buttons to remove bound click listeners from SliderComponent
        [thumbSlider.prevButton, thumbSlider.nextButton].forEach((oldBtn) => {
          const newBtn = oldBtn.cloneNode(true);
          oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        });
        thumbSlider.prevButton = thumbSlider.querySelector('button[name="previous"]');
        thumbSlider.nextButton = thumbSlider.querySelector('button[name="next"]');

        let scrolling = false;
        let atStart = true;
        let atEnd = false;

        const handleClick = (event) => {
          event.preventDefault();
          if (scrolling) return;

          const slider = thumbSlider.slider;
          const step = parseInt(event.currentTarget.dataset.step) || 1;
          const isNext = event.currentTarget.name === 'next';
          const maxScroll = slider.scrollWidth - slider.clientWidth;
          const itemOffset = thumbSlider.sliderItemOffset;

          if (maxScroll <= 2) return;
          if (isNext && atEnd) return;
          if (!isNext && atStart) return;

          let target;
          if (isNext) {
            target = Math.min(slider.scrollLeft + step * itemOffset, maxScroll);
          } else {
            target = Math.max(slider.scrollLeft - step * itemOffset, 0);
          }

          scrolling = true;
          slider.scrollTo({ left: target, behavior: 'smooth' });
          setTimeout(() => {
            scrolling = false;
            const ms = slider.scrollWidth - slider.clientWidth;
            atStart = slider.scrollLeft <= 2;
            atEnd = slider.scrollLeft >= ms - 2;
          }, 400);
        };

        thumbSlider.prevButton.addEventListener('click', handleClick);
        thumbSlider.nextButton.addEventListener('click', handleClick);
      }

      /*
       * The CSS constrain-height rule sizes the image from `100vh - var(--viewport-offset)`,
       * but a static offset can't know how much page sits above the gallery — that varies
       * with header height, breadcrumb depth, title length and browser zoom. Measure it
       * instead, and reserve THUMBNAIL_PEEK so the thumbnail strip is half-visible at the
       * fold: the image lands fully in view and the strip signals there is more to see.
       */
      fitToViewport() {
        const containers = this.querySelectorAll('.product-media-container.constrain-height');
        if (!containers.length) return;

        if (!this.mql.matches) {
          containers.forEach((container) => {
            container.style.removeProperty('--viewport-offset');
            container.style.removeProperty('--constrained-min-height');
          });
          return;
        }

        const THUMBNAIL_PEEK = 72;
        const galleryTop = Math.round(this.getBoundingClientRect().top + window.scrollY);
        const offset = galleryTop + THUMBNAIL_PEEK;

        /* The floor has to know about width, not just height. A short viewport
           (say 1700x740) leaves 100vh - offset around 360px, which the flat 400px
           floor caught — and a 400px square image then sat in a 460px column
           inside an 1100px grid, looking lost. The image should never be narrower
           than the column it already owns, so derive the floor from that column:
           the same gridWidth - MAX_INFO_WIDTH - padding that syncMediaColumnWidth
           uses as its own floor.

           On a tall viewport 100vh - offset wins and nothing changes; this only
           bites when the screen is short, where it deliberately trades some of
           the thumbnail peek for an image you can actually see. */
        const grid = this.closest('.product.grid');
        const infoWrapper = grid && grid.querySelector('.product__info-wrapper');
        let minHeight = 0;

        if (grid && infoWrapper) {
          const MAX_INFO_WIDTH = 600;
          const infoPadding = parseFloat(getComputedStyle(infoWrapper).paddingLeft) || 0;
          const fairWidth = grid.getBoundingClientRect().width - MAX_INFO_WIDTH - infoPadding;

          if (fairWidth > 0) {
            containers.forEach((container) => {
              const ratio = parseFloat(getComputedStyle(container).getPropertyValue('--aspect-ratio')) || 1;
              minHeight = Math.round(fairWidth / ratio);
              container.style.setProperty('--constrained-min-height', `${minHeight}px`);
            });
          }
        }

        containers.forEach((container) => container.style.setProperty('--viewport-offset', `${offset}px`));
      }

      /*
       * A height-capped image is narrower than its 58% column, which would leave a hole
       * between the image and the info panel. Shrink the column to the image and let the
       * info column take the freed width, so both stay anchored to the page edges.
       *
       * Floor: the media column never shrinks so far that the info column outgrows
       * MAX_INFO_WIDTH — a form much wider than that reads as stretched, and past the
       * floor the leftover goes back to the gutter.
       */
      syncMediaColumnWidth() {
        const grid = this.closest('.product.grid');
        if (!grid) return;

        grid.style.removeProperty('--media-column-width');
        if (!this.mql.matches) return;

        const active = this.querySelector('.is-active .product-media-container') ||
          this.querySelector('.product-media-container');
        const infoWrapper = grid.querySelector('.product__info-wrapper');
        if (!active || !infoWrapper) return;

        // Measured with the override cleared, so the image reports its natural width.
        const imageWidth = active.getBoundingClientRect().width;
        if (imageWidth <= 0) return;

        const MAX_INFO_WIDTH = 600;
        const gridWidth = grid.getBoundingClientRect().width;
        const infoPadding = parseFloat(getComputedStyle(infoWrapper).paddingLeft) || 0;
        const floor = gridWidth - MAX_INFO_WIDTH - infoPadding;

        grid.style.setProperty('--media-column-width', `${Math.round(Math.max(imageWidth, floor))}px`);
      }

      syncThumbnailWidth() {
        if (!this.mql.matches || !this.elements.thumbnails) return;
        const activeContainer = this.elements.viewer.querySelector('.is-active .product-media-container');
        if (!activeContainer) return;
        const width = activeContainer.getBoundingClientRect().width;
        if (width > 0) {
          this.elements.thumbnails.style.maxWidth = `${width}px`;
          this.elements.thumbnails.style.marginLeft = '0';
          this.elements.thumbnails.style.marginRight = 'auto';
        }
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}
