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
        window.addEventListener('resize', debounce(this.syncThumbnailWidth, 200));
        requestAnimationFrame(this.syncThumbnailWidth);
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
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
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
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
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

      syncThumbnailWidth() {
        if (!this.mql.matches || !this.elements.thumbnails) return;
        const activeContainer = this.elements.viewer.querySelector('.is-active .product-media-container');
        if (!activeContainer) return;
        const width = activeContainer.getBoundingClientRect().width;
        if (width > 0) {
          this.elements.thumbnails.style.maxWidth = `${width}px`;
          this.elements.thumbnails.style.marginLeft = 'auto';
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
