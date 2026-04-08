Run Shopify theme check and summarize the results.

Target file or directory (optional): $ARGUMENTS

## Steps

1. Run: `shopify theme check $ARGUMENTS --no-color 2>&1`

2. Parse the output and group results into:

### Errors (must fix before deploying)
List each error with: file path + line number + message + brief explanation of why it's a problem.

### Warnings (should review)
List each warning grouped by type (e.g. "Missing required schema fields", "Deprecated filter", etc.).

### Info / Style
Summarize counts only — don't list individually unless count > 0 and $ARGUMENTS targets a specific file.

3. **Summary line**: `X errors, Y warnings across Z files`

4. If there are errors, suggest the most likely fix for each based on the error message.

5. If check passes cleanly: confirm "No issues found — safe to deploy."
