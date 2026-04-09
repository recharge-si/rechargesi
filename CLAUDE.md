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

Defined in `assets/base.css` `:root` block — always use these variables, never hardcode hex values:

```css
--color-brand-primary: #bd1218;  /* brand red */
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

**Debug attributes** (temporary — remove before production): The hover `<img>` tag includes `data-hover-debug-*` attributes showing the product handle, selection reason, picked filename, all images with `attached_to_variant?` values, and total count. Inspect the second `<img>` inside `.media--hover-effect` in browser dev tools.

**Enabled via section settings:** `show_secondary_image: true` in both `templates/collection.json` and `templates/index.json` (featured collection "Izpostavljeno").

Key files:
- `snippets/card-product.liquid` — hover image selection logic (lines ~86–140)
- `assets/component-card.css` — CSS hover transition (fade out primary, fade in + scale secondary)
