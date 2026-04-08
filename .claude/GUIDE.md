# Skills & Agents Reference

Quick reference for all custom Claude Code skills and agents in this project.

---

## Skills (slash commands)

### `/new-section [name or description]`
Scaffolds a complete `sections/*.liquid` file with the correct Dawn boilerplate.

**Use when:** Starting a new section from scratch.  
**What you get:** Section file with padding pattern, color-scheme wrapper, and a full schema (heading, color_scheme, padding_top/bottom, presets). CSS import stub included.  
**Examples:**
```
/new-section hero banner with video background
/new-section testimonials
/new-section featured-products three columns
```
**Note:** Brand color rule is enforced — never hardcodes hex.

---

### `/new-snippet [name or purpose]`
Scaffolds a `snippets/*.liquid` file with parameter docs and render signature.

**Use when:** Extracting a reusable partial or creating a new one.  
**What you get:** Snippet file with `{%- comment -%}` header documenting params, `assign` defaults, and the `{% render %}` call signature printed at the end.  
**Examples:**
```
/new-snippet product badge sale/new label
/new-snippet icon with size and color params
```

---

### `/brand-audit`
Scans all CSS, Liquid, and JS files for hardcoded color values.

**Use when:** After adding new styles, before a release, or when you suspect color drift.  
**What you get:**
- List of all CSS color variables currently defined in `base.css`
- Every hardcoded hex/rgb/hsl found, grouped by file with line numbers
- Suggested variable to use (or recommendation to add a new one)
- Repeated colors flagged as candidates for new variables
- Offer to fix violations automatically  

**Run this regularly as the project grows — color drift compounds.**

---

### `/schema-validate [file or blank for all]`
Validates `{% schema %}` blocks in sections against Dawn conventions.

**Use when:** After editing a schema, before deploying, or when Shopify Admin isn't showing a section.  
**What you get:** Pass/fail per file, with specific violations — missing `presets`, invalid setting `type`, missing `id`/`label`, broken `range`/`select` definitions, hardcoded color defaults.  
**Examples:**
```
/schema-validate
/schema-validate sections/hero-banner.liquid
```

---

### `/check [file or blank for all]`
Runs `shopify theme check` and summarizes output.

**Use when:** Before deploying, or after editing Liquid to catch syntax/deprecation errors.  
**What you get:** Errors (blocking) and warnings (review) grouped by type, with fix suggestions. Clean pass confirmed if no issues.  
**Examples:**
```
/check
/check sections/header.liquid
```

---

### `/deploy [optional flags]`
Safe deploy flow: shows changed files → runs theme check → confirms → pushes.

**Use when:** Ready to push changes to the live or dev store.  
**What you get:** Summary of what changed, check results, store target shown, confirmation prompt before any push. Warns if `settings_data.json` is in the changeset.  
**Examples:**
```
/deploy
/deploy --theme-id 12345678
/deploy --nodelete
```

---

### `/commit [optional message]`
Stages appropriate files and commits with a well-formed message.

**Use when:** Finished a feature, fix, or section and want to checkpoint.  
**What you get:** Smart staging (skips `settings_data.json` by default), auto-generated `feat/fix/style/chore:` commit message derived from what changed, or uses your message if provided. Never pushes.  
**Examples:**
```
/commit
/commit feat: add hero banner section
```

---

## Agents

### `section-builder`
A specialist agent pre-briefed on this project's full architecture — section structure, schema format, CSS naming, JS patterns (pubsub, custom elements), and brand color rules.

**Use when:** Creating or significantly modifying sections, snippets, or their companion CSS/JS files.  
**Why it saves tokens:** You don't re-explain the Dawn conventions, color rules, or directory layout on every request — it already knows them.  
**How to invoke:** Ask Claude to use the `section-builder` agent, or just describe what you want to build and Claude will route to it.  
**Examples:**
```
Use section-builder to create a testimonials section with headshot, quote, and name blocks
Build a full-width banner section with CTA button using section-builder
```

---

### `theme-explorer`
A read-only agent for navigating and understanding the codebase. Answers "where is X?" and "how does Y work?" questions efficiently.

**Use when:** You need to find where something is implemented, trace a data flow, or understand how an existing feature works — without modifying anything.  
**Why it saves tokens:** Scoped to exploration only; won't run off and start editing files. Pre-briefed on the directory layout so searches are targeted.  
**Examples:**
```
Use theme-explorer to find where the mega menu hover behavior is implemented
Use theme-explorer to show me all the places cart events are published
Use theme-explorer to find every section that uses the product card snippet
```

---

## Recommended workflows

| Task | Command |
|------|---------|
| Build a new section | `/new-section [description]` |
| Build a new snippet | `/new-snippet [description]` |
| Find existing code | `theme-explorer` agent |
| After adding CSS | `/brand-audit` |
| Before deploying | `/check` then `/deploy` |
| Checkpoint work | `/commit` |
| Schema broken in Admin | `/schema-validate` |
