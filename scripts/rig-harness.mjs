// Static harness for the rig builder page. No Shopify CLI, no npm install in the theme.
//
// It renders sections/rig-builder.liquid with a small Liquid subset (enough for that one file;
// it throws on a translation key that is missing in the chosen locale), serves the theme's
// assets, and stubs the hub's App Proxy (/apps/rig/*) and the cart (/cart/add.js, /cart.js)
// from recorded fixtures in scripts/rig-fixtures/ (copied from recharge-hub
// tests/fixtures/rig/api). Nothing leaves localhost.
//
//   node scripts/rig-harness.mjs            serve on http://127.0.0.1:4747 for manual use
//   ?lang=sl                                 Slovenian copy
//   GET/POST /__scenario                     read/set the stub's behaviour (see DEFAULTS)
//   GET /__log, POST /__reset                request log, reset
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/rig-fixtures', `${name}.json`), 'utf8'));
const readJsonc = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\/\*[\s\S]*?\*\//, ''));

export const DEFAULTS = {
  delayMs: 0,
  build: 'ok', // ok | partial | 503 | 429 | network | 400
  explain: 'ai', // ai | plain | 503 | 429 | network | notread
  verify: 'ok', // ok | bad
  cart: 'ok', // ok | 422 | 422-silent | 500
  soldOutVariant: 45500000015, // the mast; used by cart 422 and /products/*.js
  retryAfter: 720,
};

/* ---------------------------------------------------------------- tiny Liquid */

function plural(lang, n) {
  return new Intl.PluralRules(lang).select(n);
}

function lookup(locale, key) {
  let v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), locale);
  if (v === undefined) throw new Error(`missing translation: ${key}`);
  return v;
}

function translate(locale, lang, key, args) {
  let v = lookup(locale, key);
  if (typeof v === 'object') v = v[plural(lang, Number(args.count))] || v.other;
  return v.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, n) => (n in args ? String(args[n]) : ''));
}

function parseArgs(src, vars) {
  const args = {};
  if (!src) return args;
  for (const m of src.matchAll(/(\w+)\s*:\s*('([^']*)'|(\d+)|(\w+))/g)) {
    args[m[1]] = m[3] !== undefined ? m[3] : m[4] !== undefined ? Number(m[4]) : vars[m[5]];
  }
  return args;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderSection(lang = 'en') {
  const locale = readJsonc(lang === 'sl' ? 'locales/sl.json' : 'locales/en.default.json');
  let src = fs.readFileSync(path.join(ROOT, 'sections/rig-builder.liquid'), 'utf8');
  const vars = { heading: translate(locale, lang, 'rig_builder.heading', {}), intro: translate(locale, lang, 'rig_builder.intro', {}), 'section.id': 'harness', 'section.settings.color_scheme': 'scheme-1', contact_url: 'mailto:info@recharge.si' };

  src = src.replace(/\{%\s*schema\s*%\}[\s\S]*?\{%\s*endschema\s*%\}/, '');
  src = src.replace(/\{%-?\s*style\s*-?%\}[\s\S]*?\{%-?\s*endstyle\s*-?%\}/, '');
  src = src.replace(/\{%-?\s*liquid[\s\S]*?-?%\}/, '');
  src = src.replace(/^\{\{ '[^']+' \| asset_url \| (stylesheet_tag) \}\}\n/gm, '');
  src = src.replace(/^<script src=.*rig-builder\.js.*<\/script>\n/m, '');
  // The role chips loop.
  src = src.replace(/\{%-\s*for role in '([^']+)' split: ','\s*-%\}([\s\S]*?)\{%-\s*endfor\s*-%\}/, (m, list, body) =>
    list
      .split(',')
      .map((role) =>
        body
          .replace(/\{%-\s*assign own_key[^%]*-%\}/, '')
          .replace('{{ own_key | t }}', esc(translate(locale, lang, `rig_builder.own_${role}`, {})))
          .replace(/\{\{ role \}\}/g, role)
      )
      .join('')
  );
  // Captured links: first branch of each if/else (a fallback collection is set).
  src = src.replace(/\{%-\s*capture (\w+)\s*-%\}([\s\S]*?)\{%-\s*endcapture\s*-%\}/g, (m, name, body) => {
    body = body.replace(/\{%-\s*if [^%]*-%\}([\s\S]*?)\{%-\s*else\s*-%\}[\s\S]*?\{%-\s*endif\s*-%\}/, '$1');
    body = body.replace('{{ fallback.url }}', '/collections/windsurf').replace('{{ fallback.title | escape }}', 'Windsurf');
    body = body.replace(/\{\{ 'rig_builder\.(\w+)' \| t \}\}/g, (mm, k) => esc(translate(locale, lang, `rig_builder.${k}`, {})));
    body = body.replace('{{ contact_url }}', vars.contact_url).trim();
    vars[name] = body;
    return '';
  });
  // Output tags.
  src = src.replace(/\{\{-?\s*([^}]+?)\s*-?\}\}/g, (m, expr) => {
    const parts = expr.split('|').map((p) => p.trim());
    let [head, ...filters] = parts;
    let value;
    const tIdx = filters.findIndex((f) => f === 't' || f.startsWith('t:'));
    if (/^'.*'$/.test(head) && tIdx >= 0) {
      const f = filters[tIdx];
      const args = parseArgs(f.includes(':') ? f.slice(f.indexOf(':') + 1) : '', vars);
      value = translate(locale, lang, head.slice(1, -1), args);
      filters = filters.filter((_, i) => i !== tIdx);
    } else if (head in vars) {
      value = vars[head];
    } else if (head === 'locale_code') {
      value = lang;
    } else if (head === 'cart.currency.iso_code') {
      value = 'EUR';
    } else if (head === 'section.id') {
      value = 'harness';
    } else {
      throw new Error(`harness cannot render {{ ${expr} }}`);
    }
    for (const f of filters) {
      if (f === 'escape') value = esc(value);
      else if (f === 'json') value = JSON.stringify(value);
      else throw new Error(`harness cannot apply filter ${f}`);
    }
    return value;
  });
  if (/\{%/.test(src)) throw new Error(`unrendered Liquid tag left: ${src.match(/\{%[^%]*%\}/)[0]}`);
  return src;
}

function page(lang) {
  const body = renderSection(lang);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rig builder harness</title>
<style>
  :root { --font-body-scale: 1; --font-heading-scale: 1; --page-width: 120rem;
    --font-body-family: system-ui, -apple-system, "Segoe UI", sans-serif; --font-body-style: normal; --font-body-weight: 400;
    --font-heading-family: system-ui, sans-serif; --font-heading-style: normal; --font-heading-weight: 700; }
  html { font-size: 62.5%; }
  body { margin: 0; font-family: var(--font-body-family); font-size: 1.5rem; --color-foreground: 18,18,18; --color-background: 255,255,255; background: rgb(var(--color-background)); color: rgba(var(--color-foreground), 0.75); }
  .color-scheme-1 { --color-foreground: 18,18,18; --color-background: 255,255,255; color: rgb(var(--color-foreground)); background: rgb(var(--color-background)); }
  h1, h2 { font-family: var(--font-heading-family); font-weight: var(--font-heading-weight); }
  .harness-header { display: flex; justify-content: space-between; padding: 1.2rem 1.5rem; border-bottom: 1px solid #ddd; font-size: 1.4rem; }
  .page-width { max-width: var(--page-width); margin: 0 auto; padding: 0 1.5rem; }
  .drawer-state { font-size: 1.2rem; }
</style>
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/component-rig-builder.css">
</head>
<body>
<header class="harness-header"><a href="#" id="cart-icon-bubble">Cart <span id="cart-count" data-testid="cart-count">0</span></a><span>harness (not the real header)</span></header>
<cart-drawer id="cart-drawer" class="drawer"><div id="CartDrawer"><div class="drawer__inner"></div></div><div class="drawer-state" id="drawer-state">closed</div></cart-drawer>
<main>
<div class="shopify-section">
${body}
</div>
</main>
<script>
  window.routes = { cart_add_url: '/cart/add.js', cart_url: '/cart' };
  fetch('/cart.js').then((r) => r.json()).then((c) => { document.getElementById('cart-count').textContent = c.item_count; });
  // Stand-in for the theme's cart-drawer.js: same hooks product-form.js uses.
  customElements.define('cart-drawer', class extends HTMLElement {
    getSectionsToRender() { return [{ id: 'cart-drawer', selector: '#CartDrawer' }, { id: 'cart-icon-bubble' }]; }
    setActiveElement(el) { this.activeElement = el; }
    renderContents(state) {
      document.getElementById('cart-count').textContent = state.item_count_after;
      this.querySelector('.drawer__inner').textContent = state.items.map((i) => i.id).join(',');
      document.getElementById('drawer-state').textContent = 'open';
    }
  });
</script>
<script src="/assets/constants.js"></script>
<script src="/assets/pubsub.js"></script>
<script src="/assets/rig-builder.js"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------------- stub hub */

const BOOM = { role: 'boom', productId: 'gid://shopify/Product/123', variantId: 45500000025, title: 'Carbon Boom 150-190', variantTitle: '150-190', url: '/products/carbon-boom', image: '', price: '299.00', currency: 'EUR', available: true, quantity: 1, why: 'This boom opens from 150 to 190 cm, which covers the sail.', specs: { boomMinCm: 150, boomMaxCm: 190 } };

export function createHarness({ port = 0 } = {}) {
  const state = { scenario: { ...DEFAULTS }, log: [], cartCount: 0 };
  const catalog = new Map(); // variantId -> {title, price, role}

  function buildResponse(answers = {}) {
    if (answers.weightKg == null) return { ...fx('build-response-needs') };
    const base = fx('build-response');
    const owns = answers.owns || [];
    const rig = base.rigs[0];
    let items = rig.items.map((i) => ({ ...i, image: `/img/${i.variantId}.svg` }));
    if (!owns.includes('boom')) items.push({ ...BOOM, image: `/img/${BOOM.variantId}.svg` });
    items = items.filter((i) => !owns.includes(i.role) || i.role === 'mast');
    let unmet = [];
    if (state.scenario.build === 'partial') {
      items = items.filter((i) => i.role !== 'base');
      unmet = [{ role: 'base', reason: 'no_compatible_in_stock' }];
    }
    items.forEach((i) => catalog.set(i.variantId, { title: i.title, price: i.price, role: i.role }));
    rig.alternatives.forEach((a) => catalog.set(a.variantId, { title: a.title, price: a.price, role: a.role }));
    const total = (items.reduce((a, i) => a + Math.round(Number(i.price) * 100), 0) / 100).toFixed(2);
    const profile = {
      ...base.profile,
      weightKg: answers.weightKg,
      skill: answers.skill || base.profile.skill,
      windMinKn: answers.windMinKn ?? base.profile.windMinKn,
      windMaxKn: answers.windMaxKn ?? base.profile.windMaxKn,
      owns,
    };
    return {
      ...base,
      profile,
      rigs: [{ ...rig, items, total, alternatives: rig.alternatives.filter((a) => !owns.includes(a.role)) }],
      unmet,
    };
  }

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const sc = state.scenario;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch (e) {
      body = null;
    }

    if (url.pathname === '/' || url.pathname === '/pages/rig-builder') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.get('lang') === 'sl' ? 'sl' : 'en'));
    }
    if (url.pathname.startsWith('/assets/')) {
      const file = path.join(ROOT, 'assets', path.basename(url.pathname));
      if (!fs.existsSync(file)) return send(res, 404, {});
      const type = file.endsWith('.css') ? 'text/css' : 'text/javascript';
      res.writeHead(200, { 'Content-Type': type });
      return res.end(fs.readFileSync(file));
    }
    if (url.pathname.startsWith('/img/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#ddd"/></svg>');
    }
    if (url.pathname === '/__scenario') {
      if (req.method === 'POST') Object.assign(state.scenario, body || {});
      return send(res, 200, state.scenario);
    }
    if (url.pathname === '/__reset') {
      state.scenario = { ...DEFAULTS };
      state.log = [];
      state.cartCount = 0;
      return send(res, 200, {});
    }
    if (url.pathname === '/__log') return send(res, 200, state.log);
    if (url.pathname === '/cart.js') return send(res, 200, { item_count: state.cartCount });

    state.log.push({ method: req.method, path: url.pathname, body });

    if (/^\/products\/[^/]+\.js$/.test(url.pathname)) {
      const handle = url.pathname.slice(10, -3);
      const hit = [...catalog.entries()].find(([, v]) => v.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === handle);
      const id = hit ? hit[0] : 0;
      return send(res, 200, { variants: [{ id, available: id !== sc.soldOutVariant }] });
    }

    if (url.pathname === '/cart/add.js') {
      await new Promise((r) => setTimeout(r, sc.delayMs));
      if (sc.cart === '422') return send(res, 422, { status: 422, message: 'Cart Error', description: `The product '${catalog.get(sc.soldOutVariant)?.title}' is already sold out.` });
      if (sc.cart === '422-silent') return send(res, 422, { status: 422, message: 'Cart Error', description: 'Some items could not be added.' });
      if (sc.cart === '500') return send(res, 500, {});
      state.cartCount += body.items.length;
      return send(res, 200, { items: body.items.map((i, n) => ({ ...i, key: `k${n}` })), item_count_after: state.cartCount, sections: { 'cart-drawer': '<div class="shopify-section"></div>', 'cart-icon-bubble': '<div class="shopify-section"></div>' } });
    }

    if (url.pathname.startsWith('/apps/rig/')) {
      const which = url.pathname.slice('/apps/rig/'.length);
      await new Promise((r) => setTimeout(r, sc.delayMs));
      const mode = sc[which] ?? 'ok';
      if (mode === 'network') return req.socket.destroy();
      if (mode === '503') return send(res, 503, { code: 'not_ready', reason: 'disabled' });
      if (mode === '429') return send(res, 429, { code: 'rate_limited', retryAfterSeconds: sc.retryAfter }, { 'Retry-After': String(sc.retryAfter) });
      if (mode === '400') return send(res, 400, { code: 'invalid_body', field: 'answers.weightKg', message: 'Too small' });

      if (which === 'build') return send(res, 200, buildResponse(body && body.answers));
      if (which === 'verify') {
        const base = fx('verify-response');
        const ids = body.variantIds;
        const total = (ids.reduce((a, id) => a + Math.round(Number(catalog.get(id)?.price || 0) * 100), 0) / 100).toFixed(2);
        const checks = sc.verify === 'bad' ? base.checks.map((c, n) => (n === 3 ? { ...c, ok: false } : c)) : base.checks;
        return send(res, 200, { ...base, ok: sc.verify !== 'bad', checks, total });
      }
      if (which === 'explain') {
        const text = (body && body.text) || '';
        const answers = (body && body.answers) || {};
        const m = /(\d+)\s*kg/.exec(text);
        const weight = answers.weightKg ?? (m ? Number(m[1]) : undefined);
        const merged = {
          ...answers,
          weightKg: weight,
          skill: answers.skill || (/third season|intermediate/.test(text) ? 'intermediate' : undefined),
          owns: answers.owns || (/boom/.test(text) ? ['boom'] : undefined),
        };
        const built = buildResponse(weight == null ? {} : merged);
        const src = {};
        if (m && answers.weightKg == null) src.weightKg = 'text';
        const profile = { ...built.profile, source: { discipline: 'form', ...src } };
        if (weight == null) return send(res, 200, { requestId: 'rb_0123456789abcdef01234567', profile, needs: ['weightKg'], whys: {}, variantIds: [], mode: 'plain', warnings: [] });
        const items = built.rigs[0].items;
        const plainWhys = Object.fromEntries(items.map((i) => [String(i.variantId), i.why]));
        const aiWhys = Object.fromEntries(items.map((i) => [String(i.variantId), `Because ${i.title} fits you.`]));
        if (sc.explain === 'plain') return send(res, 200, { requestId: built.requestId, profile, needs: [], whys: plainWhys, variantIds: items.map((i) => i.variantId), mode: 'plain', warnings: [{ code: 'mode_plain', message: 'Short descriptions today. The rig is the same.' }] });
        const warnings = sc.explain === 'notread' ? [{ code: 'text_not_read', message: 'x' }] : [];
        return send(res, 200, { requestId: built.requestId, profile, needs: [], whys: aiWhys, variantIds: items.map((i) => i.variantId), mode: 'ai', warnings });
      }
    }
    send(res, 404, { code: 'not_found' });
  });

  return {
    state,
    async start() {
      await new Promise((r) => server.listen(port, '127.0.0.1', r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    async stop() {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = createHarness({ port: 4747 });
  console.log(`rig builder harness on ${await h.start()}  (Ctrl+C to stop)`);
}
