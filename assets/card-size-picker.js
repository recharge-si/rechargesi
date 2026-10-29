/**
 * <card-size-picker> — "Choose size" on product cards.
 *
 * Opens a native <dialog> as a modal: the page behind is dimmed and inert,
 * focus stays inside, Escape closes (all browser-native). The size list and
 * product form inside are rendered in card-product.liquid; this script adds:
 *   - the hidden name="id" input follows the chosen size radio
 *     (product-form.js submits that input, not the radios),
 *   - the red button names the size it will add,
 *   - close on backdrop click, on the ✕, and after a successful add,
 *   - products with 2+ options (Size + Color…): chips per option are resolved
 *     against the variant list in .card-size-picker__data; price, stock state
 *     and the Add button follow, and values that can't lead to a buyable
 *     variant with the current picks are struck through.
 */
if (!customElements.get('card-size-picker')) {
  customElements.define(
    'card-size-picker',
    class CardSizePicker extends HTMLElement {
      connectedCallback() {
        this.opener = this.querySelector('.card-size-picker__open');
        this.dialog = this.querySelector('dialog');
        this.idInput = this.querySelector('input[name="id"]');
        this.chosen = this.querySelector('.card-size-picker__chosen');
        if (!this.opener || !this.dialog || !this.idInput) return;

        this.opener.addEventListener('click', () => this.open());
        this.querySelector('.card-size-picker__close')?.addEventListener('click', () => this.close());

        // A click on the dialog element itself (not its content) is the backdrop.
        this.dialog.addEventListener('click', (event) => {
          if (event.target === this.dialog) this.close();
        });

        this.dialog.addEventListener('close', () => {
          document.body.classList.remove('overflow-hidden');
          this.opener.focus({ preventScroll: true });
        });

        this.multi = this.querySelector('[data-multi]');
        if (this.multi) {
          try {
            this.variants = JSON.parse(this.querySelector('.card-size-picker__data').textContent);
          } catch (e) {
            this.variants = [];
          }
          this.addButton = this.querySelector('.card-size-picker__add');
          this.priceEl = this.querySelector('.card-size-picker__summary-price');
          this.stateEl = this.querySelector('.card-size-picker__summary-state');
          this.updateMulti();
        }

        this.addEventListener('change', (event) => {
          const radio = event.target;
          if (radio.type !== 'radio') return;
          if (this.multi) {
            this.updateMulti();
            return;
          }
          this.idInput.value = radio.value;
          if (this.chosen) this.chosen.textContent = radio.dataset.label || '';
        });

        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
            if (event.source === 'product-form' && this.dialog.open) this.close();
          });
        }
      }

      selectedOptions() {
        return [...this.multi.querySelectorAll('.card-size-picker__group')].map((group) => {
          const checked = group.querySelector('input:checked');
          return checked ? checked.value : null;
        });
      }

      updateMulti() {
        const picks = this.selectedOptions();
        const match = this.variants.find((v) => v.options.every((value, i) => value === picks[i]));

        // Strike through values that give no buyable variant with the other picks.
        this.multi.querySelectorAll('.card-size-picker__group').forEach((group, index) => {
          group.querySelectorAll('input').forEach((input) => {
            const trial = picks.slice();
            trial[index] = input.value;
            const ok = this.variants.some((v) => v.available && v.options.every((value, i) => value === trial[i]));
            input.closest('.card-size-picker__chip').classList.toggle('is-unavailable', !ok);
          });
          const checked = group.querySelector('input:checked');
          const legendValue = group.querySelector('.card-size-picker__legend-value');
          if (legendValue) legendValue.textContent = checked ? checked.dataset.label : '';
        });

        const labels = [...this.multi.querySelectorAll('input:checked')].map((i) => i.dataset.label);
        if (this.chosen) this.chosen.textContent = labels.join(' / ');

        if (match) {
          this.idInput.value = match.id;
          this.priceEl.textContent = match.price;
          this.stateEl.textContent = match.stateLabel;
          this.stateEl.className = `card-size-picker__state card-size-picker__summary-state card-size-picker__state--${match.state}`;
        } else {
          this.priceEl.textContent = '';
          this.stateEl.textContent = window.variantStrings ? window.variantStrings.unavailable : '';
          this.stateEl.className = 'card-size-picker__state card-size-picker__summary-state card-size-picker__state--none';
        }

        const buyable = Boolean(match && match.available);
        this.addButton.disabled = !buyable;
        this.addButton.toggleAttribute('aria-disabled', !buyable);
      }

      disconnectedCallback() {
        if (this.unsubscribe) this.unsubscribe();
      }

      open() {
        if (this.dialog.open) return;
        this.dialog.showModal();
        document.body.classList.add('overflow-hidden');
        const checked = this.dialog.querySelector('input[type="radio"]:checked');
        if (checked) checked.focus({ preventScroll: true });
      }

      close() {
        if (this.dialog.open) this.dialog.close();
      }
    }
  );
}
