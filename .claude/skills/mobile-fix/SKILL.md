---
description: Audit and fix mobile responsiveness issues in this Shopify theme. Use when building new sections, after CSS changes, or to do a full mobile audit. Checks breakpoints, touch targets, font sizes, overflow, spacing, and layout issues.
---

Audit this Shopify theme for mobile responsiveness issues and fix them.

Target file or section (optional): $ARGUMENTS

If $ARGUMENTS is provided, scope the audit to that file/section only. Otherwise, audit all CSS files in `assets/`, `sections/`, and `snippets/`.

## Step 1 — Identify target files

If $ARGUMENTS names a section (e.g. "main-product"), find:
- `sections/<name>.liquid`
- `assets/section-<name>.css` (if exists)
- `assets/component-*.css` files referenced via `{% stylesheet %}` or `asset_url` in that section
- Any snippets rendered by that section

If no argument, scan all `assets/*.css` files plus inline `<style>` tags in `sections/*.liquid` and `snippets/*.liquid`.

## Step 2 — Check for common mobile issues

For each target file, check for these categories of problems:

### 2a. Missing or inadequate breakpoints
- Look for `@media` queries. The theme uses these breakpoints: `750px` (mobile/tablet), `990px` (tablet/desktop), `1200px` (large desktop).
- Flag CSS rules that set fixed widths (`width: Xpx` where X > 300), fixed heights, or `position: absolute/fixed` layouts WITHOUT corresponding `@media (max-width: 749px)` or `@media (max-width: 989px)` overrides.
- Flag `display: flex` or `display: grid` containers that don't adjust `flex-direction`, `grid-template-columns`, or gap at mobile breakpoints.

### 2b. Typography too small or too large on mobile
- Flag `font-size` values above `2.5rem` or above `32px` that don't reduce at mobile breakpoints.
- Flag `font-size` values using `vw` units without a `clamp()` or `min()`/`max()` wrapper (can get too small on narrow screens).
- Flag line-height values that would create excessive whitespace on small screens.

### 2c. Touch target sizing
- Flag interactive elements (buttons, links, inputs) styled with `height` or `min-height` below `44px` (Apple HIG) or `padding` below `8px` at mobile sizes.
- Flag clickable elements with no padding/margin gap between them (tap targets too close together).

### 2d. Overflow and horizontal scroll
- Flag elements with `overflow: hidden` on containers that have children with fixed widths exceeding `100vw` or `100%`.
- Flag `white-space: nowrap` on elements that could contain long text without `overflow` handling.
- Flag images or media without `max-width: 100%` or `width: 100%` at mobile sizes.
- Flag horizontal `padding` or `margin` using large fixed `px` values (> 40px) without mobile overrides.

### 2e. Spacing and layout
- Flag `gap`, `padding`, or `margin` values above `4rem` / `60px` that don't reduce at mobile breakpoints.
- Flag multi-column grid/flex layouts that don't collapse to single column at `749px` or below.
- Flag `height: 100vh` without accounting for mobile browser chrome (should use `100dvh` or fallback).

### 2f. Visibility and display
- Check for `display: none` at mobile that might hide important content.
- Check for desktop-only features that have no mobile equivalent.

## Step 3 — Cross-check with Liquid

For sections/snippets, also check:
- Are there `{% if request.design_mode %}` blocks that might affect mobile preview in the editor?
- Are inline styles set via Liquid (e.g., `style="width: {{ block.settings.width }}px"`) that could break on mobile? These need CSS `max-width: 100%` guards.

## Step 4 — Report findings

Output a structured report grouped by severity:

### Critical (will break on mobile)
Issues that cause layout breakage, horizontal scroll, unreadable text, or untappable buttons.

### Warning (poor mobile UX)
Issues that work but create a suboptimal experience — too much whitespace, text too large, elements too close together.

### Info (could be improved)
Minor suggestions like using `dvh` instead of `vh`, or adding `scroll-snap` to carousels.

For each issue show:
- File path and line number
- The problematic CSS rule
- Why it's a problem on mobile
- The suggested fix (exact CSS to add or change)

### Summary
- Total files scanned
- Critical / Warning / Info counts
- Files that are clean

## Step 5 — Fix

After presenting the report, ask: "Would you like me to fix all Critical and Warning issues automatically?"

If the user confirms (or if they invoked the skill with the intent to fix), apply fixes following these rules:

1. **Add mobile overrides** — don't change the desktop rule; add a `@media (max-width: 749px)` block. If one already exists for the selector, append to it rather than creating a duplicate.
2. **Preserve existing breakpoint structure** — if the file already groups mobile styles in a specific location, add fixes there.
3. **Use theme variables** — reference existing CSS custom properties from `base.css` (e.g., spacing, colors) rather than hardcoding values.
4. **Test with `clamp()`** — for font-size and spacing that should scale smoothly, prefer `clamp(min, preferred, max)` over separate breakpoint rules.
5. **Never remove desktop styles** — only add or adjust mobile-specific overrides.
