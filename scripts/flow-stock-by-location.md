# Stock by location — Shopify Flow setup

The product page's Availability block reads the `custom.stock_by_location`
variant metafield. This Flow keeps that metafield true, firing within seconds of
any inventory change. Nothing is hosted, scheduled, or maintained outside
Shopify.

Why Flow rather than reading stock live: Liquid's only live per-location source
is `variant.store_availabilities`, which Shopify populates only when a location
has **local pickup enabled** — and that puts a pickup option in front of
customers at checkout. We don't want that, so the data is pushed into a metafield
instead.

---

## 1. Create the metafield definition

Settings → **Custom data** → **Variants** → Add definition

| Field | Value |
|---|---|
| Name | Stock by location |
| Namespace and key | `custom.stock_by_location` |
| Type | **JSON** |

Not strictly required — Liquid can read undefined metafields — but it makes the
value visible on the variant in admin, which is how you check the Flow is working.

## 2. Build the Flow

Apps → **Flow** → Create workflow. Name it:

```
Stock by location — live
```

This one runs forever. The backfill in step 3 is a second, throwaway workflow;
naming them so the difference is obvious matters, because the two look almost
identical in the Flow list and only one of them should still be on next month.

### Trigger

**Product variant inventory quantity changed**

### Action

**Send Admin API request**

**Mutation:**

```
metafieldsSet
```

**Mutation inputs:**

```liquid
{% capture stockJson %}[{% for level in productVariant.inventoryItem.inventoryLevels %}{"name": {{ level.location.name | json }}, "quantity": {{ level.available | default: 0 }}}{% unless forloop.last %}, {% endunless %}{% endfor %}]{% endcapture %}
{
  "metafields": [
    {
      "ownerId": {{ productVariant.id | json }},
      "namespace": "custom",
      "key": "stock_by_location",
      "type": "json",
      "value": {{ stockJson | json }}
    }
  ]
}
```

What that does: loops every location the variant is stocked at, emits
`{"name": "...", "quantity": N}` for each, then passes the whole list through
`json` so it is escaped as the string value the metafield expects. A location the
variant isn't stocked at produces no entry, which the theme reads as out of
stock — the correct answer.

`| json` on the location name rather than bare `{{ }}` matters: it quotes and
escapes the name, so a location containing an apostrophe or quote can't break
the JSON.

Turn the workflow on.

## 3. Backfill once

The trigger in step 2 only fires when inventory **changes**, so variants that
sit untouched will never get the metafield and will read out of stock at both
locations forever. They need seeding once.

> **Build this at the product level, not the variant level.** The *Get product
> variant data* action's "Sort data by" dropdown has no **Updated at** — only
> Full Title, ID, Inventory levels available/management/policy/quantity, Name,
> Popular, Position, Relevance, SKU, Title. None of those changes when we write,
> so a variant-level sweep re-processes the same first batch forever. *Get
> product data* **does** offer Updated at, which is why the sweeper below is
> built on products.

### Option A — a scheduled sweeper (`Stock by location — sweeper`)

This does the whole catalogue inside Shopify. No app, no token, no script.

Create a **separate** workflow — leave "Stock by location — live" alone:

```
Stock by location — sweeper
```

**Keep this one.** It starts life as a backfill and then stays on as a safety
net. The live Flow in step 2 fires only on an inventory *change*, and the list of
things that aren't one keeps growing: a product created with stock already set,
a CSV import, activating an item at a **new location** (that creates an inventory
level, not a quantity change — there is no Flow trigger for it at all), an API
write that doesn't fire cleanly, a run where the live Flow errored. Each of those
was found one at a time by being bitten. The sweep fixes all of them, including
whatever turns up next, which is the real argument for keeping it.

Run every 10 minutes until it has been through the catalogue once, then slow to
**hourly**.

**Trigger: Scheduled time**

| Field | Value |
|---|---|
| Start date and time | a few minutes from now |
| Repeat | every **10 minutes** (Flow's minimum) |
| End rule | leave open — this workflow stays on |

**Action 1: Get product data**

| Field | Value |
|---|---|
| Query | leave empty — all products |
| Sort data by | **Updated at**, **Ascending** |
| Maximum number of results | **100** (the ceiling) |

Ascending `updated_at` is the whole trick: the write bumps the product's
timestamp, dropping it to the back of the queue, so each run picks up the next
batch and the workflow walks the catalogue by itself, then wraps and starts over.

**Descending would deadlock it** — the write would make those products the
newest again and the next run would re-read the same ones forever. The live Flow
is what covers recent changes; the sweeper's job is the stale tail.

**Action 2: For each loop (iterate)** over the *Get product data* output.

One mutation per product, rather than one mutation per batch. That matters
because `metafieldsSet` caps at 25 metafields per call: batching forced the run
size down to 4 products, while looping puts each product in its own call and the
cap only bites on a product with 24+ variants.

**Action 3: Send Admin API request** — inside the loop.

Mutation: `metafieldsSet`

Mutation inputs — paste as the entire contents of the box, dropping the
`compareDigest` field Flow's default skeleton includes:

```liquid
{% capture raw %}{"ownerId": {{ getProductDataForeachitem.id | json }}, "namespace": "custom", "key": "stock_synced_at", "type": "single_line_text_field", "value": {{ scheduledAt | json }}},{% for v in getProductDataForeachitem.variants %}{% capture stockJson %}[{% for level in v.inventoryItem.inventoryLevels %}{"name": {{ level.location.name | json }}, "quantity": {{ level.available | default: 0 }}}{% unless forloop.last %}, {% endunless %}{% endfor %}]{% endcapture %}{"ownerId": {{ v.id | json }}, "namespace": "custom", "key": "stock_by_location", "type": "json", "value": {{ stockJson | json }}},{% endfor %}{% endcapture %}
{
  "metafields": [{{ raw | remove_last: "," }}]
}
```

The loop item is `getProductDataForeachitem` — no underscores, confirmed from
Flow's **Add variable** picker. Flow derives these names from step names, so if
the steps get renamed the picker is the only reliable source; guessing has cost
several rounds here already.

If `scheduledAt` is rejected too, it only feeds the marker metafield — replace
`{{ scheduledAt | json }}` with `"synced"`. Paging works the same either way.

### Throughput

100 products per run, every 10 minutes, is **600 products an hour**. This store
is ~5000 variants across ~1000 products, so a full cycle is under two hours.

That is fast enough to be the backfill too: switch it on, leave it at 10-minute
intervals for a couple of hours, and the whole catalogue has metafields without
touching inventory or running anything. Then slow it to **hourly** for steady
state — 100 products an hour, every product refreshed about every 10 hours,
which keeps the `updated_at` churn down.

Variable names are lowercase-first — `getProductData`, confirmed from Flow's own
**Add variable** picker. Shopify's docs show a PascalCase example; that is not
what Flow emits, so don't "correct" it. And `"…is invalid"` on that variable
almost always means the Get step isn't in the workflow yet rather than that the
name is wrong — Flow validates mutation inputs against the steps above.

Entries are emitted with a trailing comma and the last one stripped with
`remove_last`, because nested `forloop.last` can't see across the two loops.

### Why the extra `stock_synced_at` metafield

Paging needs the **product's** `updated_at` to move. Writing a *variant*
metafield may not propagate up to the parent — that is an assumption, and
assumptions have been expensive here. Writing a metafield directly on the product
definitely bumps it, so each product gets one throwaway product-level metafield
stamped with the run time. It guarantees the product falls to the back of the
queue, and doubles as a visible "last synced" marker on the product in admin.

### Check on run two

The second run must list **different products** than the first. If the same four
come round again, the timestamp isn't moving and the sweep is spinning in place.

### The cost of keeping it

It rewrites metafields whether or not anything changed, and every write bumps
`updated_at`. That churn makes product feeds re-sync and scrambles "sort by
recently updated" in admin. Slowing the schedule reduces it by the same factor;
a daily sweep still beats a stale row.

### Option B — nudge the stock

Only worth it if the sweeper can't be made to work. Make Shopify think every
variant's inventory changed and the step 2 Flow does the rest: on the
**Inventory** page filter to one location (Recharge is enough — the Flow writes
*all* locations for a variant whenever it fires), select everything, adjust the
available quantity by **+1**, then select everything again and adjust by **−1**.

Use a relative adjustment, not "set to" — a relative one can't clobber a sale
that lands mid-operation. Stock reads one unit high for the minute between the
two passes, so do it outside busy hours, and don't start what you can't finish:
stopping after the `+1` leaves every count one high.

### Option C — run the backfill script

`scripts/sync-stock-by-location.mjs` writes every variant's metafield directly.

**Getting credentials changed on 1 January 2026.** A new custom app no longer
shows an `shpat_` token anywhere in the Shopify admin. You get a Client ID and
Client secret instead and exchange them for a 24-hour token. The script does the
exchange itself, so you never handle a token.

1. Shopify admin → **Settings** → **Apps** → **Develop apps** →
   **Build apps in Dev Dashboard** (this hands off to
   <https://dev.shopify.com/dashboard>)
2. **Create app**, name it e.g. "Stock sync", **Create**
3. In the app config, set the app URL and webhooks API version, and enter the
   scopes:
   ```
   read_products,write_products,read_inventory,read_locations
   ```
   Then **Release** — Shopify asks twice.
4. **Installs** → **Install app** → choose the store → **Install**
5. App → **Settings** → copy the **Client ID** and **Client secret**

```powershell
$env:SHOPIFY_STORE = "your-store.myshopify.com"
$env:SHOPIFY_CLIENT_ID = "..."
$env:SHOPIFY_CLIENT_SECRET = "..."

node scripts/sync-stock-by-location.mjs --dry-run --limit=5 --verbose   # look
node scripts/sync-stock-by-location.mjs                                 # apply
```

The script warns if the app is missing any of the four scopes, and says so
plainly if the app isn't installed on the store yet — that's the usual cause of
a token exchange failing.

An app created before 2026 still has a working `shpat_` token; set
`SHOPIFY_ADMIN_TOKEN` instead and the exchange is skipped.

Either way this is a one-time job. **Nothing schedules it.** Once the Flow is
on, it owns the data, and the app can be uninstalled.

## 4. New products

The step 2 trigger fires on an inventory *change*, which may not cover a product
created with stock already set. With no sweeper to catch stragglers, close the
gap explicitly. Third workflow:

```
Stock by location — new products
```

**Trigger:** Product created
**Action 1:** Wait — **1 minute**
**Action 2:** Send Admin API request, mutation `metafieldsSet`

```liquid
{% capture raw %}{% for v in product.variants %}{% capture stockJson %}[{% for level in v.inventoryItem.inventoryLevels %}{"name": {{ level.location.name | json }}, "quantity": {{ level.available | default: 0 }}}{% unless forloop.last %}, {% endunless %}{% endfor %}]{% endcapture %}{"ownerId": {{ v.id | json }}, "namespace": "custom", "key": "stock_by_location", "type": "json", "value": {{ stockJson | json }}},{% endfor %}{% endcapture %}
{
  "metafields": [{{ raw | remove_last: "," }}]
}
```

The trigger exposes `product` directly, so there is no Get step and no variable
name to guess.

**Why the wait is only a minute.** Stock assigned *after* creation — later that
day, next week — is a quantity change, so the step 2 Flow already handles it.
The only case this workflow covers is a product created with stock already on it
in the same operation, where Shopify may treat the initial set as creation rather
than a change. In that case the numbers are there from the start, so a longer
wait buys nothing; the minute is just breathing room for the inventory levels to
be readable.

**Test whether you need this workflow at all.** Import a test product with stock
and check the diagnostics on its page. If the metafield is populated, the initial
set *did* fire the inventory trigger, the gap doesn't exist on this store, and
this workflow can be deleted.

Verify both of these with a test product:

- **Is the data fresh after the Wait?** If Flow snapshots the product at trigger
  time rather than re-reading when the action runs, the Wait achieves nothing and
  you still get zeros. Fix by inserting a *Get product variant data* step after
  the Wait, filtered to that product, and looping that instead.
- **Products with more than 25 variants will fail** — `metafieldsSet` caps at 25
  metafields per call and this sends one per variant.

## 5. Verify

1. Theme editor → product page → *Stock by location* → tick **Show diagnostics**
2. Change a product's stock at one location in admin
3. Reload that product page — the `metafield custom.stock_by_location:` line
   should list both locations with the new numbers
4. Untick **Show diagnostics** — it renders to customers

## Failure modes

| Symptom | Cause |
|---|---|
| Every product out of stock at both locations | Backfill never ran, or the step 2 Flow is off |
| Backfill Flow keeps processing the same 25 variants | The `updated_at` sort isn't paging. Check the sort is *ascending*, not descending |
| One product stale, others fine | That product's stock hasn't changed since the backfill — harmless, or the Flow errored on that run (check the Flow's activity log) |
| A location missing from the diagnostics | The variant isn't stocked at that location. Correct behaviour, reads as out of stock |
| Location name mismatch | The name in the metafield must match the left side of a line in the block's **Locations** setting |

Flow logs every run under the workflow's activity tab, including the mutation's
`userErrors`. That is the first place to look if numbers stop updating.
