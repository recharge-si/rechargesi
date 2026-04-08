Validate the {% schema %} block(s) in one or more section files against Dawn conventions.

Target file(s) or section name: $ARGUMENTS

If no argument given, validate ALL files in `sections/`.

## For each section file, check:

### Required fields
- `"name"` — must exist and be a non-empty string or t: translation key
- `"presets"` — must exist with at least one entry (otherwise section won't appear in theme editor)
- Each preset must have a `"name"` field

### Settings validation
For every setting object:
- `"type"` must be a valid Shopify setting type: `text`, `textarea`, `number`, `range`, `select`, `checkbox`, `radio`, `color`, `color_scheme`, `color_background`, `font_picker`, `collection`, `collection_list`, `product`, `product_list`, `blog`, `page`, `link_list`, `url`, `video_url`, `richtext`, `inline_richtext`, `html`, `article`, `image_picker`, `video`, `header`, `paragraph`
- `"id"` must exist for all settings except `header` and `paragraph` types
- `"label"` must exist for all settings except `header` and `paragraph` types
- `range` type must have `min`, `max`, `step`
- `select` and `radio` types must have `options` array with at least 2 items, each with `value` and `label`

### Blocks validation
- Each block must have `"type"` and `"name"`
- If `"max_blocks"` is set, it must be a number 1–50

### Color hygiene (bonus check)
- If any setting has `"type": "color"` with a hardcoded `"default"` hex value, flag it — the default should use a CSS variable or be left empty so it inherits from the color scheme.

## Output

For each file: report PASS or list each violation with the setting id/type and what's wrong.

Final summary: `X files passed, Y files have issues`
