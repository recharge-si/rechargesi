# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A customized Shopify Dawn theme (v15.4.1) called "rechargesi". This is a **pure Liquid/JS/CSS** Shopify theme — no npm, no build step, no bundlers.

## Development Commands

Requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
shopify theme dev                          # Serve locally against a dev store
shopify theme push                         # Deploy to connected store
shopify theme pull                         # Pull latest settings from store
shopify theme check                        # Lint Liquid files
```

There are no tests, no linting config files, and no build process.

## Architecture

### File Organization

| Directory | Purpose |
|-----------|---------|
| `layout/` | Master page shells (`theme.liquid`, `password.liquid`) |
| `templates/` | JSON templates defining which sections appear per page type |
| `sections/` | Configurable content blocks (added/reordered in Shopify Admin) |
| `snippets/` | Reusable Liquid partials (rendered via `{% render %}`) |
| `assets/` | JS, CSS, SVG — referenced via `{{ 'file.css' \| asset_url }}` |
| `config/` | `settings_schema.json` (theme customization options) + `settings_data.json` (active values) |
| `locales/` | i18n translation files (22+ languages) |

### JavaScript Architecture

No frameworks — vanilla JS with custom web components. Key files in `assets/`:

- **`pubsub.js`** — Event pub/sub system used for cross-component communication (subscribe/publish pattern)
- **`global.js`** — Core utilities: `SectionId`, `HTMLUpdateUtility` (handles view transitions when re-rendering sections)
- **`constants.js`** — Shared event name constants and debounce timers

Feature modules follow the same pattern: extend `HTMLElement` as custom elements, communicate via pubsub events. Key modules: `product-info.js`, `cart.js`, `facets.js`, `quick-add.js`.

### CSS Architecture

CSS is split by concern and loaded selectively:
- `base.css` — Global base styles
- `component-*.css` — UI component styles (card, cart-drawer, etc.)
- `section-*.css` — Section-specific styles

### Template → Section System

Templates (`templates/*.json`) declare which sections appear and in what order. Sections (`sections/*.liquid`) are self-contained with their own schema blocks defining Shopify Admin customization options.

### Settings

`config/settings_schema.json` defines all theme-level customization options (colors, typography, layout). `config/settings_data.json` stores the active values — **do not manually edit** this file; it's managed by Shopify Admin.

## Customizations

### Brand Colors

Defined in `assets/base.css` `:root` block �� always use these variables, never hardcode hex values:

```css
--color-brand-primary: #bd1218;        /* brand red */
--color-brand-primary-dark: #a00f14;   /* hover state */
--color-brand-primary-darker: #8f0d12; /* active/pressed state */
--color-success: #1a7a3c;             /* success green */
--color-urgency: #b45309;             /* urgency/low-stock amber */
--color-info: #1257a3;                /* neutral informational blue */
```

`--color-info` exists because amber was wrong for "on order" stock. Nothing is *wrong* with a board that ships from a supplier, but orange says warning, and next to the brand red it made the whole page look like it had a problem. Blue is the state that reads as information rather than alarm. Amber stays for genuine urgency.

### Navbar / Mega Menu

- **Menu type** must be set to `mega` in Shopify Admin → Header section settings.
- **Header layout** is `middle-left` with nav on its own full-width row below the logo (two-row grid — logo+icons top, nav bottom).
- **Nav items** are uppercase with letter-spacing; bottom border is `3px solid var(--color-brand-primary)`.
- **Hover behavior**: mega menu opens on mouse hover (not click); clicking a top-level item navigates to its collection URL.
- **Open state**: active top-nav item gets a red background (`var(--color-brand-primary)`) with white text.
- **Dropdown**: full-width panel with `3px solid var(--color-brand-primary)` top border, 4-column `CSS columns` layout (not grid — avoids cross-column row alignment).

Key files:
- `assets/component-mega-menu.css` — all mega menu styles
- `assets/details-disclosure.js` — `HeaderMenu` class handles hover open + click-navigate
- `snippets/header-mega-menu.liquid` — summary has `data-url="{{ link.url }}"` for click navigation

### Header Search Bar (desktop)

The search input is **always visible** in the header's top row — logo left, search bar filling the middle, icons right — not hidden behind a search icon. Requested explicitly: the icon-triggered modal made searching an extra click, and the `header--middle-left` grid already had unused width there (the logo's own grid column is far wider than the logo itself, since the logo is left-aligned, not stretched, and the icon cluster is pinned to the row's end via `justify-self: end`).

**Desktop only.** `.header__search-bar` is hidden under `max-width: 989px` and the original icon + full-screen predictive-search modal (`snippets/header-search.liquid`) takes over there — there's no width to spare for a permanent input on a narrow screen, and a full-screen overlay is easier to type into with a thumb.

**It's the same `<predictive-search>` component, just unwrapped.** `snippets/header-search-bar.liquid` reuses the identical form markup as `header-search.liquid` (same `predictive-search`/`search-form` custom element, same `.field`/`.predictive-search` structure) but skips the `details-modal`/`<details>`/overlay wrapper entirely — `predictive-search.js` and `search-form.js` don't depend on that wrapper (they query only within themselves), and `.header predictive-search { position: relative }` already exists in `component-predictive-search.css`, so the results dropdown positions itself below the bar with no new CSS needed. Verified: typing shows the same suggestions/products dropdown as the old modal did.

**The grid change is scoped with `:has(.header__search-bar)`**, not applied to `.header--middle-left` unconditionally — this store only uses `middle-left`, but scoping it keeps the override inert if another logo position is ever selected without the search bar snippet rendered alongside it. Grid goes from `'heading icons'` / `1fr auto` to `'heading search icons'` / `auto minmax(0, 1fr) auto`, with the bar `justify-self: center` and capped at `48rem` so it doesn't stretch edge to edge on very wide screens.

**The old icon+modal search is still rendered in the DOM at every width, not conditionally excluded** — it's just hidden with `display: none` at 990px+ once the persistent bar is present (`.header--middle-left:has(.header__search-bar) > .header__icons > .header__search`). Simpler than branching the `render 'header-search'` call in `header.liquid`, and means the mobile markup needs no separate maintenance. The two inputs have distinct ids (`Search-In-Bar` vs `Search-In-Modal`) so there's never a duplicate-id conflict even though both exist in the DOM simultaneously.

**The field is a quiet underline, not the site's standard boxed input.** First pass reused `.field` as-is — full border, drop shadow, floating label — and it read as a loud empty rectangle sitting permanently between the logo and icons ("too much noise," called out explicitly). That chrome is right for a form or a modal, where it appears briefly and needs to look like the important control; wrong for something visible on every page load forever. `.header__search-bar` overrides just the visual layer: `.field:before` (the drop shadow) is removed, `.field:after` (the border) becomes a 1px `border-bottom` at low opacity instead of a full box-shadow ring, and it goes brand-red only while focused (`.field:focus-within:after`).

**Dawn's own `.field:hover.field::after` rule (full box-shadow ring on hover) kept winning back the "loud rectangle" look** the first cut of this was supposed to remove — hovering, or focusing while the cursor happened to still be over the field, brought the box-shadow back because it was never explicitly reset in those states, only at rest. Every state (`:hover`, `:focus-within`) now resets `box-shadow: none` itself rather than assuming the cascade drops it, and hover is gated with `:not(:focus-within)` so the two states can never contend over which border colour applies — the `:has(.field__input:focus)` version of the focus rule this replaced had the same problem from the opposite direction, occasionally losing to the hover rule on a specificity tie depending on real cursor position.

**No floating label.** Dawn's label-above-the-text pattern reserves `padding-top: 2.2rem` on the input once it has a value, sized for the standard 4.5rem-tall boxed field — in this shorter 4rem borderless bar that reserved space just read as a stray gap between "Search" and whatever was typed ("this space is too much"). The label is `visually-hidden` in the markup (screen readers still get it); the native placeholder shows the same word instead (`.field__input::placeholder` opacity restored to 1, overriding the sitewide `opacity: 0` that normally defers to the floating label), and the input uses one flat vertical-centring rule in every state instead of the shrink/grow choreography.

Key files:
- `snippets/header-search-bar.liquid` — the persistent bar's markup
- `assets/component-header-search-bar.css` — grid override + bar sizing
- `sections/header.liquid` — renders the bar between the logo and `.header__icons`, only when `section.settings.logo_position == 'middle-left'`

### Product Page / Gallery

**Active settings** (`templates/product.json`):
- `gallery_layout: "thumbnail_slider"` — single main image + thumbnail strip below
- `media_fit: "contain"` — shows full image without cropping
- `constrain_to_viewport: true` — limits image height to `100vh - 300px` (desktop)
- `media_size: "large"` — media column is 65% width on desktop

**How `constrain_to_viewport` + `media_fit: contain` interact:**
`.product-media-container.constrain-height.media-fit-contain` in `assets/section-main-product.css` computes:
```css
--constrained-height: max(400px, calc(100vh - var(--viewport-offset)));
--contained-width: calc(var(--constrained-height) * var(--aspect-ratio));
width: min(var(--contained-width), 100%);
```
This makes **portrait images narrower than the full container**. The `--aspect-ratio` comes from the inline style `--preview-ratio` set in `snippets/product-thumbnail.liquid`.

**Fitting the image to the fold — `--viewport-offset` is measured, not guessed.**
A static offset can't work: the page above the gallery (header 155px + section padding + breadcrumb + vendor/title block) is ~305px and moves with header height, breadcrumb depth, title length, font loading and browser zoom. `fitToViewport()` in `assets/media-gallery.js` measures the gallery's document top and writes `--viewport-offset: {galleryTop + 72}px` inline on each `.product-media-container.constrain-height`. The 72px is a deliberate reserve so the **thumbnail strip stays half-visible at the fold** — the image lands fully in view and the peeking strip signals there is more below. The CSS value (380px, desktop) is only the no-JS fallback. On mobile the inline value is removed; the `max-width: 749px` rules in `product-page-enhancements.css` take over with natural aspect ratio.

**The height floor knows about width.** `--constrained-min-height` used to be a flat 400px, which is what made the image "too small on some screens": at 1700×740 the available height is `100vh - 377 = 360`, the flat floor caught it, and a 400px square image sat in a 460px column inside an 1100px grid, looking lost. `fitToViewport()` now also writes `--constrained-min-height = fairWidth / aspectRatio`, where `fairWidth` is the same `gridWidth - 600 - infoPadding` that `syncMediaColumnWidth()` uses as its own floor — so **the image is never narrower than the column it already owns.**

Measured, both directions: at a 737px viewport the floor wins and the image is 460px, exactly filling column and thumbnail strip (was 400px in a 460px column). With the offset dropped to emulate a tall viewport, the height cap wins at 634px and the floor goes inert. **Tall viewports are unaffected** — `max()` picks the height cap whenever there is room.

The trade is deliberate: on a short screen the image now extends a little past the fold, spending some of the 72px thumbnail peek on an image you can actually see.

**The media column shrinks to the image; the info column absorbs the slack.** A height-capped image is narrower than its 58% column — at a 890px viewport a 513px image leaves 125px — which would otherwise open a hole between the image and the price panel. `syncMediaColumnWidth()` writes `--media-column-width` on `.product.grid`, and `product-page-enhancements.css` feeds it to the media wrapper while the info wrapper takes the rest. Image stays flush left with the title, info panel stays flush right with the page edge, gutter is a constant 40px.

Verified across viewport heights (1100 / 890 / 760 / 650px): gutter 40px until the floor kicks in, both edges anchored at every height.

Three things this depends on, all of which broke a draft:
- **`flex: 1 1 0` on the info wrapper, never `auto`.** `.grid` is `flex-wrap: wrap`; with an auto basis the info column demands its max-content width and drops onto its own line below the image. This is what a zoomed-out window shows first.
- **A floor on the media column** — `gridWidth - 600 - infoPadding`. Without it a short viewport shrinks the image to the 400px minimum and stretches the form past 600px. Past the floor the leftover goes back to the gutter, which is the lesser evil.
- **Dawn's 44rem caps on `.product-form__input`, `.product-form__buttons` and `.recipient-form` are overridden to 100%.** Left alone, the pills and buttons stop short while the price rule spans the widened column, leaving the right edge ragged.

Centring the image instead (`margin-inline: auto`) was tried and rejected — it halves the gap but breaks the image's alignment with the title's red bar.

**`MediaGallery` initialises in `connectedCallback`, not the constructor.** The constructor's `querySelector` calls can return null (it runs while the parser is still inside the element) and it bails at the thumbnails check; on top of that Dawn re-renders the gallery on load, wiping any inline styles the constructor set. Layout setup therefore lives in `connectedCallback`, gated on `document.readyState`, with a `document.fonts.ready` re-run (web fonts change the title height above the gallery) and a `disconnectedCallback` that drops the window resize listener. **Do not move this back into the constructor** — it silently does nothing.

**Thumbnail strip width sync:** `syncThumbnailWidth()` measures the active `.product-media-container` and sets it as `max-width` on the thumbnail slider, so the strip matches the image edges rather than the column. `refreshLayout()` runs the three in order — `fitToViewport()` (sets the height cap) → `syncMediaColumnWidth()` (column follows the resulting width) → `syncThumbnailWidth()`. Each clears its own override before measuring, so resize recomputes from scratch rather than compounding.

**Thumbnail strip CSS** (`assets/section-main-product.css`, desktop block ~line 1040):
- Brand-red prev/next buttons flanking the strip, `3.6rem` wide, with infinite-loop nav in `media-gallery.js`. **These are the only gallery arrows.** A second red pair used to be overlaid on the main image; it was removed because it could never work at every width — Dawn's `.slider:not(.slider--everywhere):not(.slider--desktop) + .slider-buttons` (`component-slider.css`, min-width 990px) scores 0,4,0 against the overlay's 0,3,1, so the arrows appeared only in the 750–989px band and vanished above it. Don't re-add an overlay without out-specifying that rule.
- `product-media-gallery.liquid` renders the main gallery's `.slider-buttons` only when `media_count > 1` — the same gate the thumbnail strip uses. Stock Dawn always emits them and relies on CSS to hide them, which is what put dead arrows on single-image products. `SliderComponent` bails on a missing next button, so omitting them is safe.
- Thumbnail items are `flex: 0 0 25%` — four per view
- Horizontal padding zeroed out so thumbnails align flush with image edges

**Header trimmed to buy back fold space** (`assets/product-page-enhancements.css` + `templates/product.json`): section `padding_top` 36→16, breadcrumb `padding-bottom` 1.6→1rem, `.product-page-header` margin 2→1.2rem, `.product__title` padding-bottom 1.6→0.8rem and its red bar margin 1.2→0.9rem. Together ~45px, which goes straight into image height.

Key files:
- `assets/section-main-product.css` — all product layout + constrain-height rules
- `assets/media-gallery.js` — `MediaGallery`; `connectedCallback`, `refreshLayout`, `fitToViewport`, `syncThumbnailWidth` are all ours
- `snippets/product-media-gallery.liquid` — gallery HTML structure
- `snippets/product-thumbnail.liquid` — sets `--ratio`/`--preview-ratio` inline styles on each media container

### Variant Pills (Size Buttons)

`.variant-pills-grid` sizes its columns from the **longest option value**, so labels never wrap mid-word (`5'11 - 90L` used to break across two lines). `snippets/product-variant-picker.liquid` measures the longest value in Liquid and writes `--pill-min: {chars × 0.75 + 1.8}rem`; the CSS is `repeat(auto-fit, minmax(min(100%, var(--pill-min)), 1fr))`, so columns stay equal width and the count adapts to whatever fits. Labels are `white-space: nowrap`.

The 0.75rem/char coefficient was calibrated against real values measured in the browser at the pill's `bold 14px Assistant` — uppercase SKU-style codes (`P13230002004`) run ~0.73rem/char and are the worst case. Verified: 4×`6'7 - 130L` → 4 columns, 4×`2.0 transparent` → 3 columns, 6×`P1323…` → 3 columns, all single-line. **This replaced a per-item `grid-column: span N` char-count heuristic** whose >10-char threshold missed exactly the 10-char size labels that prompted the fix.

**The measurement runs on the displayed label, not the stored value** — see below; an encoded `%e2%88%85-1114-mm` is 18 characters but renders as 9, and measuring the raw string blew the pills up to double width.

### Buy Row (Quantity + Add to Cart)

The stepper and Add to cart share one row. `main-product.liquid` opens `<div class="product-form__actions">` in the `quantity_selector` case **only when `section.blocks[forloop.index].type == 'buy_buttons'`**, and closes it in the `buy_buttons` case after checking the previous block. Reorder the blocks in the editor and the pairing simply doesn't happen — both render as stock Dawn. Theme check flags the open and close as `UnclosedHTMLElement` because it can't see them balance across loop iterations; both are suppressed inline.

**`display: contents` on the buy-buttons wrapper is what makes this work.** It promotes that block's children — `product-form`, the trust strip, `pickup-availability` — into the grid, so only the form sits beside the stepper and everything after it still spans full width. Without it the entire buy-buttons column indents past the stepper.

Two measured details: Dawn puts `margin-top: 2.5rem` on `product-form`, which pushed Add to cart 25px below the stepper until it was zeroed; and both boxes are pinned to `min-height: 5.6rem` so they read as one control pair. The visible `QUANTITY` label is hidden in this layout — with it, Add to cart aligned to the label's top and the stepper hung below the button. The visually-hidden `#quantity-label-*` span still names the control and still carries the "(N in cart)" count. Below 750px the grid collapses to one column and the label comes back.

**Dynamic checkout is off** (`show_dynamic_checkout: false` in `templates/product.json`). Add to cart is the single primary action; the "or / Buy with Shop / More payment options" stack was three competing CTAs before the decision the customer actually came to make. Note the trade — Shop Pay express checkout does convert for returning Shop Pay users, particularly on mobile and on cheap accessories. Re-enable in the theme editor if that turns out to matter more than the cleaner column.

### Product Breadcrumbs

`Home / Wing / Boards / Product` — every category segment clickable. The path is derived by walking the navigation menu three levels deep and matching each link against the collections the product belongs to (`product.collections` flattened into a pipe-delimited string so `contains` can test it). Deepest match wins.

**The menu handle is the whole trick, and it silently fails.** This store's header menu is **`recharge-menu`**; `main-menu` also exists but holds three stray links (`/`, `/blogs/prepih`, `/collections/all`), none of which are category collections. The breadcrumb was looking up `main-menu`, matched nothing, and every product rendered a bare `Home / Product Title` with no error anywhere.

Two traps that made this take longer than it should have:
- **Test `unless menu.links.size > 0`, never `if ... == 0`.** A missing handle returns nil, `nil.links.size` is nil, and `nil == 0` is **false** — so an equality-based fallback chain never fires.
- **Don't default the setting to `main-menu`.** It exists here, so it satisfies any "does this menu have links" check and wins over the real nav. The `breadcrumb_menu` theme setting is deliberately left with **no default**, so the fallback chain reaches `recharge-menu`.

Resolution order: `settings.breadcrumb_menu` → `recharge-menu` → `main-menu`. Setting lives in `settings_schema.json` → "Breadcrumbs".

### Cart Item Rows

Rows were ~200px tall for a 110px thumbnail: `.cart-items td` carried `padding-top: 4rem` and `.cart-item > td` another `padding-bottom: 4rem`, so **8rem of every row was empty padding**. Both halved to `2rem`, the thumbnail capped at `8rem`, and `.cart-item__details` tightened (1.5rem, tighter line-height, 0.4rem between lines). Cells are `vertical-align: middle` rather than `top`, so price and stepper sit on the product's axis instead of floating at the top of a tall cell.

Result: **130px rows instead of 199px** — three line items now occupy the space two used to.

**SKU shows under the product name**, `SKU: {value}`, using `item.sku` (Shopify's line-item shortcut for `item.variant.sku` — no need to reach through `.variant`) and the same `products.product.sku_label` locale key `snippets/product-barcode-token.liquid` uses on the product page. Explicitly requested for the **cart**, not the product page or collection cards — a version of this was first added to collection-grid cards (`snippets/card-product.liquid`) and reverted once that turned out to be the wrong surface. Hidden entirely when a line item has no SKU, same convention as the rest of the cart's optional rows. Present in all three cart surfaces that render a line item's details: the cart page (`sections/main-cart-items.liquid`), the drawer (`snippets/cart-drawer.liquid`, inert while `cart_type` is `notification`), and the "item added" toast (`sections/cart-notification-product.liquid`) — verified live in the toast, which is the surface this store's `cart_type` setting actually uses.

### Cart Layout history (superseded)

**Superseded — the cart is two-column again on 990px+; see Cart Page → Layout.** Kept for the grid/sticky lessons below.

The cart is one centred column on every viewport: items, then order summary below, same shape on mobile and desktop. **A two-column grid — items left, order summary sticking alongside on the right — was built, fixed, and then reverted.** It worked technically (`position: sticky` correctly followed scroll and released at the column bottom, properly aligned to the breadcrumb), but a small ~440px bordered card sitting mostly alone in a tall, mostly-empty column read as a floating, disconnected object — "like a fly on the screen" — rather than part of the page, even though nothing about it was actually broken. The fix for a bad *feeling*, not a bad mechanism, was to stop trying to make the card feel anchored and remove the thing that had to be anchored: the sidebar itself.

The grid attempt is worth remembering if a sidebar summary comes back (e.g. with a filled-background column, which was the alternative considered): `main-cart-items` and `main-cart-footer` are **separate sections**, so a shared-parent grid has to live on `#MainContent`, reached from a section only via `:has()`. Getting the sticky panel to actually travel needed `align-items: stretch` on the grid (a start-aligned item is only as tall as its content, so a sticky child has no travel — measured: `top` resolved to 175px and the rect still went to −123 on scroll) and `height: 100%` on every ancestor between the grid item and the sticky element (wrapper → `#main-cart-footer` → `.page-width` → `.cart__footer` — the colour-scheme div in the middle is easy to miss). `main-cart-items` still carries `"class": "cart__items-wrapper"` in its schema from that pass; harmless now, nothing in CSS reads it.

What ships instead: `.cart__footer` is a plain centred flex column (`assets/component-cart.css`, `min-width: 750px` block), same treatment at every width, no border, no card, no grid. The fixed bottom bar (below) is now the **sole** mechanism for keeping checkout reachable while scrolling, on every viewport rather than mobile-only — it already re-queried the CHECK OUT button on every scroll frame regardless of layout, so covering desktop needed no JS changes, only removing the CSS that made the summary a sidebar.

### Cart Sticky Checkout Bar

**Now below 990px only** — on desktop the sticky summary panel keeps checkout in view (see Cart Page). The history below predates that.

`.cart__sticky-bar` in `main-cart-footer.liquid` + `assets/cart-sticky-bar.js` — fixed on **every** viewport, revealed only while the real CHECK OUT button is off screen so the two are never visible at once. Now that the layout is a single stacked column everywhere, this bar does the whole job of keeping checkout reachable on every viewport, not just mobile.

**The bar itself is full width, edge to edge, on every viewport — only the content inside it moved.** `.cart__sticky-bar-inner` holds a page-width column (`max-width: var(--page-width); margin: 0 auto;`, matching every other section on the site) and now sets `justify-content: flex-end` on it, so the total + CHECK OUT group sits at the right edge of that column instead of hugging the left. Two things were tried and reverted before landing here: shrinking the whole bar down to a small bottom-right floating card (wrong — the original bar's design was already right, it just needed repositioning, not redesigning), and anchoring the bar itself to the right with `right: 0; width: auto` (wrong in the other direction — that made the bar narrow, when "full width" was actually a requirement, not just an artifact of the old centred layout). The fix that stuck: keep the bar's own box exactly as it was, move only the flex alignment of its content.

**The inner padding has to match `.page-width`'s exactly (`1.5rem`, then `5rem` at `750px+`), not carry its own fixed padding.** The bar originally had a flat `1rem 1.5rem` padding on the outer `.cart__sticky-bar` div at every width. Below 750px that's coincidentally correct, but above it `.page-width` (which every other section, including the cart items table, sits inside) widens to a 5rem gutter — so the CHECK OUT button's right edge sat noticeably inside the price column's right edge instead of flush with it. Fixed by moving the horizontal padding off `.cart__sticky-bar` entirely and onto `.cart__sticky-bar-inner`, at the same two breakpoints `.page-width` uses. Verified by comparing `getBoundingClientRect()` on the button and on a line-item price: both land at the identical pixel.

**It also hides once the real site `<footer>` scrolls into view.** The button-visibility check alone isn't enough: once the customer scrolls past the cart into the global footer, the CHECK OUT button is long off screen, so the bar stayed revealed and sat fixed on top of the footer's contact info (address, phone, "book an appointment" text) for the rest of the page. `cart-sticky-bar.js` now also reads `.footer`'s bounding rect and hides the bar as soon as its top enters the viewport.

**The JS is an asset file, not an inline `<script>`** — an inline script in this section did not execute. It uses a plain scroll check on `requestAnimationFrame`, not `IntersectionObserver`.

**Testing note:** neither rAF nor IntersectionObserver callbacks run while the tab is `visibilityState: "hidden"`, which is how the browser-automation tab reports. Two apparent "the script is broken" dead ends came from that. Verify by calling the update logic synchronously, or with the tab genuinely visible.

It is a **second submit button, not a moved one**: the real one stays in the summary for keyboard and screen-reader order, and both carry `form="cart"` so quantity edits post either way. Suppressed entirely when the cart is empty. `#MainContent` gets `padding-bottom: 8rem` on **every** viewport (not just mobile — that gate went away with the sidebar) so the fixed bar doesn't sit permanently on top of the last element, and the padding uses `env(safe-area-inset-bottom)` for the iPhone home indicator.

Three smaller fixes from the earlier centred-footer pass, still in force:
- `.tax-note` was `text-align: right` in **two** places, the second inside a `min-width: 750px` block.
- `.cart__checkout-button` had `max-width: 36rem` inside a wider column, so it stopped short of the summary edge. Now 100%.
- **Don't set `--shopify-accelerated-checkout-*` custom properties.** They are not part of that web component's API; setting `button-block-size`/`inline-size` squashed the wallet buttons from 42px to 20px tall. (Moot on the cart now — the express wallets were removed by request — but the trap stands wherever they appear.)

### Cart Pickup Notice

`snippets/cart-pickup-notice.liquid` warns, on the cart page and in the drawer, that part of the cart cannot be collected in store — **before** checkout. Shopify only says this at the delivery step, as a red "N items can't be picked up" error whose one offered remedy is "Remove item", by which point the customer has already entered an address. That error string is Shopify's and is not themeable, which is the whole reason this exists.

**Eligibility is `variant-stock-state` returning `own`.** Pickup happens at our own locations and `stock_primary_locations` already lists those, so there is no second definition of the same fact and no new setting. Anything on order from a supplier is by definition not on a shelf to collect.

**Only renders for a mixed cart** — some collectable, some not. That is exactly the case that triggers Shopify's error: if nothing is collectable Shopify never offers pickup, and if everything is there is nothing to say. Either way the notice would be noise for a customer who wanted delivery.

**One action clears the whole set**, not a Remove per row. `/cart/update` accepts `updates[variant_id]=0` pairs as a **GET query string**, so the link is a single href built in the counting pass — no JS, and no page load per item. Verified end to end: one click removed both blocked lines, left the collectable one, and the notice correctly disappeared because the cart was no longer mixed.

Dawn's `<cart-remove-button>` is deliberately not used: it walks up to a `<cart-items>`/`<cart-drawer-items>` ancestor to re-render itself, and in the drawer this notice sits in `.drawer__footer`, outside both.

**Constrained to `58ch`.** Full-bleed rows with a Remove link stranded at the far right margin were the distracting part — the eye had to cross ~700px of nothing to pair a name with its action. Row borders are gone for the same reason; the list is plain text and the single action sits under the copy that explains it.

Styles live in `component-cart-items.css` because that file is loaded globally in `theme.liquid` as well as on the cart page, so the drawer picks them up. Informational blue with a 3px left bar — deliberately not the red panel Shopify uses, for the same reason the variant chips avoid red: you can still buy these, you just cannot collect them.

Locale keys: `sections.cart.pickup_notice.{label,remove_all,body}` (en + sl).

### Pickup Availability

`sections/pickup-availability.liquid` gates on **a location where the variant is actually collectable**, not on stock Dawn's "some location has pickup switched on". Dawn's gate rendered a full panel — hairline, "Pickup currently unavailable at Recharge", and a block of empty space — to tell the customer nothing. When nothing is collectable no `<pickup-availability-preview>` is emitted, `pickup-availability.js` finds none in the fetched section and empties the container, so the block disappears cleanly. `closest_location` also comes from the *available* list, or the preview could lead with "unavailable" while a collectable store sat further down.

The border and padding live on `.pickup-availability-preview` itself, not a wrapper, so an empty container leaves no stray rule behind.

**Typed like the DELIVERY line** — uppercase micro-label, coloured status, muted timing after an em dash — because stock Dawn's tick icon and two stacked captions were the only thing left in the info column still wearing default Dawn styling, which is exactly why it read as an outsider. The label makes "Pickup available at X" redundant, so the value is just the location: new keys `products.product.pickup_availability.{label,available_at_html}` in en + sl. The `<template>` fallback in `buy-buttons.liquid` still uses Dawn markup on purpose — it is the "couldn't load" error state, and error states are allowed to look different.

### Rich Text Lists (Product Descriptions)

`.rte ul/ol` is `list-style-position: outside`, **not Dawn's `inside`**. Supplier descriptions are pasted as `<li><p>…</p></li>`, and with `inside` the marker sits in the li's own content box — so a block child puts the bullet on its own line and drops the text underneath it, unbulleted. That was the "weird" description rendering: a column of lone bullets with orphaned paragraphs. `.rte li > p:first-child/:last-child` also zero their margins so the bullet stays with its text.

### Encoded Option Values

Some CSV-imported option values are stored as **percent-encoded slugs**: Shopify really holds `%e2%88%85-1114-mm` where a customer should read `∅ 11/14 mm`. Confirmed against `/products/<handle>.js` — the theme was printing the value faithfully.

`snippets/option-value-label.liquid` decodes for display only. It rewrites a value **only when it is demonstrably encoded** — contains a `%` *and* round-trips through `url_decode` to something different — then swaps `-`/`_` for spaces. Legitimate values are untouched: `6'7 - 130L` keeps its spaced hyphen, `50% carbon` keeps its percent sign (`CGI.unescape` leaves a lone `%` alone, so the round-trip is a no-op).

**Form values, input names and option-value ids keep the raw string** — that is what Shopify matches variants on. The radio inputs additionally carry `data-option-label`, which `updateSelectionMetadata()` in `global.js` reads so the swatch legend shows the decoded text after a click instead of the raw `value`.

Applied at every display site: variant pills/swatches/dropdowns, the pill-width measurement, cart page, cart drawer, cart notification, order page, stock-locations matrix, facet filter labels and chips, and quantity-input aria-labels. The stock-locations `debug` block deliberately prints raw.

**This is a display patch over a data problem, and the data is the real fix.** A sweep of all 1321 products found only 4 affected, so fixing them in Shopify admin is a few minutes' work and also fixes checkout, order emails and admin, which the theme cannot reach:
- `point-7-battent-tubes` — `%e2%88%85-1114-mm`, `%e2%88%85-811-mm` (the `/` in `11/14` is **not recoverable** from the slug; it was lost before the value reached Shopify)
- `point-7-p7-kids-school-boom-1` — `140-190-ja`
- `point-7-spy-freestylewave-026` — `3-7-custom`
- `point-7-vario-harness-lines` — `34-40-blue-colour`, `32-38-blue-colour-2`

The last three are plain slugs with no percent-escapes, so the snippet does **not** touch them — only the admin fix will. The same sweep found no mojibake and no stray HTML entities anywhere.

### No-Image Placeholder

Products awaiting photography render `snippets/media-placeholder.liquid` — the standard grey frame/sun/mountain glyph, no caption — instead of collapsing to a text-only card. Used in two places:
- `snippets/card-product.liquid` — the card now **always** emits `.card__media` + `card--media` and switches only the inner `.media` contents, so grids stay aligned. The old `card--text` branch and its duplicate heading-id conditionals are gone.
- `sections/main-product.liquid` — the gallery column falls back to a square placeholder container carrying `constrain-height media-fit-contain` with `--aspect-ratio: 1`, so it obeys the same fold fit as a real image. `product--no-media` centring is no longer used; the grid is always two-column.

Styles live in `assets/base.css` (next to `.media > img`) because both cards and the product page need them. **The icon is centred by absolute positioning, not flex** — `.media > *:not(.zoom):not(.deferred-media__poster-button)` scores 0,3,0 and forces `display: block`, so a flex layout there needs a four-class selector. Every shape in the SVG clears the frame: a mountain line that meets the border doubles the stroke at the junction and reads as a smudge at card size.

Only string: `products.product.media.no_image` (en + sl), used as the `aria-label` — it is never shown.

### Product Card Hover Image (Collection / Homepage)

**Feature:** On hover, product cards show a different image — preferring an angle/lifestyle shot over a near-identical variant photo.

**Why this is custom:** Products are imported via CSV with this typical media structure:
1. **Variant images** (one per size variant, e.g., `f-cross87-1000.jpg`) — all `attached_to_variant? = true`, all look nearly identical (same board, different size label)
2. **Duplicate general image** — the same photo re-uploaded without variant association; Shopify deduplicates the filename with a `_1`/`_2` suffix (e.g., variant gets `f-cross113-1000_1.jpg`, general keeps `f-cross113-1000.jpg`)
3. **Actual angle/detail shots** — genuinely different images (different angle, accessories, lifestyle)

Stock Dawn just shows `media[1]` on hover, which is another variant's identical-looking photo.

**Custom logic in `snippets/card-product.liquid`** (lines ~86–140):
1. Iterates `card_product.images` (not `.media` — avoids `variant_ids` nil issues)
2. Skips variant-attached images (`attached_to_variant? = true`)
3. Skips general images that are filename duplicates of variant images (strips Shopify `_1`/`_2`/`_3` suffixes before comparing)
4. Picks the first genuinely different general image (angle/detail shot)
5. Falls back to: first non-featured image → `images[1]` as last resort

**Enabled via section settings:** `show_secondary_image: true` in both `templates/collection.json` and `templates/index.json` (featured collection "Izpostavljeno").

Key files:
- `snippets/card-product.liquid` — hover image selection logic (lines ~86–140)
- `assets/component-card.css` — CSS hover transition (fade out primary, fade in + scale secondary)

### Search Results (Empty State)

Stock Dawn's search page was the one template still wearing default typography — a bare centred `<h1>`, no breadcrumb, and on zero results just one grey status line followed by a dead end. Rebuilt to match the rest of the site (breadcrumb + accent-bar title, same values as `.cart-header__title`) and, more importantly, to stop being a dead end: a customer who searches and finds nothing is exactly the customer most likely to leave, so the empty state now ends in real products instead of white space.

**`show_empty_state` is deliberately narrower than "zero results."** It's true only when `search.performed and search.results_count == 0 and search.filters == empty` — the same condition the stock template already used for its single no-results line, kept as-is rather than loosened. A *filtered* zero-result state (facets exist, current filter combination just matches nothing) still gets the original "use fewer filters" handling further down; showing fallback products there would bury the actual fix (loosen the filters) under an unrelated product grid.

**Category chips reuse the breadcrumb's own menu resolution** (`settings.breadcrumb_menu` → `recharge-menu` → `main-menu`, same `unless ... > 0` chain as `main-product.liquid`, same reasoning: `nil == 0` is false, so an equality check would never fall through). No separate list to maintain — if the nav changes, the chips change with it.

**Fallback products come from `section.settings.empty_state_collection`, a new collection-picker setting, defaulting to `collections.all`.** Merchant can point it at a "bestsellers" or "new arrivals" collection; left blank, it just shows from the full catalogue (whatever sort order `collections.all` has in Admin). Guarded on `fallback_collection.products.size > 0` so an empty or misconfigured collection never renders a heading over nothing. Reuses `snippets/card-product.liquid` and the same grid classes as real search results — not a second card style to maintain.

**`.template-search--blank` replaced `.template-search--empty`.** The old class fired for both "page loaded, no query yet" and "searched, found nothing" and gave both the same 18rem bottom padding — appropriate for the former (genuinely nothing to show), wrong for the latter now that it's full of chips and products. The blank pre-search state is untouched; only the zero-results state changed.

Key files:
- `sections/main-search.liquid` — `show_empty_state` logic, category chips, fallback grid
- `assets/component-search-empty.css` — breadcrumb/title (mirrors `component-cart.css`), empty-state icon/heading/body (mirrors `.cart-empty`), category chips, fallback heading
- Locale keys: `templates.search.{empty_heading,empty_body,browse_categories,you_might_like}` (en + sl)

### Cart Page

**Redesigned** away from stock Dawn to match the brand identity (specifically the `blog.prepih` template pattern).

**Header:** Breadcrumb nav + large uppercase title + 3px red accent bar via `::after`.
- CSS values are copied from `assets/section-main-blog-prepih.css` — that file is the source of truth for spacing/typography.
- Breadcrumb: `font-size: 1.2rem`, `letter-spacing: 0.06em`, `margin-bottom: 2rem`
- Title: `clamp(2.2rem, calc(var(--font-heading-scale) * 3rem), 4rem)`, `font-weight: 700`, `letter-spacing: -0.02em`
- Red bar: `width: 4rem`, `height: 3px`, `margin-top: 1.2rem`

**Layout (990px+):** two columns — items left, sticky summary panel right (`40rem`), both starting under the title.
- Items and summary are separate sections, so `#MainContent` itself becomes the grid (in `assets/component-cart.css`): the items section, `<cart-items>` and its `.page-width` are `display: contents`, lifting breadcrumb/header/form into grid areas `crumb`/`head`/`items`; `.cart__footer-wrapper` is area `summary`.
- Only active via `:has(cart-items:not(.is-empty))` — emptying the cart (cart.js toggles `.is-empty`) drops back to one column.
- Panel is `position: sticky`; drops below the header while the on-scroll-up header is slid in (uses `--header-height`).
- Below 990px: one column, panel under the items, and the fixed `.cart__sticky-bar` keeps checkout reachable (hidden on desktop).
- A small bordered card in the side column was tried before and rejected ("fly on the screen"); the fix is a filled panel (light tint + 3px red top rule, like the mega-menu dropdown) that carries real content.

**Line items** (`assets/component-cart-items.css`, rules scoped to `cart-items` so the drawer is unaffected):
- Every row is a CSS grid at all widths: image (spans 2 rows) | name, SKU, options | line total top-right; stepper + remove on row 2 under the details
- Table `<thead>` visually hidden (kept for screen readers)
- Unit price ("€X each", `sections.cart.price_each`) only shown when quantity > 1

**Summary panel** (`sections/main-cart-footer.liquid`, `assets/component-totals.css`):
- Heading + item count (`sections.cart.item_count`, pluralised), free-shipping meter (moved here from above the items), subtotal/discount rows only when cart-level discounts exist, total, tax note, checkout, stacked trust strip, continue link
- `.cart__footer` is the panel; it no longer uses the section padding settings
- `cart-sticky-bar.js` copies the total from `.cart-summary__total-value` on every cart update (the bar sits outside the re-rendered `.js-contents`)
- `.free-shipping-bar__fill` needs the two-class selector — `base.css` hides `div:empty`

**Empty cart state:** Editorial layout matching `main-page-branded` / footer (no boxes or icons). Page header + red bar stays visible.
- Left: uppercase title, subtext, red "Continue shopping" + outline "Log in" buttons (login only for guests)
- Right (990px+, divided by 1px border): "Shop by category" list built from `linklists['recharge-menu']`, footer-style heading with red underline, arrow links
- Below: recommended products grid from the section setting `empty_collection` (set in `templates/cart.json`); hidden if blank
- Strings are translation keys `sections.cart.empty_*` (en + sl only)

**Hardcoded strings** (not using translation keys):
- `"Home"` — breadcrumb in `main-cart-items.liquid`
- `"Order summary"` — heading in `main-cart-footer.liquid`
- `"Variant"` — replaces `option.name == 'Title'` in cart item details (temporary fix; products imported via CSV use "Title" as variant option name)

Key files:
- `sections/main-cart-items.liquid` — cart header, items table, empty state
- `sections/main-cart-footer.liquid` — order summary, checkout button
- `assets/component-cart.css` — breadcrumb, header, empty state, checkout button styles
- `assets/component-cart-items.css` — table, image, quantity, price brand styling
- `assets/component-totals.css` — order summary totals layout

### Homepage

Order (`templates/index.json`): `hero-campaign` → `shop-by-sport` → `shop-by-brand` → `featured-collection` → `store-promo`. Replaced the old `hero-banner-grid` carousel (baked-text banners).

- **Everything stays inside `.page-width`, light color schemes only.** A full-bleed hero and black panels were tried and rejected.
- `sections/hero-campaign.liquid` — editable seasonal hero: eyebrow, heading, text, 2 CTAs, trust line, desktop + optional mobile image (`<picture>`), text-left/right. Heading is `h2` because the header logo is the homepage `h1`. Alt text containing `://` (CSV-import leftovers) is dropped.
- `sections/shop-by-sport.liquid` — photo tiles per collection block (image falls back to `collection.featured_image`); snap-scroll row below 990px.
- `sections/shop-by-brand.liquid` — vendor blocks link via `url_for_vendor`. Logos come from the block's image picker, else bundled `assets/brand-<vendor handle>.png` (list in the section's `bundled_logos`; sourced from the old recharge.si site). Shown greyscale, colour on hover.
- `sections/store-promo.liquid` — store relocation band (square photo + text + directions CTA).
- `.home-heading` (end of `base.css`) — uppercase heading + red rule, shared by these sections and the featured-collection title.
- `assets/component-brand-button.css` — `.button--brand` (red) / `.button--brand-outline`, layered on Dawn `.button`.
- Images with baked-in text (`C-skin.png`, `odprt_recharge.png`) need a focal point set in Admin → Files so the crop avoids the text.

### Stock State on the Variant Chip

**This is what customers see now.** Each size chip carries its own status — the value on the first line, the state on the second. Under the chips, one line gives the delivery expectation for the *selected* size. There is no availability table; the `stock_locations` block was removed from `templates/product.json`.

**The own/partner distinction is kept, but expressed as time rather than place.** This is the whole design. Partner stock really does ship slower, so hiding the difference would cost a real fact; showing it as two columns of booleans made the customer do the merge themselves and put `out ● in` on one row. So the location decides the *wording*, and the location itself is never printed:

| Internal | Chip | Delivery line |
|---|---|---|
| in our own stock | `In stock` green | In stock in our shop — Ships in 1–2 working days |
| only at a partner | `On order` blue | From our supplier — Ships in 5–7 working days |
| sellable, source unknown | `In stock` green | In stock *(no lead time claimed)* |
| not sellable | `Sold out` grey | Sold out |

**No status dots.** Both the chip and the line had a coloured dot at first and both were worse for it. On the chip a 6px half-filled circle is coloured mush at that size, not a signal — the chip's own border already frames the state. On the delivery line the dot pushed the text ~20px right, making it the only element in the info column that did not align with the price, the labels and the CTA; that misalignment was most of what made the block look wrong.

**The line carries a `DELIVERY` micro-label**, styled like the `QUANTITY` label (no red accent bar — bars belong to legends, and a read-only status should not compete with the actual controls). Without it, a single-variant product had one unanchored sentence floating between the price block and the quantity stepper, reading as more of the "Taxes included…" small print. With it the column is a consistent stack: SIZE / DELIVERY / QUANTITY.

**"On order", not "Available".** The first pair tried was *In stock / Available*, and it failed the only test that matters — the two read as near-synonyms, so nothing told the customer why one size arrives sooner. "On order" is universally understood as *we don't have this here, we'll bring it in*. The chip carries the verdict; the line carries the reason, in customer words ("in our shop" / "from our supplier"), never a location name.

**`variant.available` is authoritative for sellability; the metafield only refines a yes.** If Shopify will not sell it, no metafield entry can promote it above `none` — so the chip can never disagree with whether Add to cart works. `custom.stock_by_location` is consulted only to split an available variant into own vs partner, which means **Flow is load-bearing again** for the delivery wording, but not for basic in/out.

**`available` is the honest degraded state**, and it is why nothing breaks when the metafield is stale, missing, or Flow is off. Shopify says sellable, the metafield says nothing, so the chip reads plain "In stock" and the delivery line claims no lead time. With the metafield absent across the board the page degrades to exactly the old in/out behaviour. **Nothing is ever inferred** — the lead-time strings are free text from theme settings, and a blank setting prints nothing.

**Colour: green / amber / grey, red reserved.** This overrides the earlier "red for out of stock" call. Red on something you can still sell teaches customers to distrust the colour coding, and here it would also collide with the brand red already doing two jobs on that screen (selected chip, Add to cart). Dot *shape* carries the state as well as colour — filled / half / hollow — so it survives without colour vision.

**Settings live in `settings_schema.json` → "Stock & delivery"**, not on a block, because they are store-wide facts and the same states will be wanted on collection cards later. `stock_primary_locations` lists our own Shopify location names one per line; **anything not listed counts as partner stock**, so adding a partner location needs no theme change. Keys are pipe-wrapped during matching so `Recharge` cannot match `Recharge Partner`. Lead-time wording and the metafield namespace/key are settings too. Schema defaults apply, so it works unconfigured.

**Multi-option products take the best state across matching variants** — `own` > `available` > `partner` — which mirrors how `value.available` is already true if any combination is. Matching is by `variant.options[option.position - 1]`, not `contains`, because two options can legitimately share a value. Cost is O(values × variants); fine for this catalogue's mostly single-option products, worth watching if a product ever has hundreds of variants.

**The delivery line needs no `product-info.js` entry.** `updateOptionValues()` swaps the whole `<variant-selects>` element, so anything rendered inside it follows the variant automatically. This is why the line is inside the picker rather than a sibling block — a sibling would need the `updateSourceFromDestination` treatment and the id-rename trap that comes with it.

**Single-variant products get the line too**, via the `{% else %}` branch of the `unless product.has_only_default_variant or product.variants.size <= 1` guard at the top of `product-variant-picker.liquid`. That branch used to render nothing at all, which meant most of the accessories in this catalogue showed no stock information anywhere. There is no variant to follow, so the line stands alone with no `<variant-selects>` wrapper and no JS. This is also why the line lives in `snippets/variant-delivery-line.liquid` rather than inline — two call sites.

The `variant_picker` block therefore renders something for *every* product, including default-variant ones. No `templates/product.json` change was needed; the block was already unconditional in `main-product.liquid`. `featured-product.liquid` picks the line up on the same code path.

**Strings are Dawn's own, so they translate.** `products.product.inventory_in_stock` and `products.product.sold_out` already exist in both `en.default.json` and `sl.json` with real Slovenian ("Na zalogi" / "Razprodano"). No new keys. This deliberately differs from the old block's English-only rule — that rule was about a secondary panel, and this is the primary selector on a Slovenian storefront.

**`--pill-min` now sizes for the status line too**, since `Razprodano` is wider than a size like `77`. See the Variant Pills section. Mobile dropped its hard 4-column rule for the same auto-fit tracks as desktop, so chips degrade to 3 or 2 columns instead of overflowing under ~380px.

**`updateSourceFromDestination('StockLocations')` in `product-info.js` was deliberately kept.** It is guarded on the element existing, so it is a no-op today, but the block type still exists in `main-product.liquid` and can be re-added from the theme editor. Deleting the line would silently freeze the matrix on the first variant if anyone turns it back on.

Key files:
- `snippets/variant-stock-state.liquid` — resolves one variant to `own` / `partner` / `available` / `none`; the single place the location split is interpreted
- `snippets/product-variant-options.liquid` — chip markup, best-state-across-variants
- `snippets/variant-delivery-line.liquid` — the delivery line; rendered both inside the picker and standalone for single-variant products
- `snippets/product-variant-picker.liquid` — both call sites, and `--pill-min` fitting value *and* status
- `assets/product-page-enhancements.css` — `.variant-pill__*` and `.variant-delivery*`
- `config/settings_schema.json` — "Stock & delivery" settings
- Locale key: `products.product.stock_state.available` (en + sl)

### Stock by Location (Product Page) — retired, still available

Everything below describes the `stock_locations` block, which **no longer renders**. It is kept because the block type still exists in `main-product.liquid` and can be re-added from the theme editor, and because the Flow documentation is the record of how the metafield gets written.

**Block:** `stock_locations` in `main-product.liquid`. When it was live it sat after `barcode_token` in `templates/product.json` — below the buy buttons, its original spot. It was moved above Add to cart once and moved straight back; **if you re-enable it, leave it where it was.** In stock / out of stock only. No quantities, no low-stock state; that is a deliberate product decision, not a Liquid limitation.

**Two shapes, chosen automatically:**

- **More than one variant → a matrix.** Locations across the top, variants down the left, so a customer can pick a size *because* it is available. Collapsed it shows a **three-row window** around the selected variant — one either side, or the nearest three when the selection sits at either end — because neighbours are what someone reaches for when their size is out. Above three variants a CSS-only checkbox toggle ("All sizes") reveals the whole table.
- **One variant → a list**, one row per location with the status on the right.

Both shapes share their type: a location is always an uppercase micro-label at `--sl-label`, a status is always a 1.15rem coloured value with a dot. That is what keeps the two from reading as different components.

**The two locations** are `Recharge` (own physical stock) and `Partner Supply` (stock held at partners). They are not hardcoded — the block's `locations` textarea maps Shopify location names to customer-facing labels, one per line: `Shopify name | Label | Note`. The third field is optional free text under the label, for saying what a location means for delivery ("Ready to collect"). It is never inferred — nothing is promised that the shop hasn't promised. Order in the textarea is display order.

**Data sources, first hit per location wins:**

1. **Metafield** (`custom.stock_by_location`, variant-level then product-level, configurable). JSON list matched to a configured location by `name`; in stock when `available` is `true` or `quantity > 0`. **This is the live source** — see the sync script below.
2. **`variant.store_availabilities`** — needs no sync, but Shopify populates it only when a location has **local pickup enabled**.

   **Pickup is now ON at Recharge** (confirmed on the storefront 2025-08-16: "Pickup available at Recharge — usually ready in 24 hours"). This reverses the earlier note that pickup was deliberately off and the array always empty. It means `store_availabilities` is live for Recharge, so the fallback above is no longer dead code — and it raises a real question nobody has answered yet: **if every location gets local pickup enabled, `store_availabilities` alone could drive the own/partner split and the metafield, the Flows and the sweeper all become unnecessary.** Worth testing before investing further in the Flow machinery below.

Shopify also omits a location from `store_availabilities` when it doesn't stock the variant; likewise the sync writes no entry for such a location. Either way an unresolved location renders as out of stock, which is the correct reading — products do not need to be stocked everywhere.

**What keeps the metafield true: a Shopify Flow**, documented in `scripts/flow-stock-by-location.md`. Trigger *Product variant inventory quantity changed* → action *Send Admin API request* running `metafieldsSet`, with a Liquid loop over `productVariant.inventoryItem.inventoryLevels` building the JSON. Fires within seconds of any stock change; nothing is hosted or scheduled. Read that file before touching any of this.

**Two workflows.** `Stock by location — live`, trigger *Product variant inventory quantity changed*, does the real-time work. `Stock by location — new products`, trigger *Product created* → **Wait 1 minute** → *Send Admin API request*, covers only the narrow case of a product created with stock already on it, where Shopify may count the initial set as creation rather than a change. Stock assigned at any later point *is* a change, so the live Flow already has it — which is why the wait is a minute and not hours. Test whether this workflow is needed at all before keeping it.

**Third workflow — `Stock by location — sweeper`**, and it is the one that makes the whole thing reliable: *Scheduled time* → *Get product data* (100, **Updated at ascending**) → *For each loop* → *Send Admin API request*. It pages itself because the write bumps `updated_at`, walks the catalogue and wraps forever. It exists because the event triggers keep turning out to have holes — most notably **activating an item at a new location creates an inventory level, not a quantity change, and no Flow trigger fires at all**. There is no generic "product updated" trigger, which is just as well: with the sweeper writing product metafields it would trigger itself in a loop.

Three traps, all already paid for:
- **Build it on `Get product data`, not `Get product variant data`** — the variant action's sort dropdown has no `updated_at`, so a variant-level sweep re-processes the same batch forever.
- **Ascending, never descending.** Descending re-reads what it just wrote.
- The mutation writes an extra product-level `custom.stock_synced_at` metafield per product, purely to guarantee the product's `updated_at` moves — a variant metafield write may not propagate to the parent. It doubles as a visible last-synced marker.

**Use the For each loop**, not batched offsets: `metafieldsSet` caps at 25 metafields per call, so batching caps the run at 4 products while looping gives one call per product (the cap then only bites at 24+ variants on one product). 100 products per run every 10 minutes is 600/hour — this store's ~1000 products cycle in under two hours, so the sweeper is also the backfill. Drop to hourly for steady state to limit `updated_at` churn.

**Manual repair, only if the sweeper can't be made to work:** Inventory page → one location → select all → adjust available **+1**, then **−1**. Relative, not absolute, so a concurrent sale can't be clobbered. `scripts/sync-stock-by-location.mjs` does the same thing directly; do not schedule it, that was explicitly rejected.

**Custom app credentials changed on 2026-01-01:** new apps expose no `shpat_` token in the admin. You get a Client ID + secret from the **Dev Dashboard** (`dev.shopify.com/dashboard`, reached via Settings → Apps → Develop apps → Build apps in Dev Dashboard) and exchange them for a 24-hour token via the client credentials grant. The script does that exchange itself from `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET`; `SHOPIFY_ADMIN_TOKEN` still works for pre-2026 apps.

**Every configured location always renders**, on every product, resolved or not — by explicit request. There is no hide-when-empty guard, so a store with local pickup disabled on every location shows "out of stock" everywhere rather than nothing. That failure is loud on purpose; check local pickup first if the whole catalogue goes out of stock at once.

**Diagnostics:** the block's `debug` checkbox (off by default) prints what Shopify actually returned — `store_availabilities` size and contents, metafield entries, and the configured names — which is the only way to tell an empty array (pickup off) apart from a location-name mismatch. It renders to customers, so it's a theme-editor tool, not a permanent feature.

**Strings are English on purpose**, including in `sl.json`. The storefront's active locale is Slovenian, and Grega wants this block in English regardless; the row labels come from the block's `locations` setting, which isn't translatable at all.

**States:** in stock is `--color-success` with a filled dot; out of stock is **`--color-brand-primary`** with a hollow ring. Red for out-of-stock is Grega's explicit call, overriding the earlier muted grey — the ring keeps the state readable without relying on colour. The block is flat by design: hairline rules, no panel or card. A bordered, tinted panel was tried and rejected for not matching the site.

**It does need JS — one line.** Dawn does *not* re-render the whole info container on variant change; `product-info.js` swaps a fixed list of element ids, so the block only follows the selected variant because `updateSourceFromDestination('StockLocations')` was added next to the existing `ProductBarcodeToken` line. **Renaming `#StockLocations-{{ section_id }}` silently freezes the block on the first variant** — which is exactly the bug the old single-row version shipped with, unnoticed because both locations usually read the same across sizes. Consequence of the `innerHTML` swap: an expanded "All sizes" table collapses when a different size is picked.

Key files:
- `snippets/product-stock-locations.liquid` — the whole block; the resolution loop is deliberately written out twice, once per shape, because `render` gets a fresh scope and can't hand a value back
- `assets/product-info.js` — the `updateSourceFromDestination('StockLocations')` line that makes it follow the variant
- `scripts/flow-stock-by-location.md` — the Flow that keeps the rows true; the mutation and its Liquid template live here
- `scripts/sync-stock-by-location.mjs` — one-time backfill, not a scheduled job
- `assets/component-stock-locations.css` — all styles; verified no overflow down to a 300px container
- Locale keys: `products.product.stock_locations.{title,in_stock,out_of_stock,selected,show_all,show_less}` in `en.default.json` + `sl.json` only

## Rig builder (PRD 4, variant C "Live rig")

Page `/pages/rig-builder` (template `templates/page.rig-builder.json`) that builds a compatible windsurf rig through the hub's App Proxy.

- Files: `sections/rig-builder.liquid` (markup, schema, all strings as JSON from `rig_builder.*` in `locales/en.default.json` and `sl.json`), `assets/rig-builder.js` (custom element `rig-builder`), `assets/component-rig-builder.css` (brand colours via variables only, no hex).
- Contract (owned by recharge-hub, `docs/rig-builder.md`): `POST /apps/rig/build` on every changed answer (debounced), `/explain` only on *Explain my rig* / *Read my text*, `/verify` after a swap, then one `POST /cart/add.js` with `items[{id, quantity:1, properties:{_rig: requestId}}]`. Errors: 503 `not_ready`, 429 `Retry-After`, network. The hub has no "exclude variant" key, so after a 422 sell-out the page drops the variant client-side and swaps in an alternative.
- Slovenian strings are a draft, to be reviewed by a human.
- Test without Shopify CLI: `scripts/rig-harness.mjs` renders the section (small Liquid subset, fails on a missing translation key) and stubs `/apps/rig/*` and the cart from `scripts/rig-fixtures/` (copied from recharge-hub `tests/fixtures/rig/api`). `scripts/rig-harness-check.mjs` drives it with Playwright (see its header for env vars; run it `nice`, one browser). `shopify theme check` still has to be run where the CLI is installed.
