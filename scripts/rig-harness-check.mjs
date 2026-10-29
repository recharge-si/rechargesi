// Drives the rig builder harness (scripts/rig-harness.mjs) in one headless Chromium.
//
//   RIG_PLAYWRIGHT=/path/to/node_modules/playwright \
//   RIG_CHROMIUM=/path/to/chrome-headless-shell \
//   RIG_SHOTS=/dir/for/screenshots \
//   RIG_PROTOTYPE=/path/to/recharge-hub/tasks/prototypes/rig-builder.html   (optional, parity table)
//   nice -n 19 node scripts/rig-harness-check.mjs
//
// The theme has no npm; Playwright comes from wherever it is installed. The harness server and
// the browser are started and stopped inside this script. Exit code 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHarness } from './rig-harness.mjs';

const PW = process.env.RIG_PLAYWRIGHT;
const CHROMIUM = process.env.RIG_CHROMIUM;
const SHOTS = process.env.RIG_SHOTS || path.join(process.cwd(), 'rig-shots');
const PROTOTYPE = process.env.RIG_PROTOTYPE;
if (!PW || !CHROMIUM) {
  console.error('Set RIG_PLAYWRIGHT and RIG_CHROMIUM (see the header of this file).');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

async function waitForMemory() {
  for (let i = 0; i < 20; i++) {
    const mem = fs.readFileSync('/proc/meminfo', 'utf8');
    const mb = Number(/MemAvailable:\s+(\d+)/.exec(mem)[1]) / 1024;
    if (mb >= 1500) return;
    console.log(`available memory ${Math.round(mb)} MB < 1500, waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  throw new Error('memory stayed low');
}

const { chromium } = await import(pathToFileURL(path.join(PW, 'index.mjs')).href).catch(() => import(pathToFileURL(path.join(PW, 'index.js')).href));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`);
}

await waitForMemory();
const harness = createHarness();
const origin = await harness.start();
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
let exitCode = 0;
let shotOnError;

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const consoleErrors = [];
  const external = [];
  // The stub answers 4xx/5xx on purpose in the failure scenarios; Chromium logs those as errors.
  page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin && !r.url().startsWith('data:')) external.push(r.url());
  });

  const sc = (patch) => fetch(`${origin}/__scenario`, { method: 'POST', body: JSON.stringify(patch) });
  const log = async () => (await fetch(`${origin}/__log`)).json();
  const count = async (p) => (await log()).filter((l) => l.path === p).length;
  const last = async (p) => (await log()).filter((l) => l.path === p).slice(-1)[0];
  const reset = async () => {
    await fetch(`${origin}/__reset`, { method: 'POST' });
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => customElements.get('rig-builder') && document.querySelector('rig-builder').ready);
  };
  shotOnError = async () => page.screenshot({ path: path.join(SHOTS, 'error-state.png'), fullPage: true });
  const shot = async (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  const noHScroll = (label) =>
    page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth).then((ok) => check(`no horizontal scroll: ${label}`, ok));
  const results$ = page.locator('[data-results]');
  const fillWeight = (v) => page.fill('[data-field="weightKg"]', String(v));
  const build = async (weight = 82) => {
    if (weight != null) await fillWeight(weight);
    await page.click('[data-build]');
    await page.waitForSelector('[data-results] [data-add], [data-results] [data-needs]');
  };
  const text = (sel) => page.locator(sel).first().innerText();
  const tapTargets = async (label) => {
    const small = await page.evaluate(() => {
      const out = [];
      const sel = 'rig-builder button, rig-builder select, rig-builder input:not([type=checkbox]), rig-builder textarea, rig-builder .rig-builder__edit-check';
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()}[${el.dataset.build !== undefined ? 'build' : el.className.split(' ')[0]}] ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.name || '').trim().slice(0, 20)}"`);
      });
      return out;
    });
    check(`tap targets >= 44px: ${label}`, small.length === 0, small.join('; '));
  };

  /* ------------------------------------------------------------ per viewport: layout of every state */
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const tag = `${vp.w}`;

    await reset();
    check(`[${tag}] empty: heading`, (await text('h1')) === 'Build your rig');
    check(`[${tag}] empty: button label`, (await text('[data-build]')) === 'Build my rig');
    check(`[${tag}] empty: no results container shown`, !(await results$.isVisible()));
    check(`[${tag}] empty: placeholder note shown`, await page.locator('[data-empty]').isVisible());
    const box = await page.locator('[data-field="weightKg"]').boundingBox();
    check(`[${tag}] first field visible without scrolling`, box && box.y + box.height <= vp.h, JSON.stringify(box));
    await noHScroll(`${tag} empty`);
    await tapTargets(`${tag} empty`);
    await shot(`${tag}-empty`);

    // long input
    const long = 'x'.repeat(1000);
    await page.fill('[data-text]', long);
    await page.locator('[data-text]').press('End');
    await page.keyboard.type('y');
    const len = await page.$eval('[data-text]', (el) => el.value.length);
    check(`[${tag}] long text: 1001st character refused`, len === 1000, String(len));
    check(`[${tag}] long text: counter 1000 / 1000`, (await text('[data-counter]')) === '1000 / 1000');
    await noHScroll(`${tag} long`);
    await shot(`${tag}-long`);
    await page.fill('[data-text]', '');

    // loading
    await sc({ delayMs: 1600 });
    await fillWeight(82);
    await page.click('[data-build]');
    await page.waitForSelector('[data-results] [data-stage="1"]');
    check(`[${tag}] loading: button disabled`, await page.locator('[data-build]').isDisabled());
    check(`[${tag}] loading: aria-busy`, (await results$.getAttribute('aria-busy')) === 'true');
    check(`[${tag}] loading: first status line`, (await text('[data-stage]')) === 'Reading your description…');
    await shot(`${tag}-loading`);
    await page.waitForSelector('[data-results] [data-stage="2"]', { timeout: 3000 });
    check(`[${tag}] loading: second status line`, (await text('[data-stage]')) === 'Matching gear…');
    await noHScroll(`${tag} loading`);
    await page.waitForSelector('[data-results] [data-add]');
    await sc({ delayMs: 0 });

    // result
    check(`[${tag}] result: aria-busy cleared`, (await results$.getAttribute('aria-busy')) === 'false');
    check(`[${tag}] result: results has aria-live=polite`, (await results$.getAttribute('aria-live')) === 'polite');
    check(`[${tag}] result: focus on results`, await page.evaluate(() => document.activeElement === document.querySelector('[data-results]')));
    check(`[${tag}] result: 6 parts`, (await page.locator('[data-results] .rig-builder__part').count()) === 6);
    check(`[${tag}] result: add button copy`, (await text('[data-add]')) === 'Add 6 parts to cart');
    check(`[${tag}] result: total`, (await text('[data-total]')).replace(/\s/g, '') === '€2,834.00');
    await noHScroll(`${tag} result`);
    await tapTargets(`${tag} result`);
    await shot(`${tag}-result`);

    // chip editor open, all chips
    await page.click('[data-chip="weight"]');
    await shot(`${tag}-result-editing`);
    await tapTargets(`${tag} chip editor`);
    await page.click('[data-chip="owns"]').catch(() => {});
    await noHScroll(`${tag} editing`);

    // owned boom
    await reset();
    await page.click('[data-own="boom"]');
    await build(82);
    check(`[${tag}] owned boom: 5 parts bought, owned row shown`, (await page.locator('[data-owned]').count()) === 1 && (await text('[data-add]')) === 'Add 5 parts to cart');
    await shot(`${tag}-owned`);

    // partial
    await reset();
    await sc({ build: 'partial' });
    await build(82);
    check(`[${tag}] partial: explanation line`, (await text('[data-partial]')) === 'We could build 5 of 6 parts. The base is the one we cannot offer today.');
    check(`[${tag}] partial: button says 5`, (await text('[data-add]')) === 'Add 5 parts to cart');
    check(`[${tag}] partial: missing row`, (await page.locator('[data-missing]').count()) === 1);
    check(`[${tag}] partial: checks line mentions base`, (await text('[data-checks]')).includes('Not checked: base'));
    await noHScroll(`${tag} partial`);
    await shot(`${tag}-partial`);

    // needs one answer
    await reset();
    await page.click('[data-build]');
    await page.waitForSelector('[data-needs]');
    check(`[${tag}] needs: one inline question`, (await text('[data-results]')).includes('how much do you weigh?'));
    check(`[${tag}] needs: no error styling`, (await page.locator('[data-results] [role="alert"]').count()) === 0);
    await noHScroll(`${tag} needs`);
    await shot(`${tag}-needs`);

    // plain mode
    await reset();
    await sc({ explain: 'plain' });
    await build(82);
    await page.click('[data-explain]');
    await page.waitForSelector('[data-plain]');
    check(`[${tag}] plain: calm line`, (await text('[data-plain]')) === 'Short descriptions today. The rig is the same.');
    await noHScroll(`${tag} plain`);
    await shot(`${tag}-plain`);

    // not ready
    await reset();
    await sc({ build: '503' });
    await fillWeight(82);
    await page.click('[data-build]');
    await page.waitForSelector('[data-notready]:not([hidden])');
    check(`[${tag}] not ready: form replaced`, !(await page.locator('[data-form]').isVisible()));
    check(`[${tag}] not ready: collection and contact links`, (await page.locator('[data-notready] a').count()) === 2);
    await noHScroll(`${tag} notready`);
    await shot(`${tag}-notready`);

    // rate limited
    await reset();
    await sc({ build: '429' });
    await fillWeight(82);
    await page.click('[data-build]');
    await page.waitForSelector('[data-results] .rig-builder__note');
    check(`[${tag}] rate limited: minutes from Retry-After`, (await text('[data-results]')).includes('Please try again in 12 minutes'));
    await noHScroll(`${tag} ratelimit`);
    await shot(`${tag}-ratelimit`);

    // network error
    await reset();
    await sc({ build: 'network' });
    await fillWeight(82);
    await page.click('[data-build]');
    await page.waitForSelector('[data-retry]');
    const errText = await text('[data-results]');
    check(`[${tag}] network error: calm copy, no status code or stack`, /We could not reach the shop\./.test(errText) && !/\d{3}|Error|at /.test(errText.replace('Try again', '')), errText);
    await noHScroll(`${tag} error`);
    await shot(`${tag}-error`);
    await sc({ build: 'ok' });
    await page.click('[data-retry]');
    await page.waitForSelector('[data-results] [data-add]');
    check(`[${tag}] network error: Try again recovers`, true);
  }

  /* ------------------------------------------------------------ behaviour at 1440 */
  await page.setViewportSize({ width: 1440, height: 900 });

  // debounce: three quick changes, one request after 300 ms
  await reset();
  // three input events inside one tick, so a slow machine cannot stretch them past the 300 ms debounce
  await page.evaluate(() => {
    const set = (name, v) => {
      const el = document.querySelector(`[data-field="${name}"]`);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('weightKg', '82');
    set('windMinKn', '14');
    set('windMinKn', '13');
  });
  await page.waitForSelector('[data-results] [data-add]');
  check('live: three quick changes, one build', (await count('/apps/rig/build')) === 1, String(await count('/apps/rig/build')));
  check('live: no focus theft on live update', !(await page.evaluate(() => document.activeElement === document.querySelector('[data-results]'))));
  check('live: build body has no text field', !('text' in (await last('/apps/rig/build')).body));
  check('live: answers sent', JSON.stringify((await last('/apps/rig/build')).body.answers) === JSON.stringify({ discipline: 'windsurf', weightKg: 82, skill: 'intermediate', windMinKn: 13, windMaxKn: 25 }), JSON.stringify((await last('/apps/rig/build')).body));
  check('live: explain not called', (await count('/apps/rig/explain')) === 0);
  const buildsBefore = await count('/apps/rig/build');
  // invalid weight: hint, no request
  await fillWeight(400);
  await page.waitForTimeout(450);
  check('invalid weight: hint shown, no request', (await page.locator('[data-hint="weightKg"]').isVisible()) && (await count('/apps/rig/build')) === buildsBefore);
  await fillWeight(82);

  // understood-wrong path: edit chip 82 -> 90, Update rig
  await page.waitForTimeout(1000);
  const n0 = await count('/apps/rig/build');
  await page.click('[data-chip="weight"]');
  await page.fill('[data-edit="weightKg"]', '90');
  check('chip: label follows the edit', (await text('[data-chip="weight"]')).startsWith('90 kg'));
  await page.click('[data-update]');
  await page.waitForFunction((n) => true, n0);
  await page.waitForTimeout(200);
  const lastBuild = await last('/apps/rig/build');
  check('chip edit + Update rig: weightKg 90 sent, one more request', lastBuild.body.answers.weightKg === 90 && (await count('/apps/rig/build')) === n0 + 1, JSON.stringify(lastBuild.body.answers));
  check('chip edit: form field synced', (await page.inputValue('[data-field="weightKg"]')) === '90');

  // alternatives and verify
  const sailPrice = await text('[data-role="base"] .rig-builder__price');
  const totalBefore = await text('[data-total]');
  await page.click('[data-swap="base"]');
  check('alternatives: list opens, aria-expanded', (await page.getAttribute('[data-swap="base"]', 'aria-expanded')) === 'true');
  await page.locator('[data-role="base"] [data-use]').first().click();
  await page.waitForFunction(() => !document.querySelectorAll('[data-role="base"] .rig-builder__name')[0].textContent.startsWith('Euro Pin Base'));
  await page.waitForTimeout(300);
  const verify = await last('/apps/rig/verify');
  check('swap: verify called with chosen variants', verify && verify.body.variantIds.length === 6 && verify.body.variantIds.includes(45500000032), JSON.stringify(verify && verify.body.variantIds));
  check('swap: total updated', (await text('[data-total]')) !== totalBefore && (await text('[data-role="base"] .rig-builder__price')) !== sailPrice);
  await sc({ verify: 'bad' });
  if ((await page.getAttribute('[data-swap="base"]', 'aria-expanded')) !== 'true') await page.click('[data-swap="base"]');
  await page.locator('[data-role="base"] [data-use]').first().click();
  await page.waitForTimeout(400);
  check('swap: a failing check is said plainly, by human name', (await text('[data-results]')).includes('do not fit together: board and rider weight'), await text('[data-checks]'));
  await sc({ verify: 'ok' });

  // explain my rig (AI)
  await reset();
  await build(82);
  await page.click('[data-explain]');
  await page.waitForFunction(() => document.querySelector('[data-role="sail"] .rig-builder__why').textContent.startsWith('Because'));
  const ex = await last('/apps/rig/explain');
  check('explain my rig: requestId sent, no text', ex.body.requestId.startsWith('rb_') && !('text' in ex.body));
  check('explain my rig: AI reasons shown, no plain note', (await page.locator('[data-plain]').count()) === 0);

  // read my text
  await reset();
  await page.fill('[data-text]', '82 kg, third season, freeride at 15 to 25 knots. I already own a boom.');
  check('read my text: button enabled with text', await page.locator('[data-read]').isEnabled());
  await page.click('[data-read]');
  await page.waitForSelector('[data-results] [data-add]');
  const rt = await last('/apps/rig/explain');
  check('read my text: explain called with text', rt.body.text.startsWith('82 kg'));
  check('read my text: form filled from reading', (await page.inputValue('[data-field="weightKg"]')) === '82' && (await page.getAttribute('[data-own="boom"]', 'aria-pressed')) === 'true');
  check('read my text: chips show the reading', (await text('[data-chip="owns"]')).startsWith('Owns a boom'));
  check('read my text: AI reasons applied', (await text('[data-role="sail"] .rig-builder__why')).startsWith('Because'));
  // text without a weight asks one question
  await reset();
  await page.fill('[data-text]', 'I ride freeride');
  await page.click('[data-read]');
  await page.waitForSelector('[data-needs]');
  await page.fill('[data-needs]', '85');
  await page.click('[data-needs-go]');
  await page.waitForSelector('[data-results] [data-add]');
  check('read my text without weight: asks, then builds', (await last('/apps/rig/build')).body.answers.weightKg === 85);
  await reset();
  await sc({ explain: 'notread' });
  await page.fill('[data-text]', 'blah');
  await page.click('[data-read]');
  await page.waitForSelector('[data-needs]');
  check('text not read: calm line', (await text('[data-results]')).includes('We could not read your text'));

  // add to cart
  await reset();
  await build(82);
  await page.click('[data-add]');
  await page.waitForFunction(() => document.getElementById('drawer-state').textContent === 'open');
  const adds = (await log()).filter((l) => l.path === '/cart/add.js');
  const build1 = await last('/apps/rig/build');
  check('cart: exactly one /cart/add.js request', adds.length === 1);
  const items = adds[0].body.items;
  check('cart: 6 items, quantity 1, _rig property', items.length === 6 && items.every((i) => i.quantity === 1 && i.properties._rig.startsWith('rb_') && Number.isInteger(i.id)), JSON.stringify(items[0]));
  check('cart: header count 0 + 6', (await text('#cart-count')) === '6');
  check('cart: asks for the drawer sections to render', adds[0].body.sections === 'cart-drawer,cart-icon-bubble');
  // double press
  await reset();
  await build(82);
  await sc({ delayMs: 700 });
  await page.locator('[data-add]').dblclick({ delay: 20 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('drawer-state').textContent === 'open');
  check('cart: double press sends one request', (await count('/cart/add.js')) === 1, String(await count('/cart/add.js')));
  await sc({ delayMs: 0 });

  // 422 sold out: the page names the part, adds nothing, and asks the hub for a rig without it (excludeVariantIds)
  const SAIL = 45500000004;
  const partIds = () => page.$$eval('[data-results] [data-variant]', (els) => els.map((e) => Number(e.dataset.variant)));
  for (const mode of ['422', '422-silent']) {
    await reset();
    await sc({ soldOutVariant: SAIL });
    await build(82);
    check(`422 (${mode}): first build has no excludeVariantIds`, !('excludeVariantIds' in (await last('/apps/rig/build')).body));
    await sc({ cart: mode });
    const builds0 = await count('/apps/rig/build');
    await page.click('[data-add]');
    await page.waitForSelector('[data-sold-out]');
    await page.waitForTimeout(300);
    check(`422 (${mode}): message names the part`, (await text('[data-sold-out]')) === 'One part just sold out: Aero Ride. We updated your rig.', await text('[data-sold-out]'));
    check(`422 (${mode}): nothing added`, (await text('#cart-count')) === '0' && (await page.locator('#drawer-state').innerText()) === 'closed');
    check(`422 (${mode}): rebuild requested`, (await count('/apps/rig/build')) === builds0 + 1);
    const rb = await last('/apps/rig/build');
    check(`422 (${mode}): rebuild body carries excludeVariantIds [sold-out variant]`, JSON.stringify(rb.body.excludeVariantIds) === JSON.stringify([SAIL]), JSON.stringify(rb.body));
    const ids = await partIds();
    check(`422 (${mode}): the hub's rig has no sold-out variant and the sail is the hub's replacement`, !ids.includes(SAIL) && ids.includes(45500000012) && ids.length === 6 && (await text('[data-add]')) === 'Add 6 parts to cart', JSON.stringify(ids));
    check(`422 (${mode}): no client-side swap, so no verify call`, (await count('/apps/rig/verify')) === 0);
    // the exclusion lasts for the session: a changed answer still sends it
    await fillWeight(84);
    await page.waitForTimeout(600);
    check(`422 (${mode}): later builds keep excluding it`, JSON.stringify((await last('/apps/rig/build')).body.excludeVariantIds) === JSON.stringify([SAIL]) && (await last('/apps/rig/build')).body.answers.weightKg === 84);
    await sc({ cart: 'ok' });
    await page.click('[data-add]');
    await page.waitForFunction(() => document.getElementById('drawer-state').textContent === 'open');
    check(`422 (${mode}): next press adds the updated rig (6 ids, none sold out)`, (await last('/cart/add.js')).body.items.every((i) => i.id !== SAIL));
  }
  // 422 where the part has no alternative: shows a gap
  await reset();
  await build(82);
  await sc({ cart: '422', soldOutVariant: 45500000023 });
  await page.click('[data-add]');
  await page.waitForSelector('[data-missing]');
  check('422 without alternative: gap row and partial line', (await text('[data-add]')) === 'Add 5 parts to cart' && (await page.locator('[data-partial]').count()) === 1);
  check('422 without alternative: exclude sent', JSON.stringify((await last('/apps/rig/build')).body.excludeVariantIds) === JSON.stringify([45500000023]));
  // an older hub ignores excludeVariantIds: the page falls back to swapping an alternative itself
  await reset();
  await sc({ soldOutVariant: 45500000030, ignoreExclude: true });
  await build(82);
  await sc({ cart: '422' });
  await page.click('[data-add]');
  await page.waitForSelector('[data-sold-out]');
  await page.waitForTimeout(500);
  const oldIds = await partIds();
  check('422 on an older hub: exclude was sent, the still-present variant is swapped client-side', JSON.stringify((await last('/apps/rig/build')).body.excludeVariantIds) === JSON.stringify([45500000030]) && !oldIds.includes(45500000030) && oldIds.length === 6, JSON.stringify(oldIds));
  const oldVerify = await last('/apps/rig/verify');
  check('422 on an older hub: the swap is re-verified, with the exclusion', oldVerify && oldVerify.body.variantIds.length === 6 && JSON.stringify(oldVerify.body.excludeVariantIds) === JSON.stringify([45500000030]), JSON.stringify(oldVerify && oldVerify.body));
  await sc({ cart: 'ok', ignoreExclude: false });

  /* ------------------------------------------------------------ what the hub now returns: image, link, vendor, facts, derived, unchecked */
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const tag = `${vp.w}`;
    await reset();
    await build(82);
    const sailRow = page.locator('[data-role="sail"]');
    const img = await sailRow.locator('img.rig-builder__img').first().evaluate((el) => ({ src: el.getAttribute('src'), alt: el.alt, w: el.getAttribute('width'), h: el.getAttribute('height'), lazy: el.loading }));
    check(`[${tag}] part: image, lazy, width/height set, alt = title`, img.src === '/img/45500000004.svg' && img.alt === 'Aero Ride' && img.w === '72' && img.h === '72' && img.lazy === 'lazy', JSON.stringify(img));
    const link = await sailRow.locator('a.rig-builder__name-link').evaluate((el) => ({ href: el.getAttribute('href'), target: el.getAttribute('target'), text: el.textContent }));
    check(`[${tag}] part: title links to productUrl, same tab`, link.href === '/products/aero-ride' && link.target === null && link.text === 'Aero Ride', JSON.stringify(link));
    check(`[${tag}] part: vendor shown`, (await sailRow.locator('.rig-builder__name').innerText()).includes('Point-7'));
    const sailFacts = await sailRow.locator('[data-facts]').innerText();
    check(`[${tag}] part: facts as a compact spec line`, sailFacts.includes('Sail area 5.8 m²') && sailFacts.includes('Boom range 170–190 cm') && sailFacts.split('\n').length === 1, sailFacts);
    check(`[${tag}] part: price shown`, (await sailRow.locator('.rig-builder__price').innerText()).replace(/\s/g, '') === '€619.00');
    check(`[${tag}] derived: marker only on derived facts, with the note`, (await sailRow.locator('[data-derived-note]').count()) === 0 && (await page.locator('[data-role="mast"] [data-derived-note]').innerText()) === '* from the product title' && (await page.locator('[data-role="mast"] .rig-builder__derived').count()) === 3);
    check(`[${tag}] derived: marker is announced to screen readers`, (await page.locator('[data-role="mast"] .visually-hidden').first().textContent()).includes('from the product title'));
    // alternatives carry the same fields
    await page.click('[data-swap="base"]');
    const alt = page.locator('[data-role="base"] .rig-builder__alt').nth(1);
    const altImg = await alt.locator('img').evaluate((el) => ({ alt: el.alt, src: el.getAttribute('src') }));
    check(`[${tag}] alternatives: image, link, vendor, price, facts`, altImg.alt === 'Tendon Base' && (await alt.locator('a').getAttribute('href')) === '/products/tendon-base' && (await alt.innerText()).includes('Point-7') && (await alt.innerText()).includes('€49.00') && (await alt.innerText()).includes('Base connection tendon'), await alt.innerText());
    const bare = page.locator('[data-role="base"] .rig-builder__alt').first();
    check(`[${tag}] alternatives: an alternative without vendor or facts still renders`, (await bare.innerText()).includes('Base no data') && (await bare.locator('[data-use]').count()) === 1);
    await noHScroll(`${tag} alternatives open`);
    await tapTargets(`${tag} alternatives open`);
    await shot(`${tag}-details-alternatives`);
    await page.click('[data-swap="base"]');
    await noHScroll(`${tag} details`);
    await shot(`${tag}-details`);

    // no image: a neutral block, nothing broken
    await reset();
    await sc({ build: 'noimage' });
    await build(82);
    check(`[${tag}] no image: placeholder block, no img for that part`, (await page.locator('[data-role="board"] img').count()) === 0 && (await page.locator('[data-role="board"] div.rig-builder__img').count()) === 1);

    // honest checks: every check ran
    await reset();
    await build(82);
    const all = await text('[data-checks]');
    check(`[${tag}] checks: one calm sentence with human names, no unchecked part`, all.startsWith('Checked: sail size for you') && all.includes('board and sail range') && all.includes('fin box') && !all.includes('Not checked'), all);
    // honest checks: some could not run
    await reset();
    await sc({ build: 'unchecked' });
    await build(82);
    const un = await text('[data-checks]');
    check(`[${tag}] unchecked: sentence says what ran and what the shop has no data for`, /^Checked: .*\. Not checked \(the shop has no data for it\): sail and mast diameter · sail and mast length · boom range\.$/.test(un.replace(/\n/g, ' ')), un);
    check(`[${tag}] unchecked: nothing claims the rig is verified`, !/verified|all checks|fully/i.test(await text('[data-results]')));
    await noHScroll(`${tag} unchecked`);
    await shot(`${tag}-unchecked`);
    // a swap re-verifies; the sentence follows what verify says
    await page.click('[data-swap="base"]');
    await page.locator('[data-role="base"] [data-use]').first().click();
    await page.waitForTimeout(400);
    check(`[${tag}] unchecked: still shown after a swap and re-verify`, (await text('[data-checks]')).includes('Not checked (the shop has no data for it)'));

    // an older hub: no image/link/vendor/facts/derived/unchecked fields at all
    await reset();
    await sc({ build: 'legacy' });
    await build(82);
    check(`[${tag}] older hub: 6 parts render, add button works`, (await page.locator('[data-results] .rig-builder__part').count()) === 6 && (await text('[data-add]')) === 'Add 6 parts to cart');
    check(`[${tag}] older hub: no facts, no derived marker, no vendor, no unchecked sentence`, (await page.locator('[data-facts], [data-derived-note], .rig-builder__vendor').count()) === 0 && !(await text('[data-checks]')).includes('Not checked'));
    check(`[${tag}] older hub: old spec line and the url/image keys still used`, (await text('[data-role="sail"] .rig-builder__spec')).includes('5.8 m') && (await page.locator('[data-role="sail"] a.rig-builder__name-link').getAttribute('href')) === '/products/aero-ride-5-8' && (await page.locator('[data-role="sail"] img').getAttribute('src')) === '/img/45500000005.svg');
    check(`[${tag}] older hub: checked sentence uses human names`, (await text('[data-checks]')).startsWith('Checked: '), await text('[data-checks]'));
    await noHScroll(`${tag} older hub`);
    await shot(`${tag}-legacy`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  {
    // Slovenian, same strings in the other file
    await fetch(`${origin}/__reset`, { method: 'POST' });
    await sc({ build: 'unchecked' });
    await page.goto(`${origin}/?lang=sl`);
    await page.waitForFunction(() => document.querySelector('rig-builder').ready);
    await page.fill('[data-field="weightKg"]', '82');
    await page.click('[data-build]');
    await page.waitForSelector('[data-add]');
    check('sl: checked and not-checked sentences', /^Preverjeno: .*Nepreverjeno \(trgovina nima podatkov\): /.test((await text('[data-checks]')).replace(/\n/g, ' ')), await text('[data-checks]'));
    check('sl: derived note', (await page.locator('[data-derived-note]').first().innerText()) === '* iz naslova izdelka');
  }
  // cart failure
  await reset();
  await build(82);
  await sc({ cart: '500' });
  await page.click('[data-add]');
  await page.waitForSelector('[data-results] [role="alert"]');
  check('cart error: calm copy', (await text('[data-results] [role="alert"]')).includes('We could not add the rig to your cart'));

  /* ------------------------------------------------------------ keyboard */
  await reset();
  await page.focus('h1').catch(() => {});
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const order = [];
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => { const a = document.activeElement; return a.dataset.field || (a.dataset.own ? `own:${a.dataset.own}` : a.hasAttribute('data-text') ? 'text' : a.hasAttribute('data-build') ? 'build' : a.hasAttribute('data-read') ? 'read' : a.tagName.toLowerCase()); }));
  }
  const expected = ['weightKg', 'skill', 'windMinKn', 'windMaxKn', 'own:board', 'own:sail', 'own:boom', 'own:fin', 'text', 'build'];
  const start = order.indexOf('weightKg');
  check('keyboard: tab order is variant C visual order (fields, chips, text, build)', start >= 0 && expected.every((e, i) => order[start + i] === e), order.join(' > '));
  await page.fill('[data-field="weightKg"]', '82');
  await page.focus('[data-field="weightKg"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-results] [data-add]');
  check('keyboard: Enter in a field submits', (await count('/apps/rig/build')) === 1);
  check('keyboard: focus lands on results', await page.evaluate(() => document.activeElement === document.querySelector('[data-results]')));
  await page.keyboard.press('Tab');
  check('keyboard: next Tab reaches the results controls', await page.evaluate(() => !!document.activeElement.closest('[data-results]') && document.activeElement.tagName === 'BUTTON'));
  await page.fill('[data-text]', '82 kg intermediate');
  await page.focus('[data-text]');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  check('keyboard: Ctrl+Enter in the textarea reads the text', (await count('/apps/rig/explain')) === 1);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('rig-builder button, rig-builder input, rig-builder select, rig-builder textarea')].filter((el) => el.getBoundingClientRect().width && !(el.getAttribute('aria-label') || (el.labels && el.labels.length) || el.textContent.trim() || el.getAttribute('aria-labelledby'))).map((el) => el.outerHTML.slice(0, 80)));
  check('every control has an accessible name', unnamed.length === 0, unnamed.join('; '));
  // chip editors are keyboard operable
  await reset();
  await build(82);
  await page.focus('[data-chip="weight"]');
  await page.keyboard.press('Enter');
  check('keyboard: chip opens its editor and focuses it', await page.evaluate(() => document.activeElement.dataset.edit === 'weightKg'));

  /* ------------------------------------------------------------ Slovenian, no missing strings */
  await fetch(`${origin}/__reset`, { method: 'POST' });
  await page.goto(`${origin}/?lang=sl`);
  await page.waitForFunction(() => document.querySelector('rig-builder').ready);
  check('sl: heading and button', (await text('h1')) === 'Sestavi svojo opremo' && (await text('[data-build]')) === 'Sestavi mojo opremo');
  await noHScroll('sl empty');
  await page.fill('[data-field="weightKg"]', '82');
  await page.click('[data-build]');
  await page.waitForSelector('[data-add]');
  check('sl: result copy plural', (await text('[data-add]')) === 'Dodaj 6 delov v košarico', await text('[data-add]'));
  await page.setViewportSize({ width: 390, height: 844 });
  await noHScroll('sl result 390');
  await shot('390-sl-result');
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot('1440-sl-result');

  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no external requests', external.length === 0, external.join(' '));

  /* ------------------------------------------------------------ parity with the prototype */
  if (PROTOTYPE) {
    const SELECTORS = {
      proto: { h1: 'h1', lead: 'p.lead', h2: 'h2', label: 'label', input: '#kg', chip: '.chips .chip', counter: '.counter', privacy: '.privacy', reading: '.reading', part: '.part', role: '.role', name: '.name', spec: '.spec', why: '.why', total: '.total .sum', btn: '.btn:not(.ghost)', note: '.checks', disclaimer: '.disclaimer' },
      rig: { h1: '.rig-builder__title', lead: '.rig-builder__lead', h2: '.rig-builder__h2', label: '.rig-builder__label', input: '[data-field="weightKg"]', chip: '.rig-builder__chips .rig-builder__chip', counter: '.rig-builder__counter', privacy: '.rig-builder__privacy', reading: '.rig-builder__reading', part: '.rig-builder__part', role: '.rig-builder__role', name: '.rig-builder__name', spec: '.rig-builder__spec', why: '.rig-builder__why', total: '.rig-builder__sum', btn: '[data-add]', note: '.rig-builder__checks', disclaimer: '.rig-builder__disclaimer' },
    };
    const PROPS = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'marginBottom', 'minHeight'];
    const collect = (page, sels) =>
      page.evaluate(
        ({ sels, PROPS }) => {
          const out = {};
          for (const [k, sel] of Object.entries(sels)) {
            const el = document.querySelector(sel);
            if (!el) { out[k] = null; continue; }
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            out[k] = { ...Object.fromEntries(PROPS.map((p) => [p, cs[p]])), height: Math.round(r.height), width: Math.round(r.width) };
          }
          return out;
        },
        { sels, PROPS }
      );
    const parity = {};
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: w === 1440 ? 900 : 844 });
      const proto = await context.newPage();
      await proto.setViewportSize({ width: w, height: w === 1440 ? 900 : 844 });
      await proto.goto(pathToFileURL(PROTOTYPE).href);
      await proto.selectOption('#state', 'result');
      await proto.waitForSelector('.part');
      await proto.screenshot({ path: path.join(SHOTS, `proto-${w}-result.png`), fullPage: true });
      await proto.selectOption('#state', 'empty');
      await proto.screenshot({ path: path.join(SHOTS, `proto-${w}-empty.png`), fullPage: true });
      await proto.selectOption('#state', 'result');
      const pm = await collect(proto, SELECTORS.proto);
      const order = await proto.$$eval('h1, h2, .reading .label, .rig .role, .total .sum, .total .btn, .checks, .disclaimer', (els) => els.map((e) => e.textContent.trim().slice(0, 40)));
      const pcopy = await proto.evaluate(() => document.querySelector('#stage').innerText);
      await proto.close();

      await page.goto(`${origin}/`);
      await page.waitForFunction(() => document.querySelector('rig-builder').ready);
      await page.fill('[data-field="weightKg"]', '82');
      await page.click('[data-own="boom"]');
      await page.click('[data-build]');
      await page.waitForSelector('[data-add]');
      const rm = await collect(page, SELECTORS.rig);
      const rcopy = await page.evaluate(() => document.querySelector('main').innerText);
      parity[w] = { pm, rm, pcopyLen: pcopy.length, rcopyLen: rcopy.length, order };
      fs.writeFileSync(path.join(SHOTS, `parity-${w}.json`), JSON.stringify({ proto: pm, rig: rm, protoText: pcopy, rigText: rcopy, protoOrder: order }, null, 2));
    }
  }
} catch (e) {
  console.error(e);
  await shotOnError?.().catch(() => {});
  exitCode = 1;
} finally {
  await browser.close();
  await harness.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
process.exit(exitCode || (failed.length ? 1 : 0));
