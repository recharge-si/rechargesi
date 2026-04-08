Scaffold a new Shopify Dawn theme snippet in this project.

Snippet name/purpose: $ARGUMENTS

## Steps

1. Derive a kebab-case file name from the name/purpose (e.g. "product badge" → `product-badge`).

2. Create `snippets/<name>.liquid`.

**Structure rules:**
- Snippets are rendered via `{% render 'name', param: value %}` — they do NOT have access to `section` or `block` objects unless passed explicitly.
- Document the expected parameters at the top of the file in a Liquid comment.
- Use `assign` for local variables; avoid polluting parent scope.
- Keep snippets focused on a single responsibility.

**Boilerplate template:**
```liquid
{%- comment -%}
  Renders <description of what this snippet does>.

  Accepts:
  - param_name {Type}: Description. (Required/Optional)

  Usage:
  {% render '<name>', param_name: value %}
{%- endcomment -%}

{%- liquid
  assign param_name = param_name | default: ''
-%}

<!-- snippet markup here -->
```

## Color rule (critical)
NEVER hardcode hex values in snippets. Use only CSS variables:
- Brand red: `var(--color-brand-primary)`
- All other theme colors: `var(--color-foreground)`, `var(--color-background)`, etc.

## After creating the file, report:
- File path created
- The exact `{% render %}` call signature to use it
