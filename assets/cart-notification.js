class CartNotification extends HTMLElement {
  constructor() {
    super();

    this.notification = document.getElementById('cart-notification');
    this.header = document.querySelector('sticky-header');
    this.onBodyClick = this.handleBodyClick.bind(this);

    this.notification.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelectorAll('button[type="button"]').forEach((closeButton) =>
      closeButton.addEventListener('click', this.close.bind(this))
    );
  }

  open() {
    const wasOpen = this.notification.classList.contains('active');
    this.notification.classList.add('animate', 'active');

    // Focus once the panel has settled. A second add while it is already open
    // (or reduced motion) runs no transition, so transitionend never comes —
    // the timer covers that, and whichever fires first wins.
    clearTimeout(this.focusTimer);
    const focusPanel = () => {
      clearTimeout(this.focusTimer);
      this.notification.removeEventListener('transitionend', focusPanel);
      this.notification.focus();
      trapFocus(this.notification);
    };
    if (wasOpen) {
      focusPanel();
    } else {
      this.notification.addEventListener('transitionend', focusPanel, { once: true });
      this.focusTimer = setTimeout(focusPanel, 400);
    }

    document.body.addEventListener('click', this.onBodyClick);
  }

  close() {
    clearTimeout(this.focusTimer);
    this.notification.classList.remove('active');
    document.body.removeEventListener('click', this.onBodyClick);

    removeTrapFocus(this.activeElement);
  }

  renderContents(parsedState) {
    this.cartItemKey = parsedState.key;
    this.getSectionsToRender().forEach((section) => {
      document.getElementById(section.id).innerHTML = this.getSectionInnerHTML(
        parsedState.sections[section.id],
        section.selector
      );
    });

    if (this.header) this.header.reveal();
    this.open();
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-notification-product',
        selector: `[id="cart-notification-product-${this.cartItemKey}"]`,
      },
      {
        id: 'cart-notification-button',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  handleBodyClick(evt) {
    const target = evt.target;
    // contains(), not closest('cart-notification'): the mobile backdrop is the
    // wrapper's ::before, inside <cart-notification> but outside the panel.
    if (!this.notification.contains(target)) {
      const disclosure = target.closest('details-disclosure, header-menu');
      this.activeElement = disclosure ? disclosure.querySelector('summary') : null;
      this.close();
    }
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-notification', CartNotification);
