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

**Cart items table brand touches:**
- Table headers: uppercase, `letter-spacing: 0.08em`, `font-weight: 600`
- Product images: subtle 1px border, darker on row hover
- Product names: brand red on hover (no underline)
- Row separators: 1px borders between items (mobile + desktop)
- Quantity buttons: brand red hover; remove button: 0.4 opacity → brand red on hover
- Sale prices: brand red, bolder weight

**Cart footer / order summary:**
- "Order summary" heading with red accent bar, total row with flex label/value layout
- Larger price: `2.2rem` mobile, `2.6rem` desktop

**Empty cart state:** Cart SVG icon (muted), uppercase title, brand-red CTA button.

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

### Stock by Location (Product Page)

**Block:** `stock_locations` in `main-product.liquid`, placed after `barcode_token` in `templates/product.json`. Renders a "Zaloga po lokacijah" table in the product info column.

**Critical constraint:** Shopify's storefront Liquid **cannot read per-location inventory quantities**. `variant.store_availabilities` returns only an `available` boolean per location (and only for locations with local pickup enabled); `variant.inventory_quantity` is the aggregate. Real counts must be pushed in from the Admin API.

**Three data sources — first one with data wins:**

1. **Metafield** (`custom.stock_by_location`, variant-level then product-level, configurable on the block). JSON list of `{name, quantity, address?, note?}`. Only `name`/`quantity` required. Populate from Admin API `inventoryItem.inventoryLevels`. This is the production source.
2. **Manual** — the block's `manual_locations` textarea, one line per location: `Name | quantity | detail`. Shows every location listed with no setup, but the same numbers on every product and variant. Preview/demo only — must be cleared before the metafield goes live, or it will mask nothing but still be wrong if the metafield is empty.
3. **Pickup availability** — `store_availabilities`. Real and variant-accurate, but no counts, so the quantity column is dropped and `.stock-locations__table--no-counts` is applied.

**Row states** (`low_stock_threshold`, default 3): `stock-row--in` (`--color-success`), `--low` (`--color-urgency`), `--out` (muted, hollow dot). Out-of-stock uses a hollow ring rather than colour alone, so state survives colourblindness.

**Signature element:** a five-tick gauge in `--color-brand-primary` beside each number, filled by `quantity / full_stock_threshold` (default 10). Red is the material (quantity); green/amber are the signal (status) — the two never mix in one mark. The rise animation is **scale-only, never opacity** — the block re-renders on every variant change, and a fade would blink the ticks out each time.

**No JS.** Dawn re-renders the whole product info container on variant change, so the table updates for free.

Key files:
- `snippets/product-stock-locations.liquid` — source selection, totals, table shell
- `snippets/product-stock-location-row.liquid` — one row; shared by all three sources
- `assets/component-stock-locations.css` — all styles; verified no overflow down to a 300px container
- Locale keys: `products.product.stock_locations.*` in `en.default.json` + `sl.json` only
