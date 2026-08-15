#!/usr/bin/env node
/**
 * Sync per-location stock into the `custom.stock_by_location` variant metafield.
 *
 * Why this exists
 * ---------------
 * Storefront Liquid cannot read per-location inventory. Its only live source is
 * `variant.store_availabilities`, which Shopify populates only when a location
 * has local pickup enabled — and enabling that shows a pickup option to
 * customers at checkout, which we don't want. So the numbers are pushed in from
 * the Admin API instead, and `snippets/product-stock-locations.liquid` reads the
 * metafield. Nothing about this is visible to customers except the resulting
 * In stock / Out of stock rows.
 *
 * What it writes, per variant:
 *
 *   custom.stock_by_location = [{"name":"Recharge","quantity":4},
 *                               {"name":"Partner Supply","quantity":0}]
 *
 * A location the variant isn't stocked at is simply absent, which the theme
 * reads as out of stock — the correct answer.
 *
 * Setup (one time)
 * ----------------
 * Since 1 January 2026 a new custom app does NOT hand you an `shpat_` token in
 * the Shopify admin. You get a Client ID and Client secret, and exchange them
 * for a 24-hour token via the client credentials grant. This script does that
 * exchange itself — you never have to see a token.
 *
 * 1. Shopify admin → Settings → Apps → Develop apps → Build apps in Dev
 *    Dashboard → Create app. Name it e.g. "Stock sync".
 * 2. In the app config, enter these scopes, then Release (twice — Shopify asks
 *    to confirm):
 *       read_products, write_products, read_inventory, read_locations
 * 3. Back in the app, Installs → Install app → pick the store → Install.
 * 4. App → Settings → copy the Client ID and Client secret.
 *
 * Run (PowerShell)
 * ----------------
 *   $env:SHOPIFY_STORE = "your-store.myshopify.com"
 *   $env:SHOPIFY_CLIENT_ID = "..."
 *   $env:SHOPIFY_CLIENT_SECRET = "..."
 *   node scripts/sync-stock-by-location.mjs --dry-run --limit=5 --verbose
 *   node scripts/sync-stock-by-location.mjs
 *
 * A legacy `shpat_` token from an app created before 2026 still works — set
 * SHOPIFY_ADMIN_TOKEN instead and the exchange is skipped.
 *
 * Needs Node 18+ (uses built-in fetch). No npm install, nothing to build.
 *
 * Flags
 * -----
 *   --dry-run          read and report, write nothing
 *   --limit=N          stop after N products, for a quick test
 *   --verbose          print every variant, not just a summary
 */

const STORE = process.env.SHOPIFY_STORE;
const LEGACY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

/** Filled by resolveToken() before any API call. */
let TOKEN = null;

const NAMESPACE = 'custom';
const KEY = 'stock_by_location';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

if (!STORE || (!LEGACY_TOKEN && !(CLIENT_ID && CLIENT_SECRET))) {
  console.error(
    'Missing credentials.\n\n' +
      '  $env:SHOPIFY_STORE = "your-store.myshopify.com"\n' +
      '  $env:SHOPIFY_CLIENT_ID = "..."\n' +
      '  $env:SHOPIFY_CLIENT_SECRET = "..."\n\n' +
      'Client ID and secret come from the app\'s Settings page in the Dev\n' +
      'Dashboard (dev.shopify.com/dashboard). See the header of this file.\n\n' +
      'A legacy shpat_ token still works: set SHOPIFY_ADMIN_TOKEN instead.'
  );
  process.exit(1);
}

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

/**
 * Custom apps created from 2026 onwards never expose a token in the admin —
 * you trade the client credentials for a short-lived one. Tokens last 24h,
 * which comfortably outlives a single backfill run, so there's no refresh here.
 */
async function resolveToken() {
  if (LEGACY_TOKEN) return LEGACY_TOKEN;

  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Could not get an access token (HTTP ${res.status}): ${body}\n\n` +
        'Most likely the app is not installed on this store yet — Dev Dashboard\n' +
        '→ your app → Installs → Install app. Check the store domain too.'
    );
  }

  const { access_token: token, scope } = JSON.parse(body);
  if (!token) throw new Error(`No access_token in the response: ${body}`);

  const granted = (scope || '').split(',').filter(Boolean);
  const missing = ['read_products', 'write_products', 'read_inventory', 'read_locations'].filter(
    (s) => !granted.includes(s)
  );
  if (missing.length) {
    console.warn(
      `Warning: the app is missing scope(s) ${missing.join(', ')}.\n` +
        'Add them in the Dev Dashboard, Release, then reinstall the app.\n'
    );
  }

  return token;
}

/**
 * One GraphQL call, with a retry on Shopify's throttle error. Shopify returns
 * HTTP 200 for GraphQL-level errors, so the body has to be inspected too.
 */
async function graphql(query, variables = {}, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`HTTP ${res.status} after 5 attempts`);
    const wait = 2 ** attempt * 500;
    console.warn(`  HTTP ${res.status}, retrying in ${wait}ms…`);
    await new Promise((r) => setTimeout(r, wait));
    return graphql(query, variables, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();

  const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
  if (throttled) {
    if (attempt > 5) throw new Error('Throttled after 5 attempts');
    const wait = 2 ** attempt * 1000;
    console.warn(`  Throttled, retrying in ${wait}ms…`);
    await new Promise((r) => setTimeout(r, wait));
    return graphql(query, variables, attempt + 1);
  }

  if (body.errors) {
    throw new Error(JSON.stringify(body.errors, null, 2));
  }

  return body.data;
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 20, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            title
            inventoryItem {
              tracked
              inventoryLevels(first: 20) {
                nodes {
                  location { name }
                  quantities(names: ["available"]) { name quantity }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const SET_MUTATION = `
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

/** Every location this variant is stocked at, with its available count. */
function locationsFor(variant) {
  const levels = variant.inventoryItem?.inventoryLevels?.nodes || [];
  return levels.map((level) => ({
    name: level.location.name,
    quantity: level.quantities?.find((q) => q.name === 'available')?.quantity ?? 0,
  }));
}

/** metafieldsSet takes at most 25 per call. */
async function writeBatch(metafields) {
  const data = await graphql(SET_MUTATION, { metafields });
  const errors = data.metafieldsSet.userErrors;
  if (errors.length) {
    throw new Error(`metafieldsSet rejected the write:\n${JSON.stringify(errors, null, 2)}`);
  }
}

async function main() {
  TOKEN = await resolveToken();
  console.log(`${DRY_RUN ? 'Reading' : 'Syncing'} ${STORE} (API ${API_VERSION})\n`);

  let cursor = null;
  let products = 0;
  let variants = 0;
  let untracked = 0;
  let written = 0;
  const seenLocations = new Set();
  let pending = [];

  while (products < LIMIT) {
    const data = await graphql(PRODUCTS_QUERY, { cursor });
    const page = data.products;

    for (const product of page.nodes) {
      if (products >= LIMIT) break;
      products += 1;

      for (const variant of product.variants.nodes) {
        variants += 1;

        if (!variant.inventoryItem?.tracked) {
          untracked += 1;
          if (VERBOSE) {
            console.log(`  ${product.title} / ${variant.title} — inventory not tracked, skipped`);
          }
          continue;
        }

        const locations = locationsFor(variant);
        locations.forEach((l) => seenLocations.add(l.name));

        if (VERBOSE) {
          const summary = locations.map((l) => `${l.name}=${l.quantity}`).join(', ') || '(nowhere)';
          console.log(`  ${product.title} / ${variant.title} — ${summary}`);
        }

        pending.push({
          ownerId: variant.id,
          namespace: NAMESPACE,
          key: KEY,
          type: 'json',
          value: JSON.stringify(locations),
        });

        if (pending.length === 25) {
          if (!DRY_RUN) await writeBatch(pending);
          written += pending.length;
          pending = [];
          process.stdout.write(`\r  ${written} variants ${DRY_RUN ? 'checked' : 'written'}…`);
        }
      }
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  if (pending.length) {
    if (!DRY_RUN) await writeBatch(pending);
    written += pending.length;
  }

  console.log(`\r${' '.repeat(40)}\r`);
  console.log(`Products:  ${products}`);
  console.log(`Variants:  ${variants} (${untracked} untracked, skipped)`);
  console.log(`Metafield: ${written} ${DRY_RUN ? 'would be written' : 'written'}`);
  console.log(`Locations seen: ${[...seenLocations].join(', ') || '(none)'}`);

  if (seenLocations.size) {
    console.log(
      '\nThose names must match the left side of each line in the theme editor:\n' +
        '  product page → Stock by location → Locations'
    );
  }

  if (DRY_RUN) console.log('\nDry run — nothing was written. Drop --dry-run to apply.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
