Scaffold a new Shopify Dawn theme section in this project.

Section name/description: $ARGUMENTS

## Steps

1. Derive a kebab-case file name from the name/description (e.g. "hero banner" → `hero-banner`).

2. Create `sections/<name>.liquid` using this exact Dawn boilerplate structure:

**Top of file — CSS imports** (only import what the section actually needs):
```
{{ 'section-<name>.css' | asset_url | stylesheet_tag }}
```

**Section-scoped padding block** (always include this):
```liquid
{%- style -%}
  .section-{{ section.id }}-padding {
    padding-top: {{ section.settings.padding_top | times: 0.75 | round: 0 }}px;
    padding-bottom: {{ section.settings.padding_bottom | times: 0.75 | round: 0 }}px;
  }
  @media screen and (min-width: 750px) {
    .section-{{ section.id }}-padding {
      padding-top: {{ section.settings.padding_top }}px;
      padding-bottom: {{ section.settings.padding_bottom }}px;
    }
  }
{%- endstyle -%}
```

**HTML structure**:
```liquid
<div class="color-{{ section.settings.color_scheme }} gradient">
  <div class="page-width section-{{ section.id }}-padding">
    <!-- section content here -->
  </div>
</div>
```

**Schema at bottom** — always include these standard settings, then add any section-specific ones:
```json
{% schema %}
{
  "name": "Section Name",
  "tag": "section",
  "class": "section",
  "settings": [
    {
      "type": "inline_richtext",
      "id": "heading",
      "label": "Heading"
    },
    {
      "type": "select",
      "id": "heading_size",
      "label": "Heading size",
      "options": [
        { "value": "h0", "label": "Extra large" },
        { "value": "h1", "label": "Large" },
        { "value": "h2", "label": "Medium" }
      ],
      "default": "h1"
    },
    {
      "type": "color_scheme",
      "id": "color_scheme",
      "label": "Color scheme",
      "default": "scheme-1"
    },
    {
      "type": "range",
      "id": "padding_top",
      "min": 0, "max": 100, "step": 4, "unit": "px",
      "label": "Padding top",
      "default": 36
    },
    {
      "type": "range",
      "id": "padding_bottom",
      "min": 0, "max": 100, "step": 4, "unit": "px",
      "label": "Padding bottom",
      "default": 36
    }
  ],
  "presets": [
    { "name": "Section Name" }
  ]
}
{% endschema %}
```

## Color rule (critical)
NEVER hardcode hex values. Use only CSS variables:
- Brand red: `var(--color-brand-primary)` — defined in `assets/base.css`
- All other colors: Dawn theme CSS variables like `var(--color-foreground)`, `var(--color-background)`, `var(--color-accent-1)`, etc.

If a color is needed that has no existing variable, add it to the `:root` block in `assets/base.css` with a clear name and a comment.

## After creating the file, report:
- File path created
- Whether a companion `assets/section-<name>.css` file is also needed
- Any snippets referenced that don't yet exist in `snippets/`
