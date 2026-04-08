---
description: Stage and commit theme changes to git with a well-formed commit message. Use after finishing a feature, fix, or section.
---

Commit the current changes to git.

Optional message override: $ARGUMENTS

## Steps

1. **Check status** — run `git status --short` and `git diff --stat HEAD 2>/dev/null` to see what has changed.

2. **Warn about settings_data.json** — if `config/settings_data.json` appears in changed files, warn the user explicitly:
   > "settings_data.json is modified. This file is managed by Shopify Admin and committing it may overwrite live customizations. Stage it? (yes/no)"
   Do not stage it unless the user confirms.

3. **Stage files** — stage all changed/new files in:
   - `sections/`, `snippets/`, `assets/`, `layout/`, `templates/`
   - `config/settings_schema.json` (schema only, not settings_data.json unless confirmed above)
   - `.claude/` (skills, agents, settings)
   - Root files: `CLAUDE.md`, `.shopifyignore`, etc.

   Use specific file paths, not `git add .` or `git add -A`.

4. **Write the commit message** — if $ARGUMENTS is provided, use it as the message. Otherwise, derive a message from the staged changes:
   - Format: `type: short description` where type is one of:
     - `feat` — new section, snippet, or feature
     - `fix` — bug fix
     - `style` — CSS/visual changes only
     - `refactor` — restructuring without behavior change
     - `chore` — config, tooling, .claude files
   - Keep it under 72 characters
   - Be specific: "feat: add testimonials section with 3-column layout" not "feat: add section"
   - If multiple unrelated things changed, note the most significant one and add `+ N more` if needed

5. **Commit** — run the commit. Show the final commit hash and message.

6. **Do not push** unless the user explicitly asks.
