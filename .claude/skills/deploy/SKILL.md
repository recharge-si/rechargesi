---
description: Deploy this Shopify theme to the connected store. Runs theme check, shows changed files, and confirms before pushing.
---

Deploy this Shopify theme to the connected store.

Options/flags to pass through: $ARGUMENTS

## Steps

1. **Show what will be deployed** — run `git status` if this is a git repo, or list recently modified files in `sections/`, `snippets/`, `assets/`, `layout/`, `templates/`, `config/` (modified in the last 24 hours) to give a summary of what has changed.

2. **Pre-deploy check** — run `shopify theme check --no-color 2>&1` and report any errors (not warnings). If there are errors, stop and report them. Ask the user whether to proceed if there are only warnings.

3. **Confirm before pushing** — show the target store (from `.shopify` or `settings.local.json` if readable) and ask: "Deploy these changes? (yes/no)"

4. **Deploy** — run `shopify theme push $ARGUMENTS 2>&1`

5. **Report result** — show success/failure and the store URL if available.

Note: `config/settings_data.json` is managed by Shopify Admin — warn if it appears in the changed file list, as pushing it may overwrite live customizations.
