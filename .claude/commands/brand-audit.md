Audit this Shopify theme for hardcoded color values that should use CSS variables instead.

## Step 1 — Build the known variable map

Read `assets/base.css` and extract every CSS custom property defined in `:root` that relates to color (names containing `color`, `bg`, `background`, `border`, `text`, `fill`, `stroke`, `shadow`, or `alpha`). This is the source of truth.

Also note: Dawn theme settings inject additional CSS variables at runtime (e.g. `--color-foreground`, `--color-background`, `--color-accent-1`, `--color-accent-2`, `--color-button`, `--color-button-text`, `--color-secondary-button`, `--color-secondary-button-text`, `--color-link`, `--color-badge-foreground`, `--color-badge-background`, `--color-badge-border`). These are valid variables even if not in base.css.

## Step 2 — Search for hardcoded colors

Search all files in `assets/`, `sections/`, `snippets/`, and `layout/` for:
- Hex colors: `#[0-9a-fA-F]{3,8}` (3, 4, 6, or 8 digit hex)
- RGB/RGBA literals: `rgb\(` and `rgba\(`
- HSL literals: `hsl\(` and `hsla\(`

Exclude:
- Lines that are already inside a `var(--...)` definition in `:root` in `base.css` (those are the declarations, not usages)
- SVG fill/stroke attributes on icon files (`.svg` files in assets) — note them separately
- Comment lines

## Step 3 — Analyze and group findings

For each hardcoded color found:
1. Check if there is an existing CSS variable with that value — if yes, flag it as "should use `var(--variable-name)`"
2. If no variable exists, check if the same hex appears in 2+ different places — flag as "repeated color, candidate for new variable"
3. If it appears only once and has no matching variable, flag as "one-off hardcode — review if intentional"

## Step 4 — Report

Output a structured report:

### CSS Variables Currently Defined
List all color variables from Step 1.

### Violations by File
For each file with violations, show:
- File path
- Line number and the hardcoded value
- Suggested fix (which variable to use, or "add new variable `--color-xxx`")

### New Variables Recommended
For repeated colors with no variable: suggest a variable name, the hex value, and which files use it.

### Summary
- Total files scanned
- Total violations found
- Files clean (no violations)

At the end, ask: "Would you like me to fix any of these automatically?"
