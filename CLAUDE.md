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
--constrained-height: max(400px, calc(100vh - var(--viewport-offset)));
--contained-width: calc(var(--constrained-height) * var(--aspect-ratio));
width: min(var(--contained-width), 100%);
```
This makes **portrait images narrower than the full container**. The `--aspect-ratio` comes from the inline style `--preview-ratio` set in `snippets/product-thumbnail.liquid`.

**Fitting the image to the fold — `--viewport-offset` is measured, not guessed.**
A static offset can't work: the page above the gallery (header 155px + section padding + breadcrumb + vendor/title block) is ~305px and moves with header height, breadcrumb depth, title length, font loading and browser zoom. `fitToViewport()` in `assets/media-gallery.js` measures the gallery's document top and writes `--viewport-offset: {galleryTop + 72}px` inline on each `.product-media-container.constrain-height`. The 72px is a deliberate reserve so the **thumbnail strip stays half-visible at the fold** — the image lands fully in view and the peeking strip signals there is more below. The CSS value (380px, desktop) is only the no-JS fallback. On mobile the inline value is removed; the `max-width: 749px` rules in `product-page-enhancements.css` take over with natural aspect ratio.

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
- Brand-red prev/next buttons flanking the strip, `3.6rem` wide, with infinite-loop nav in `media-gallery.js`
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

**Block:** `stock_locations` in `main-product.liquid`, placed after `barcode_token` in `templates/product.json` — below the buy buttons, its original spot. It was moved above Add to cart once and moved straight back; **leave it where it is.** In stock / out of stock only. No quantities, no low-stock state; that is a deliberate product decision, not a Liquid limitation.

**Two shapes, chosen automatically:**

- **More than one variant → a matrix.** Locations across the top, variants down the left, so a customer can pick a size *because* it is available. Collapsed it shows a **three-row window** around the selected variant — one either side, or the nearest three when the selection sits at either end — because neighbours are what someone reaches for when their size is out. Above three variants a CSS-only checkbox toggle ("All sizes") reveals the whole table.
- **One variant → a list**, one row per location with the status on the right.

Both shapes share their type: a location is always an uppercase micro-label at `--sl-label`, a status is always a 1.15rem coloured value with a dot. That is what keeps the two from reading as different components.

**The two locations** are `Recharge` (own physical stock) and `Partner Supply` (stock held at partners). They are not hardcoded — the block's `locations` textarea maps Shopify location names to customer-facing labels, one per line: `Shopify name | Label | Note`. The third field is optional free text under the label, for saying what a location means for delivery ("Ready to collect"). It is never inferred — nothing is promised that the shop hasn't promised. Order in the textarea is display order.

**Data sources, first hit per location wins:**

1. **Metafield** (`custom.stock_by_location`, variant-level then product-level, configurable). JSON list matched to a configured location by `name`; in stock when `available` is `true` or `quantity > 0`. **This is the live source** — see the sync script below.
2. **`variant.store_availabilities`** — needs no sync, but Shopify populates it only when a location has **local pickup enabled**, and enabling that shows customers a pickup option at checkout. Grega does not want that, so pickup is off and this array is always empty here. Kept as a free fallback that would light up on its own if pickup were ever enabled.

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
