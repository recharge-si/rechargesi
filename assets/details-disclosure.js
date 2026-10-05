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

// Matches the close transition in component-mega-menu.css (--dur-fast).
const MEGA_MENU_CLOSE_MS = 150;

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
    this.summary = this.mainDetailsToggle.querySelector('summary');
    this._onDocumentClick = this.onDocumentClick.bind(this);
    this._closeTimeout = null;
    this._finishCloseTimeout = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (this.summary && this.summary.dataset.url) {
      // A click (mouse, or Enter on the keyboard) goes to the sport's page;
      // the panel itself opens on hover, or from the keyboard (see onSummaryKeydown).
      this.summary.addEventListener('click', this.onSummaryClick.bind(this));
    }

    this.summary.setAttribute('aria-expanded', 'false');
    this.summary.addEventListener('keydown', this.onSummaryKeydown.bind(this));
    this.content.addEventListener('keydown', this.onPanelKeydown.bind(this));

    this.addEventListener('mouseenter', this.onMouseEnter.bind(this));
    this.addEventListener('mouseleave', this.onMouseLeave.bind(this));
  }

  get isOpen() {
    return this.mainDetailsToggle.hasAttribute('open') && !this.mainDetailsToggle.classList.contains('is-closing');
  }

  onSummaryClick(event) {
    event.preventDefault();
    if (this.summary.dataset.url) {
      this.close({ instant: true });
      window.location.assign(this.summary.dataset.url);
    }
  }

  // Enter follows the link (same as a click). Space or ArrowDown opens the
  // panel and moves into it, which is the only way a keyboard user could
  // reach the second and third levels before — hover was the only trigger.
  onSummaryKeydown(event) {
    if (event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.open();
      const firstLink = this.content.querySelector('a');
      if (firstLink) firstLink.focus();
    } else if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.close();
    }
  }

  onPanelKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close({ instant: true });
    this.summary.focus();
  }

  onMouseEnter() {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
    this.open();
  }

  onMouseLeave() {
    // Small delay so the menu doesn't flicker when moving between items
    this._closeTimeout = setTimeout(() => this.close(), 150);
  }

  open() {
    // Coming straight from another open panel: swap without re-animating.
    let switching = false;
    document.querySelectorAll('header-menu').forEach((menu) => {
      if (menu !== this && menu.mainDetailsToggle.hasAttribute('open')) {
        switching = true;
        menu.close({ instant: true });
      }
    });

    clearTimeout(this._finishCloseTimeout);
    this.mainDetailsToggle.classList.remove('is-closing');
    this.mainDetailsToggle.classList.toggle('is-instant', switching);

    if (!this.mainDetailsToggle.hasAttribute('open')) {
      this.mainDetailsToggle.setAttribute('open', '');
      this.onToggle();
      document.addEventListener('click', this._onDocumentClick);
    }
    this.summary.setAttribute('aria-expanded', 'true');
  }

  onDocumentClick(event) {
    if (!this.contains(event.target)) this.close();
  }

  // Keeps [open] for the length of the fade-out so the panel can animate
  // away instead of vanishing; `instant` skips that for menu-to-menu swaps.
  close({ instant = false } = {}) {
    clearTimeout(this._closeTimeout);
    this._closeTimeout = null;
    document.removeEventListener('click', this._onDocumentClick);
    this.summary.setAttribute('aria-expanded', 'false');

    const details = this.mainDetailsToggle;
    if (!details.hasAttribute('open')) return;

    if (instant || this.reducedMotion.matches) {
      clearTimeout(this._finishCloseTimeout);
      details.classList.remove('is-closing', 'is-instant');
      super.close();
      if (this.header) this.header.preventHide = false;
      return;
    }

    if (details.classList.contains('is-closing')) return;
    details.classList.remove('is-instant');
    details.classList.add('is-closing');
    this._finishCloseTimeout = setTimeout(() => {
      details.classList.remove('is-closing');
      super.close();
      if (this.header) this.header.preventHide = false;
    }, MEGA_MENU_CLOSE_MS);
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
