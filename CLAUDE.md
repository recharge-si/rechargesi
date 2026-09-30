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
```

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

### Product Page / Gallery

**Active settings** (`templates/product.json`):
- `gallery_layout: "thumbnail_slider"` — single main image + thumbnail strip below
- `media_fit: "contain"` — shows full image without cropping
- `constrain_to_viewport: true` — limits image height to `100vh - 300px` (desktop)
- `media_size: "large"` — media column is 65% width on desktop

**How `constrain_to_viewport` + `media_fit: contain` interact:**
`.product-media-container.constrain-height.media-fit-contain` in `assets/section-main-product.css` computes:
```css
--constrained-height: max(400px, calc(100vh - 300px));
--contained-width: calc(var(--constrained-height) * var(--aspect-ratio));
width: min(var(--contained-width), 100%);
```
This makes **portrait images narrower than the full container**. The `--aspect-ratio` comes from the inline style `--preview-ratio` set in `snippets/product-thumbnail.liquid`.

**Thumbnail strip width sync:**
Because the constrained image is narrower than its container, `assets/media-gallery.js` contains a `syncThumbnailWidth()` method (added as a customization) that measures the active `.product-media-container` width and sets it as `max-width` on the thumbnail slider. Called on: initial RAF, window resize (debounced 200ms), and active media change.

**Thumbnail strip CSS customizations** (in `assets/section-main-product.css`, end of file):
- Nav arrow buttons hidden (`display: none !important`) — all images shown in a single row
- Thumbnail items use `flex: 1 0 0` to fill width equally
- Horizontal padding zeroed out so thumbnails align flush with image edges

Key files:
- `assets/section-main-product.css` — all product layout + constrain-height rules
- `assets/media-gallery.js` — `MediaGallery` custom element; `syncThumbnailWidth()` is our addition
- `snippets/product-media-gallery.liquid` — gallery HTML structure
- `snippets/product-thumbnail.liquid` — sets `--ratio`/`--preview-ratio` inline styles on each media container

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
