# Recharge.si — Shopify Theme

A custom-branded Shopify theme built on [Dawn v15.4.1](https://github.com/Shopify/dawn), tailored for **Recharge.si**. Pure Liquid, vanilla JS, and CSS — no build tools, no bundlers, no frameworks.

---

## Highlights

| Feature | Description |
|---------|-------------|
| **Mega Menu** | Full-width hover-triggered dropdown with 4-column layout and brand accents |
| **AJAX Page Transitions** | Seamless navigation using the View Transitions API — no full page reloads |
| **Smart Hover Images** | Product cards show genuine angle/detail shots on hover, skipping near-identical variant photos |
| **Constrained Gallery** | Product media sized to viewport with synced thumbnail strip |
| **Branded Cart** | Redesigned cart page with breadcrumbs, styled totals, and branded empty state |
| **Mobile-First Drawer** | Touch-friendly mobile menu with 44px tap targets |

## Brand Identity

```
Primary Red     #bd1218
Hover Red       #a00f14
Active Red      #8f0d12
Success Green   #1a7a3c
Urgency Amber   #b45309
```

All colors are defined as CSS custom properties in `assets/base.css` and referenced throughout — no hardcoded hex values in component styles.

## Project Structure

```
rechargesi/
├── layout/           Theme shells (theme.liquid, password.liquid)
├── templates/        JSON templates — define sections per page type
├── sections/         57 configurable content blocks
├── snippets/         39 reusable Liquid partials
├── assets/           192 files — JS, CSS, SVGs (no build step)
├── config/           Theme settings schema + active values
└── locales/          51 translation files (22+ languages)
```

## Development

Requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
# Local development server
shopify theme dev

# Deploy to store
shopify theme push

# Pull latest settings from store admin
shopify theme pull

# Lint Liquid files
shopify theme check
```

## Architecture

**No frameworks.** JavaScript uses native [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) (`HTMLElement` subclasses registered as custom elements) with a lightweight pub/sub event system for cross-component communication.

CSS is split by concern — `base.css` for globals, `component-*.css` for UI elements, `section-*.css` for page sections — and loaded selectively per template.

Templates (`templates/*.json`) declare which sections appear on each page. Sections are self-contained Liquid files with embedded `{% schema %}` blocks that power the Shopify Admin visual editor.

## Key Customizations

### Mega Menu Navigation
Hover-to-open mega menu with click-through navigation on top-level items. Uppercase nav items with brand-red active states and a full-width dropdown panel.

### Product Card Hover Logic
Custom image selection that filters out variant-attached images and Shopify filename duplicates (CSV import artifacts), surfacing genuinely different product angles on hover.

### Product Gallery
Viewport-constrained media with aspect-ratio-aware width calculation. Thumbnail strip auto-syncs its width to match the constrained main image via `MediaGallery.syncThumbnailWidth()`.

### Cart Page
Fully redesigned with breadcrumb navigation, branded typography, styled quantity controls, and a custom order summary section matching the blog template aesthetic.

### Page Transitions
AJAX-powered navigation with the View Transitions API for smooth, app-like page changes. Mobile drawer auto-closes on transition.

---

Built on [Shopify Dawn](https://github.com/Shopify/dawn) v15.4.1
