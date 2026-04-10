class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach((animation) => animation.play());
    } else {
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
    this.summary = this.mainDetailsToggle.querySelector('summary');
    this._onDocumentClick = this.onDocumentClick.bind(this);
    this._closeTimeout = null;

    if (this.summary && this.summary.dataset.url) {
      // Click always navigates — hover handles open/close
      this.summary.addEventListener('click', this.onSummaryClick.bind(this));
    }

    // Hover-to-open on desktop
    this.addEventListener('mouseenter', this.onMouseEnter.bind(this));
    this.addEventListener('mouseleave', this.onMouseLeave.bind(this));
  }

  onSummaryClick(event) {
    event.preventDefault();
    // Always navigate on click — the menu opens on hover
    if (this.summary.dataset.url) {
      this.close();
      // Use page transitions if available, otherwise navigate normally
      window.dispatchEvent(
        new CustomEvent('page:navigate', { detail: { url: this.summary.dataset.url } })
      );
    }
  }

  onMouseEnter() {
    // Cancel any pending close
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }

    // Close other open menus first
    document.querySelectorAll('header-menu').forEach((menu) => {
      if (menu !== this && menu.mainDetailsToggle.hasAttribute('open')) {
        menu.close();
      }
    });

    if (!this.mainDetailsToggle.hasAttribute('open')) {
      this.mainDetailsToggle.setAttribute('open', '');
      this.onToggle();
      document.addEventListener('click', this._onDocumentClick);
    }
  }

  onMouseLeave() {
    // Small delay so the menu doesn't flicker when moving between items
    this._closeTimeout = setTimeout(() => {
      this.close();
    }, 150);
  }

  onDocumentClick(event) {
    if (!this.contains(event.target)) {
      this.close();
      document.removeEventListener('click', this._onDocumentClick);
    }
  }

  close() {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
    super.close();
    document.removeEventListener('click', this._onDocumentClick);
  }

  onToggle() {
    if (!this.header) return;
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    document.documentElement.style.setProperty(
      '--header-bottom-position-desktop',
      `${Math.floor(this.header.getBoundingClientRect().bottom)}px`
    );
  }
}

customElements.define('header-menu', HeaderMenu);
