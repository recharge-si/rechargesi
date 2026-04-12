---
description: Generate a TSV work report from git history. Specify date range or individual dates. Example usage - /report 2026-04-08..2026-04-12 or /report 2026-04-09
---

Generate a TSV work report from git commit history.

Date argument: $ARGUMENTS

## Steps

1. **Parse dates** from $ARGUMENTS:
   - Range: `2026-04-08..2026-04-12` means all dates from Apr 8 to Apr 12 inclusive
   - Single date: `2026-04-09` means just that one day
   - Multiple dates: `2026-04-08,2026-04-10,2026-04-12` means those specific days
   - `all` or empty: all dates with commits

2. **Extract git log** — run `git log --format="%ad|%s" --date=format:"%Y-%m-%d %H:%M" --reverse` and filter to the requested dates.

3. **Group commits by date** — for each date:
   - Calculate hours from first-to-last commit timestamp span. Minimum 0.5h per day.
   - Write a short description in **Slovenian** (max ~30 words) summarizing all commits for that day. Use semicolons to separate distinct features/tasks.

4. **Write `a.tsv`** in the project root with this exact format (tab-separated, no date column):
   ```
   Datum	Ure	Opis
   0.5	Zacetna postavitev Dawn teme; popravek navigacije
   7.5	Prenova produktne strani: galerija, variante, filtri
   ```
   - Header row: `Datum	Ure	Opis`
   - Data rows: hours (one decimal), then Slovenian description
   - No date column in data rows (dates are implicit from the header context)

5. **Show the result** — display the TSV content to the user after writing.
