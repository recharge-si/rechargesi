/*
 * <rig-builder>: the AI rig builder page (PRD 4, variant C "Live rig").
 *
 * The engine (plain code in the hub) picks the products; this element only shows them.
 *   POST /apps/rig/build    on every changed answer (debounced), never waits on a model
 *   POST /apps/rig/explain  only on "Explain my rig" and "Read my text"
 *   POST /apps/rig/verify   after a part is swapped for an alternative
 *   POST /cart/add.js       one request with every part, or nothing
 * Contract: recharge-hub docs/rig-builder.md. Strings come from the section as JSON.
 */
if (!customElements.get('rig-builder')) {
  const ROLE_ORDER = ['board', 'sail', 'mast', 'extension', 'boom', 'base', 'fin', 'harness'];
  const OWN_ROLES = ['board', 'sail', 'boom', 'fin'];
  const SKILL_KEY = { intermediate: 'chip_skill_intermediate', beginner: 'chip_skill_beginner', advanced: 'chip_skill_advanced' };
  // Human names for the hub's check ids (docs/rig-builder.md, "Checks"). Older ids stay for older hubs.
  const CHECK_LABEL = {
    'sail-fit': 'check_sail',
    'board-fit': 'check_board',
    'board-sail-range': 'check_board_sail',
    'rider-fit': 'check_rider',
    'sail-mast-diameter': 'check_mast_diameter',
    'sail-mast-rdm': 'check_mast_diameter',
    'sail-mast-length': 'check_mast_length',
    'sail-mast-imcs': 'check_mast_imcs',
    'mast-boom-diameter': 'check_boom_mast',
    'sail-boom-range': 'check_boom',
    'mast-extension-diameter': 'check_extension',
    'mast-extension-type': 'check_extension',
    'extension-base-connection': 'check_base',
    'mast-base-type': 'check_base',
    'fin-box': 'check_fin_box',
    'fin-length': 'check_fin_length',
    'owned-boom': 'check_owned_boom',
  };
  const MAX_EXCLUDED = 50;
  const STAGE_MS = 600;
  const MAX_TEXT = 1000;

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === undefined || kid === null || kid === false) continue;
      el.append(kid);
    }
    return el;
  };

  class RigBuilder extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.init();
    }

    init() {
      this.strings = JSON.parse(this.querySelector('[data-strings]').textContent);
      this.base = this.dataset.proxyBase || '/apps/rig';
      this.lang = (this.dataset.locale || document.documentElement.lang || 'en').toLowerCase();
      this.lang2 = this.lang.slice(0, 2);
      this.currency = this.dataset.currency || 'EUR';
      this.plurals = new Intl.PluralRules(this.lang2);

      this.form = this.querySelector('[data-form]');
      this.split = this.querySelector('[data-split]');
      this.results = this.querySelector('[data-results]');
      this.emptyNote = this.querySelector('[data-empty]');
      this.notReady = this.querySelector('[data-notready]');
      this.textEl = this.querySelector('[data-text]');
      this.counter = this.querySelector('[data-counter]');
      this.buildBtn = this.querySelector('[data-build]');
      this.readBtn = this.querySelector('[data-read]');
      this.fields = {};
      this.querySelectorAll('[data-field]').forEach((el) => (this.fields[el.dataset.field] = el));
      this.ownBtns = [...this.querySelectorAll('[data-own]')];

      this.s = this.blankState();
      this.manual = new Set(); // answers the buyer typed or picked themselves
      this.boardKind = undefined;
      this.excluded = new Set(); // variants the cart said are sold out
      this.requestId = undefined;
      this.seq = 0;
      this.controllers = new Set();
      this.timers = {};

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.build({ user: true });
      });
      this.form.addEventListener('input', (e) => this.onFormInput(e));
      this.form.addEventListener('change', (e) => this.onFormInput(e));
      this.ownBtns.forEach((btn) =>
        btn.addEventListener('click', () => {
          btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
          this.manual.add('owns');
          this.scheduleBuild();
        })
      );
      this.readBtn.addEventListener('click', () => this.readText());
      this.textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (this.textEl.value.trim()) this.readText();
          else this.build({ user: true });
        }
      });
      this.updateCounter();
    }

    /* ------------------------------------------------------------ helpers */

    blankState() {
      return {
        view: 'empty', // empty | loading | result | needs | ratelimit | error | invalid
        busy: { build: false, explain: false, cart: false },
        stage: 1,
        profile: null,
        warnings: [],
        rig: null, // { items, alternatives, total, currency, checks, unchecked }
        unmet: [],
        whys: {},
        mode: null, // explain mode: 'ai' | 'plain' | null
        notice: null, // calm one-liners above the rig
        soldOut: null,
        openAlt: null,
        editing: null,
        draft: null,
        assumed: new Set(),
        retry: null,
        retryMinutes: 1,
        announce: '',
      };
    }

    t(key, vars = {}) {
      return this.fill(this.strings[key] ?? key, vars);
    }

    fill(str, vars) {
      return str.replace(/\[(\w+)\]/g, (m, name) => (name in vars ? String(vars[name]) : m));
    }

    plural(key, n, vars = {}) {
      const set = this.strings[key];
      const text = set[this.plurals.select(n)] || set.other;
      return this.fill(text, { n, ...vars });
    }

    roleName(role) {
      return this.strings[`role_${role}`] || role;
    }

    roleLower(role) {
      return this.roleName(role).toLocaleLowerCase(this.lang2);
    }

    money(amount, currency) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return '';
      try {
        return new Intl.NumberFormat(this.lang, { style: 'currency', currency: currency || this.currency }).format(value);
      } catch (e) {
        return value.toFixed(2);
      }
    }

    cents(amount) {
      return Math.round(Number(amount) * 100) || 0;
    }

    debounceMs() {
      return typeof ON_CHANGE_DEBOUNCE_TIMER !== 'undefined' ? ON_CHANGE_DEBOUNCE_TIMER : 300;
    }

    /* ------------------------------------------------------------ form */

    onFormInput(e) {
      const target = e.target;
      if (target === this.textEl) {
        if (this.textEl.value.length > MAX_TEXT) this.textEl.value = this.textEl.value.slice(0, MAX_TEXT);
        this.updateCounter();
        return;
      }
      const field = target.dataset && target.dataset.field;
      if (!field) return;
      this.manual.add(field);
      this.scheduleBuild();
    }

    updateCounter() {
      const len = this.textEl.value.length;
      this.counter.textContent = `${len} / ${MAX_TEXT}`;
      this.readBtn.disabled = this.textEl.value.trim().length === 0 || this.s.busy.explain;
    }

    scheduleBuild() {
      clearTimeout(this.timers.debounce);
      this.timers.debounce = setTimeout(() => this.build({ user: false }), this.debounceMs());
    }

    setHint(name, show) {
      const hint = this.querySelector(`[data-hint="${name}"]`);
      if (hint) hint.hidden = !show;
      const els =
        name === 'weightKg' ? [this.fields.weightKg] : [this.fields.windMinKn, this.fields.windMaxKn];
      els.forEach((el) => el && (show ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid')));
    }

    /** Current answers from the form, or null when a value is out of range (hint shown, nothing sent). */
    collect(onlyManual = false) {
      const answers = { discipline: 'windsurf' };
      const want = (key) => !onlyManual || this.manual.has(key);
      let valid = true;

      const weightRaw = this.fields.weightKg.value.trim();
      if (weightRaw !== '') {
        const w = Number(weightRaw);
        if (!(w >= 30 && w <= 200)) {
          valid = false;
          this.setHint('weightKg', true);
        } else {
          this.setHint('weightKg', false);
          if (want('weightKg')) answers.weightKg = w;
        }
      } else {
        this.setHint('weightKg', false);
      }

      if (want('skill')) answers.skill = this.fields.skill.value;

      const minRaw = this.fields.windMinKn.value.trim();
      const maxRaw = this.fields.windMaxKn.value.trim();
      const min = Number(minRaw);
      const max = Number(maxRaw);
      const windOk = (v, raw) => raw === '' || (v >= 0 && v <= 60);
      if (!windOk(min, minRaw) || !windOk(max, maxRaw) || (minRaw !== '' && maxRaw !== '' && min > max)) {
        valid = false;
        this.setHint('wind', true);
      } else {
        this.setHint('wind', false);
        if (minRaw !== '' && want('windMinKn')) answers.windMinKn = min;
        if (maxRaw !== '' && want('windMaxKn')) answers.windMaxKn = max;
      }

      const owns = this.ownBtns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.own);
      if (owns.length && want('owns')) answers.owns = owns;
      if (this.boardKind && want('boardKind')) answers.boardKind = this.boardKind;

      return valid ? answers : null;
    }

    /** Write a reading (profile or draft) back into the form without firing input events. */
    syncForm(values) {
      if (values.weightKg != null) this.fields.weightKg.value = values.weightKg;
      if (values.skill) this.fields.skill.value = values.skill;
      if (values.windMinKn != null) this.fields.windMinKn.value = values.windMinKn;
      if (values.windMaxKn != null) this.fields.windMaxKn.value = values.windMaxKn;
      if (values.owns) {
        this.ownBtns.forEach((b) => b.setAttribute('aria-pressed', values.owns.includes(b.dataset.own) ? 'true' : 'false'));
      }
      if (values.boardKind) this.boardKind = values.boardKind;
      this.setHint('weightKg', false);
      this.setHint('wind', false);
    }

    /* ------------------------------------------------------------ network */

    async post(path, body, signal) {
      const res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        json = null;
      }
      return { status: res.status, retryAfter: res.headers.get('Retry-After'), json };
    }

    newController() {
      const ctl = new AbortController();
      this.controllers.add(ctl);
      return ctl;
    }

    abortAll() {
      this.controllers.forEach((c) => c.abort());
      this.controllers.clear();
      clearTimeout(this.timers.stage);
      this.s.busy.build = false;
      this.s.busy.explain = false;
    }

    startStages() {
      this.s.stage = 1;
      clearTimeout(this.timers.stage);
      this.timers.stage = setTimeout(() => {
        if (this.s.busy.build || this.s.busy.explain) {
          this.s.stage = 2;
          this.render();
        }
      }, STAGE_MS);
    }

    /** Turn an HTTP failure into a view. Returns true when it was one. */
    failed(r, retry) {
      if (r.status >= 200 && r.status < 300) return false;
      const s = this.s;
      s.retry = retry;
      // The hub answers 409 (a 5xx would be replaced by Shopify's own error page); the code is what counts.
      if (r.json && r.json.code === 'not_ready') {
        this.showNotReady();
        return true;
      }
      if (r.status === 429) {
        const seconds = Number(r.retryAfter) || (r.json && Number(r.json.retryAfterSeconds)) || 60;
        s.retryMinutes = Math.max(1, Math.ceil(seconds / 60));
        s.view = 'ratelimit';
      } else if (r.status === 400 || r.status === 413) {
        s.view = 'invalid';
      } else {
        s.view = 'error';
      }
      return true;
    }

    showNotReady() {
      this.split.hidden = true;
      this.notReady.hidden = false;
      this.notReady.setAttribute('tabindex', '-1');
      this.notReady.focus();
      this.s.view = 'notready';
    }

    /* ------------------------------------------------------------ build */

    async build({ user = false, keep = null, retryOf = null } = {}) {
      clearTimeout(this.timers.debounce);
      const answers = this.collect();
      if (!answers) return;
      if (!user && answers.weightKg == null) return; // the live rig needs a weight first

      const s = this.s;
      this.abortAll();
      const seq = ++this.seq;
      const ctl = this.newController();
      const hadRig = !!s.rig;
      s.busy.build = true;
      s.soldOut = retryOf ? s.soldOut : null;
      if (!keep) {
        s.whys = {};
        s.mode = null;
        s.notice = null;
      }
      if (!hadRig) s.view = 'loading';
      this.startStages();
      this.render();

      const body = this.withExcluded({ answers, locale: this.lang2 });
      if (this.requestId) body.requestId = this.requestId;

      let r;
      try {
        r = await this.post('/build', body, ctl.signal);
      } catch (e) {
        if (e.name === 'AbortError' || seq !== this.seq) return;
        return this.finish(seq, () => {
          s.view = 'error';
          s.retry = () => this.build({ user: true, keep });
        }, user);
      }
      if (seq !== this.seq) return;
      this.controllers.delete(ctl);

      this.finish(seq, () => {
        if (this.failed(r, () => this.build({ user: true, keep }))) return;
        this.applyBuild(r.json, keep);
      }, user);
    }

    finish(seq, apply, focus) {
      const s = this.s;
      s.busy.build = false;
      clearTimeout(this.timers.stage);
      apply();
      if (focus) this.focusAfter = 'results';
      this.render();
    }

    applyBuild(json, keep) {
      const s = this.s;
      s.profile = json.profile || {};
      s.warnings = json.warnings || [];
      s.openAlt = null;
      s.editing = null;
      if (json.requestId) this.requestId = json.requestId;
      this.initDraft();

      if (json.needs && json.needs.length) {
        s.view = 'needs';
        s.rig = null;
        s.unmet = [];
        return;
      }

      const rig = (json.rigs && json.rigs[0]) || { items: [], alternatives: [], checks: [], total: '0.00', currency: this.currency };
      s.rig = {
        items: rig.items || [],
        alternatives: rig.alternatives || [],
        checks: rig.checks || [],
        unchecked: Array.isArray(rig.unchecked) ? rig.unchecked : [],
        total: rig.total,
        currency: rig.currency || this.currency,
      };
      s.unmet = (json.unmet || []).filter((u) => u.role !== 'budget');
      const swapped = this.applyExcluded();
      if (keep) {
        s.whys = keep.whys || s.whys;
        s.mode = keep.mode || s.mode;
        s.notice = keep.notice || s.notice;
      }
      s.view = 'result';
      s.announce = this.plural('parts_summary', s.rig.items.length);
      if (swapped) this.verify();
    }

    /** Sold-out variants (cart 422) go to the hub as excludeVariantIds, newest last, at most 50. */
    withExcluded(body) {
      if (this.excluded.size) body.excludeVariantIds = [...this.excluded].slice(-MAX_EXCLUDED);
      return body;
    }

    /**
     * Fallback for a hub that ignores excludeVariantIds: a sold-out variant that is still in the
     * response is swapped for an alternative here. With a current hub nothing is left to do.
     */
    applyExcluded() {
      const s = this.s;
      const rig = s.rig;
      let changed = false;
      rig.alternatives = rig.alternatives.filter((a) => !this.excluded.has(a.variantId) && a.available !== false);
      const kept = [];
      rig.items.forEach((item) => {
        if (!this.excluded.has(item.variantId)) return kept.push(item);
        changed = true;
        const alt = rig.alternatives.find((a) => a.role === item.role);
        if (alt) {
          rig.alternatives = rig.alternatives.filter((a) => a !== alt);
          kept.push({ ...alt, quantity: 1, available: true });
        } else {
          s.unmet.push({ role: item.role, reason: 'no_compatible_in_stock' });
        }
      });
      rig.items = kept;
      if (changed) rig.total = this.sum(rig.items);
      return changed;
    }

    sum(items) {
      const cents = items.reduce((a, i) => a + this.cents(i.price) * (i.quantity || 1), 0);
      return (cents / 100).toFixed(2);
    }

    /* ------------------------------------------------------------ explain */

    async explain(mode) {
      const s = this.s;
      if (s.busy.explain) return;
      const text = mode === 'text' ? this.textEl.value.trim() : '';
      if (mode === 'text' && !text) return;
      if (mode === 'rig' && !this.requestId) return;
      const answers = this.collect(mode === 'text');
      if (!answers) return;

      this.abortAll();
      const seq = ++this.seq;
      const ctl = this.newController();
      s.busy.explain = true;
      s.busy.build = false;
      if (!s.rig) s.view = 'loading';
      this.startStages();
      this.updateCounter();
      this.render();

      const body = { answers };
      if (this.requestId) body.requestId = this.requestId;
      if (text) body.text = text;
      body.locale = this.lang2;
      this.withExcluded(body);

      let r;
      try {
        r = await this.post('/explain', body, ctl.signal);
      } catch (e) {
        if (e.name === 'AbortError' || seq !== this.seq) return;
        s.busy.explain = false;
        clearTimeout(this.timers.stage);
        s.view = 'error';
        s.retry = () => this.explain(mode);
        this.updateCounter();
        this.focusAfter = 'results';
        return this.render();
      }
      if (seq !== this.seq) return;
      this.controllers.delete(ctl);
      s.busy.explain = false;
      clearTimeout(this.timers.stage);
      this.updateCounter();

      if (this.failed(r, () => this.explain(mode))) {
        this.focusAfter = 'results';
        return this.render();
      }
      const json = r.json || {};
      if (json.requestId) this.requestId = json.requestId;
      const notice = (json.warnings || []).some((w) => w.code === 'text_not_read') ? this.t('text_not_read') : null;
      const kept = { whys: json.whys || {}, mode: json.mode || 'plain', notice };

      if (mode === 'text' && json.profile) {
        // What the text said goes into the form, then the rig is rebuilt from the form.
        this.syncForm(json.profile);
        const src = json.profile.source || {};
        Object.keys(src).forEach((k) => src[k] === 'text' && this.manual.delete(k));
        if (json.profile.weightKg != null || (json.needs || []).length === 0) {
          return this.build({ user: true, keep: kept });
        }
        s.profile = json.profile;
        s.warnings = json.warnings || [];
        this.initDraft();
        s.view = 'needs';
        s.rig = null;
        s.notice = notice;
        this.focusAfter = 'results';
        return this.render();
      }

      s.whys = kept.whys;
      s.mode = kept.mode;
      s.notice = notice;
      s.view = s.rig ? 'result' : 'empty';
      this.focusAfter = '[data-explain]';
      this.render();
    }

    readText() {
      this.explain('text');
    }

    /* ------------------------------------------------------------ reading chips */

    initDraft() {
      const s = this.s;
      const p = s.profile || {};
      const codes = new Set((s.warnings || []).map((w) => w.code));
      s.assumed = new Set();
      const draft = {
        weightKg: p.weightKg,
        skill: p.skill,
        boardKind: p.boardKind,
        windMinKn: p.windMinKn,
        windMaxKn: p.windMaxKn,
        owns: (p.owns || []).slice(),
      };
      if (!draft.skill && codes.has('skill_assumed')) {
        draft.skill = 'intermediate';
        s.assumed.add('skill');
      }
      if (!draft.boardKind && codes.has('kind_assumed')) {
        draft.boardKind = 'freeride';
        s.assumed.add('kind');
      }
      if (draft.windMinKn == null && codes.has('wind_assumed')) {
        draft.windMinKn = 15;
        draft.windMaxKn = 25;
        s.assumed.add('wind');
      }
      s.draft = draft;
    }

    chipDefs() {
      const d = this.s.draft || {};
      const chips = [];
      if (d.weightKg != null) chips.push({ key: 'weight', label: this.t('chip_weight', { n: d.weightKg }) });
      if (d.skill) chips.push({ key: 'skill', label: this.strings[SKILL_KEY[d.skill]] || d.skill });
      if (d.boardKind) chips.push({ key: 'kind', label: this.strings[`kind_${d.boardKind}`] || d.boardKind });
      if (d.windMinKn != null && d.windMaxKn != null) {
        chips.push({ key: 'wind', label: this.t('chip_wind', { min: d.windMinKn, max: d.windMaxKn }) });
      }
      if (d.owns && d.owns.length) chips.push({ key: 'owns', label: this.ownsLabel(d.owns) });
      return chips;
    }

    ownsLabel(owns) {
      const parts = owns.map((r) => this.roleLower(r)).join(', ');
      return this.t(owns.length === 1 ? 'chip_owns' : 'chip_owns_many', { parts });
    }

    chipValueChanged(key) {
      const node = this.results.querySelector(`[data-chip="${key}"] [data-chip-text]`);
      const chip = this.chipDefs().find((c) => c.key === key);
      if (node && chip) node.textContent = chip.label;
      const small = this.results.querySelector(`[data-chip="${key}"] small`);
      if (small && this.s.assumed.delete(key === 'kind' ? 'kind' : key)) small.textContent = this.strings.edit;
    }

    renderEditor(key) {
      const d = this.s.draft;
      const id = (n) => `Rig-Edit-${this.dataset.sectionId}-${n}`;
      const num = (field, labelKey, min, max, value) =>
        h(
          'div',
          {},
          h('label', { class: 'rig-builder__label', for: id(field) }, this.strings[labelKey]),
          h('input', {
            class: 'rig-builder__input',
            id: id(field),
            type: 'number',
            inputmode: 'numeric',
            min,
            max,
            value: value ?? '',
            'data-edit': field,
            onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), this.applyDraft()),
            oninput: (e) => {
              const v = e.target.value.trim();
              d[field] = v === '' ? undefined : Number(v);
              this.chipValueChanged(key);
            },
          })
        );
      const sel = (field, labelKey, options, value) =>
        h(
          'div',
          {},
          h('label', { class: 'rig-builder__label', for: id(field) }, this.strings[labelKey]),
          h(
            'select',
            {
              class: 'rig-builder__input rig-builder__select',
              id: id(field),
              'data-edit': field,
              onchange: (e) => {
                d[field] = e.target.value;
                this.chipValueChanged(key);
              },
            },
            options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))
          )
        );

      if (key === 'weight') return num('weightKg', 'weight', 30, 200, d.weightKg);
      if (key === 'skill') {
        return sel('skill', 'level', [['intermediate', this.strings.level_improving], ['beginner', this.strings.level_start], ['advanced', this.strings.level_confident]], d.skill);
      }
      if (key === 'kind') {
        return sel('boardKind', 'kind', [['freeride', this.strings.kind_freeride], ['wave', this.strings.kind_wave]], d.boardKind);
      }
      if (key === 'wind') {
        return [num('windMinKn', 'wind_from', 0, 60, d.windMinKn), num('windMaxKn', 'wind_to', 0, 60, d.windMaxKn)];
      }
      const roles = [...new Set([...OWN_ROLES, ...(d.owns || [])])];
      return roles.map((role) =>
        h(
          'label',
          { class: 'rig-builder__edit-check' },
          h('input', {
            type: 'checkbox',
            checked: d.owns.includes(role),
            'data-edit-own': role,
            onchange: (e) => {
              d.owns = e.target.checked ? [...d.owns, role] : d.owns.filter((r) => r !== role);
              const chip = this.results.querySelector('[data-chip="owns"] [data-chip-text]');
              if (chip) chip.textContent = d.owns.length ? this.ownsLabel(d.owns) : this.t('chip_owns_many', { parts: '' });
            },
          }),
          this.roleName(role)
        )
      );
    }

    applyDraft() {
      const d = this.s.draft;
      this.syncForm({ ...d, owns: d.owns || [] });
      ['weightKg', 'skill', 'windMinKn', 'windMaxKn', 'owns', 'boardKind'].forEach((k) => this.manual.add(k));
      this.s.editing = null;
      this.build({ user: true });
    }

    /* ------------------------------------------------------------ alternatives, verify */

    alternativesFor(item) {
      return (this.s.rig.alternatives || []).filter(
        (a) => a.role === item.role && a.variantId !== item.variantId && a.available !== false && !this.excluded.has(a.variantId)
      );
    }

    swap(item, alt) {
      const rig = this.s.rig;
      const idx = rig.items.indexOf(item);
      if (idx < 0) return;
      rig.items[idx] = { ...alt, quantity: 1, available: true };
      rig.alternatives = rig.alternatives.filter((a) => a !== alt);
      const { quantity, available, ...demoted } = item;
      rig.alternatives.push(demoted);
      rig.total = this.sum(rig.items);
      this.s.openAlt = item.role;
      this.focusAfter = `[data-swap="${item.role}"]`;
      this.render();
      this.verify();
    }

    async verify() {
      const s = this.s;
      const ids = s.rig.items.map((i) => i.variantId);
      const answers = this.collect() || { discipline: 'windsurf' };
      const seq = this.seq;
      try {
        const r = await this.post('/verify', this.withExcluded({ variantIds: ids, answers, locale: this.lang2 }));
        if (seq !== this.seq || r.status !== 200 || !r.json) return;
        if (ids.join() !== s.rig.items.map((i) => i.variantId).join()) return; // swapped again meanwhile
        s.rig.checks = r.json.checks || [];
        s.rig.unchecked = Array.isArray(r.json.unchecked) ? r.json.unchecked : [];
        if (r.json.total) s.rig.total = r.json.total;
        this.render();
      } catch (e) {
        /* keep the local total and the earlier checks */
      }
    }

    /* ------------------------------------------------------------ cart */

    async addToCart() {
      const s = this.s;
      if (s.busy.cart || !s.rig || !s.rig.items.length) return;
      s.busy.cart = true;
      s.cartError = false;
      const addBtn = this.results.querySelector('[data-add]');
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.setAttribute('aria-disabled', 'true');
        addBtn.textContent = this.strings.adding;
      }

      const items = s.rig.items.map((i) => ({ id: i.variantId, quantity: 1, properties: { _rig: this.requestId } }));
      const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
      const body = { items };
      if (cart) {
        body.sections = cart.getSectionsToRender().map((section) => section.id).join(',');
        body.sections_url = window.location.pathname;
      }
      const addUrl = (window.routes && window.routes.cart_add_url) || '/cart/add.js';

      let res;
      let json = null;
      try {
        res = await fetch(addUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(body),
        });
        json = await res.json().catch(() => null);
      } catch (e) {
        s.busy.cart = false;
        s.cartError = true;
        this.focusAfter = 'results';
        return this.render();
      }

      if (res.status === 422) return this.soldOut(json, items);
      if (!res.ok || !json) {
        s.busy.cart = false;
        s.cartError = true;
        this.focusAfter = 'results';
        return this.render();
      }

      s.busy.cart = false;
      s.announce = this.plural('added', items.length);
      this.render();
      if (cart && cart.setActiveElement) cart.setActiveElement(this.results.querySelector('[data-add]'));
      try {
        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'rig-builder', productVariantId: items[0].id, cartData: json });
        }
        if (cart && cart.renderContents && json.sections) {
          const last = (json.items || []).slice(-1)[0];
          cart.renderContents({ ...json, id: last && last.id, key: last && last.key });
        } else {
          window.location = (window.routes && window.routes.cart_url) || '/cart';
        }
      } catch (e) {
        window.location = (window.routes && window.routes.cart_url) || '/cart';
      }
    }

    /** 422: nothing was added. Find the part and rebuild with it in excludeVariantIds (sent from now on). */
    async soldOut(json, items) {
      const s = this.s;
      const rigItems = s.rig.items.slice();
      const text = `${(json && (json.description || json.message)) || ''}`.toLowerCase();
      let gone = rigItems.filter((i) => i.title && text.includes(i.title.toLowerCase()));
      if (gone.length !== 1) gone = await this.findUnavailable(rigItems);
      if (!gone.length) gone = [];
      gone.forEach((i) => this.excluded.add(i.variantId));
      s.busy.cart = false;
      s.soldOut = gone.length ? gone.map((i) => i.title).join(', ') : null;
      s.cartError = gone.length === 0;
      s.rig.alternatives = s.rig.alternatives.filter((a) => !this.excluded.has(a.variantId));
      if (gone.length) {
        await this.build({ user: true, keep: {}, retryOf: true });
        s.soldOut = gone.map((i) => i.title).join(', ');
        this.render();
      } else {
        this.focusAfter = 'results';
        this.render();
      }
    }

    /** The storefront's own product JSON tells which chosen variants are unavailable now. */
    async findUnavailable(rigItems) {
      const gone = [];
      await Promise.all(
        rigItems.map(async (item) => {
          if (!item.url || !item.url.startsWith('/')) return;
          try {
            const res = await fetch(`${item.url.split('?')[0]}.js`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return;
            const product = await res.json();
            const variant = (product.variants || []).find((v) => v.id === item.variantId);
            if (variant && variant.available === false) gone.push(item);
          } catch (e) {
            /* ignore, the next press tells the buyer again */
          }
        })
      );
      return gone;
    }

    /* ------------------------------------------------------------ render */

    render() {
      const s = this.s;
      const showResults = s.view !== 'empty' && s.view !== 'notready';
      this.emptyNote.hidden = showResults;
      this.results.hidden = !showResults;
      this.results.setAttribute('aria-busy', s.busy.build || s.busy.explain ? 'true' : 'false');
      this.buildBtn.disabled = s.busy.build || s.busy.explain;
      this.updateCounter();
      if (!showResults) return;

      const kids = [];
      switch (s.view) {
        case 'loading':
          kids.push(this.renderSkeleton());
          break;
        case 'needs':
          kids.push(this.renderNeeds());
          break;
        case 'ratelimit':
          kids.push(h('div', { class: 'rig-builder__note', role: 'status' }, this.plural('rate_limited', s.retryMinutes, { minutes: s.retryMinutes })));
          break;
        case 'error':
          kids.push(this.renderError(this.t('error_network')));
          break;
        case 'invalid':
          kids.push(this.renderError(this.t('error_input')));
          break;
        default:
          if (!s.rig) {
            this.results.hidden = true;
            this.emptyNote.hidden = false;
            return;
          }
          kids.push(...this.renderResult());
      }
      this.results.replaceChildren(...kids);

      const target = this.focusAfter;
      this.focusAfter = null;
      if (target === 'results') this.results.focus({ preventScroll: false });
      else if (target) {
        const el = this.results.querySelector(target);
        if (el) el.focus();
        else this.results.focus();
      }
    }

    renderSkeleton() {
      const row = () =>
        h(
          'div',
          { class: 'rig-builder__part rig-builder__skeleton' },
          h('div', { class: 'rig-builder__img' }),
          h('div', {}, h('div', { class: 'rig-builder__bar', style: 'width:30%' }), h('div', { class: 'rig-builder__bar', style: 'width:70%' }), h('div', { class: 'rig-builder__bar', style: 'width:55%' })),
          h('div', { class: 'rig-builder__bar', style: 'width:60px' })
        );
      return h(
        'section',
        { 'aria-busy': 'true', 'aria-label': this.strings.loading_label },
        h('p', { class: 'rig-builder__status', role: 'status', 'data-stage': this.s.stage }, this.s.stage === 1 ? this.strings.loading_read : this.strings.loading_match),
        h('div', { class: 'rig-builder__rig' }, [1, 2, 3, 4, 5].map(row)),
        h('p', {}, h('button', { type: 'button', class: 'rig-builder__link', 'data-cancel': '', onclick: () => this.cancel() }, this.strings.cancel))
      );
    }

    cancel() {
      const s = this.s;
      this.abortAll();
      this.seq++;
      s.busy = { build: false, explain: false, cart: false };
      s.view = s.rig ? 'result' : 'empty';
      this.render();
      this.buildBtn.focus();
    }

    renderError(message) {
      const retry = this.s.retry;
      return h(
        'div',
        { class: 'rig-builder__note rig-builder__note--attn', role: 'alert' },
        message + ' ',
        retry && h('button', { type: 'button', class: 'rig-builder__btn rig-builder__btn--ghost', 'data-retry': '', onclick: () => retry() }, this.strings.try_again)
      );
    }

    renderNeeds() {
      const s = this.s;
      const id = `Rig-Needs-${this.dataset.sectionId}`;
      const input = h('input', { class: 'rig-builder__input', id, type: 'number', inputmode: 'numeric', min: 30, max: 200, placeholder: this.strings.needs_unit, 'data-needs': 'weightKg' });
      const go = () => {
        const v = Number(input.value);
        if (!(v >= 30 && v <= 200)) {
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        this.fields.weightKg.value = v;
        this.manual.add('weightKg');
        this.build({ user: true });
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), go()));
      return h(
        'div',
        { class: 'rig-builder__note rig-builder__note--attn', role: 'status' },
        s.notice && h('p', {}, s.notice),
        h('label', { for: id }, this.strings.needs_weight),
        h('div', { class: 'rig-builder__needs-row' }, input),
        h('p', { class: 'rig-builder__needs-actions' }, h('button', { type: 'button', class: 'rig-builder__btn', 'data-needs-go': '', onclick: go }, this.strings.continue))
      );
    }

    renderResult() {
      const s = this.s;
      const rig = s.rig;
      const busy = s.busy.build;
      const out = [];

      out.push(
        h(
          'div',
          { class: 'rig-builder__status' },
          h('span', {}, busy ? this.strings.loading_match : this.strings.live_note),
          h(
            'button',
            { type: 'button', class: 'rig-builder__btn rig-builder__btn--ghost', 'data-explain': '', disabled: s.busy.explain || busy, onclick: () => this.explain('rig') },
            s.busy.explain ? this.strings.explaining : this.strings.explain
          )
        )
      );

      out.push(this.renderReading());

      const owned = (s.profile && s.profile.owns) || [];
      const missing = s.unmet.filter((u) => !owned.includes(u.role));
      if (missing.length) {
        const built = rig.items.length + owned.length;
        const total = built + missing.length;
        const text =
          missing.length === 1
            ? this.t('partial_one', { built, total, role: this.roleLower(missing[0].role) })
            : this.t('partial_many', { built, total, roles: missing.map((u) => this.roleLower(u.role)).join(', ') });
        out.push(h('p', { class: 'rig-builder__note rig-builder__note--attn', 'data-partial': '' }, text));
      }
      if (s.soldOut) out.push(h('p', { class: 'rig-builder__note rig-builder__note--attn', role: 'status', 'data-sold-out': '' }, this.t('sold_out', { title: s.soldOut })));
      if (s.cartError) out.push(this.renderError(this.t('error_cart')));
      if (s.notice) out.push(h('p', { class: 'rig-builder__note' }, s.notice));
      if (s.mode === 'plain') out.push(h('p', { class: 'rig-builder__note', 'data-plain': '' }, this.strings.plain_note));

      out.push(h('section', { 'aria-label': this.strings.rig_label }, this.renderRig(missing), this.renderChecks(missing), h('p', { class: 'rig-builder__disclaimer' }, this.strings.disclaimer)));
      out.push(h('p', { class: 'visually-hidden', role: 'status' }, s.announce || ''));
      return out;
    }

    renderReading() {
      const s = this.s;
      const chips = this.chipDefs();
      const group = h('div', { class: 'rig-builder__reading', role: 'group', 'aria-label': this.strings.reading_group }, h('p', { class: 'rig-builder__reading-label' }, this.strings.reading_label));
      const row = h('div', { class: 'rig-builder__chips' });
      chips.forEach((chip) => {
        const open = s.editing === chip.key;
        row.append(
          h(
            'button',
            {
              type: 'button',
              class: 'rig-builder__chip',
              'data-chip': chip.key,
              'aria-expanded': open ? 'true' : 'false',
              onclick: () => {
                s.editing = open ? null : chip.key;
                this.focusAfter = s.editing ? '[data-edit], [data-edit-own]' : `[data-chip="${chip.key}"]`;
                this.render();
              },
            },
            h('span', { 'data-chip-text': '' }, chip.label),
            h('small', {}, s.assumed.has(chip.key) ? this.strings.assumed : this.strings.edit)
          )
        );
      });
      group.append(row);
      if (s.editing) group.append(h('div', { class: 'rig-builder__edit' }, this.renderEditor(s.editing)));
      group.append(h('button', { type: 'button', class: 'rig-builder__btn rig-builder__btn--ghost', 'data-update': '', disabled: s.busy.build, onclick: () => this.applyDraft() }, this.strings.update));
      return group;
    }

    specLine(item) {
      const sp = item.specs || {};
      const bits = [];
      if (item.role === 'sail') {
        if (sp.areaM2 != null) bits.push(`${sp.areaM2} m²`);
        if (sp.mastLengthMinCm != null) bits.push(this.t('spec_mast', { min: sp.mastLengthMinCm, max: sp.mastLengthMaxCm }));
        if (sp.mastRdm != null) bits.push(this.t('spec_rdm', { rdm: sp.mastRdm }));
        if (sp.boomMinCm != null) bits.push(this.t('spec_boom', { min: sp.boomMinCm, max: sp.boomMaxCm }));
      } else if (item.role === 'mast') {
        if (sp.lengthCm != null) bits.push(`${sp.lengthCm} cm`);
        if (sp.mastRdm != null) bits.push(this.t('spec_rdm', { rdm: sp.mastRdm }));
      } else if (item.role === 'board') {
        if (sp.volumeL != null) bits.push(`${sp.volumeL} L`);
        if (sp.finBox) bits.push(this.t('spec_box', { box: sp.finBox }));
        if (sp.minSailM2 != null) bits.push(this.t('spec_sail_range', { min: sp.minSailM2, max: sp.maxSailM2 }));
      } else if (item.role === 'fin') {
        if (sp.finLengthCm != null) bits.push(`${sp.finLengthCm} cm`);
        if (sp.finBox) bits.push(this.t('spec_box', { box: sp.finBox }));
      } else if (item.role === 'base' || item.role === 'extension') {
        if (sp.lengthCm != null) bits.push(`${sp.lengthCm} cm`);
        if (sp.baseType) bits.push(this.t('spec_base', { type: sp.baseType }));
      } else if (item.role === 'boom') {
        if (sp.boomMinCm != null) bits.push(this.t('spec_boom', { min: sp.boomMinCm, max: sp.boomMaxCm }));
      }
      if (!bits.length && item.variantTitle && !/^default/i.test(item.variantTitle)) bits.push(item.variantTitle);
      return bits.join(' · ');
    }

    /** The product image (imageUrl, else the older image key), https or storefront-relative only; else a neutral block. */
    imageEl(item, size = 72, small = false) {
      const url = item && (item.imageUrl !== undefined ? item.imageUrl : item.image);
      const cls = `rig-builder__img${small ? ' rig-builder__img--small' : ''}`;
      if (typeof url === 'string' && ((url.startsWith('/') && !url.startsWith('//')) || url.startsWith('https://'))) {
        const img = h('img', { class: cls, src: url, alt: item.title || '', width: size, height: size, loading: 'lazy', decoding: 'async' });
        img.addEventListener('error', () => img.replaceWith(h('div', { class: cls, 'aria-hidden': 'true' })), { once: true });
        return img;
      }
      return h('div', { class: cls, 'aria-hidden': 'true' });
    }

    /** Same-tab link to the product page; storefront-relative paths only. */
    nameEl(item) {
      const href = item.productUrl !== undefined ? item.productUrl : item.url;
      const ok = typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
      return ok ? h('a', { class: 'rig-builder__name-link', href }, item.title) : item.title;
    }

    vendorEl(item) {
      return typeof item.vendor === 'string' && item.vendor.trim() ? h('span', { class: 'rig-builder__spec rig-builder__vendor' }, ` · ${item.vendor.trim()}`) : null;
    }

    /**
     * The hub's `facts` as one compact line, "Label value · Label value". A value read off the product
     * title is marked with * and the line says so. Without facts (an older hub) the old spec line stays.
     */
    specNodes(item) {
      const facts = (Array.isArray(item.facts) ? item.facts : []).filter((x) => x && typeof x.label === 'string' && x.value != null && String(x.value) !== '');
      if (!facts.length) {
        const text = this.specLine(item);
        return text ? [h('div', { class: 'rig-builder__spec' }, text)] : [];
      }
      const derivedFields = new Set(Array.isArray(item.derived) ? item.derived : []);
      let anyDerived = false;
      const line = [];
      facts.forEach((fact, i) => {
        if (i) line.push(' · ');
        const derived = fact.derived === true || derivedFields.has(fact.field);
        anyDerived = anyDerived || derived;
        line.push(
          h(
            'span',
            { class: 'rig-builder__fact', 'data-fact': fact.field || null },
            `${fact.label} ${fact.value}`,
            derived && h('span', { class: 'rig-builder__derived', 'aria-hidden': 'true' }, '*'),
            derived && h('span', { class: 'visually-hidden' }, ` (${this.strings.derived_note})`)
          )
        );
      });
      const out = [h('div', { class: 'rig-builder__spec', 'data-facts': '' }, line)];
      if (anyDerived) out.push(h('div', { class: 'rig-builder__spec rig-builder__derived-note', 'data-derived-note': '' }, `* ${this.strings.derived_note}`));
      return out;
    }

    renderRig(missing) {
      const s = this.s;
      const rig = s.rig;
      const owned = (s.profile && s.profile.owns) || [];
      const sail = rig.items.find((i) => i.role === 'sail');
      const roles = [...new Set([...ROLE_ORDER, ...rig.items.map((i) => i.role), ...owned, ...missing.map((m) => m.role)])];
      const parts = [];

      roles.forEach((role) => {
        const items = rig.items.filter((i) => i.role === role);
        items.forEach((item) => parts.push(this.renderItem(item)));
        if (!items.length && owned.includes(role)) parts.push(this.renderOwned(role, sail));
        const gap = missing.find((m) => m.role === role);
        if (!items.length && !owned.includes(role) && gap) parts.push(this.renderMissing(gap));
      });

      const n = rig.items.length;
      const keep = owned.length ? ` · ${this.t('keep_owned', { parts: owned.map((r) => this.roleLower(r)).join(', ') })}` : '';
      const total = h(
        'div',
        { class: 'rig-builder__total' },
        h('div', {}, h('div', { class: 'rig-builder__sum', 'data-total': '' }, this.money(rig.total, rig.currency)), h('div', { class: 'rig-builder__spec' }, this.plural('parts_summary', n) + keep)),
        h(
          'button',
          { type: 'button', class: 'rig-builder__btn', 'data-add': '', disabled: s.busy.cart || n === 0, 'aria-disabled': s.busy.cart ? 'true' : null, onclick: () => this.addToCart() },
          s.busy.cart ? this.strings.adding : this.plural('add_to_cart', n)
        )
      );
      return h('div', { class: `rig-builder__rig${s.busy.build ? ' is-stale' : ''}` }, parts, total);
    }

    renderItem(item) {
      const s = this.s;
      const alts = this.alternativesFor(item);
      const open = s.openAlt === item.role && alts.length > 0;
      const listId = `Rig-Alts-${this.dataset.sectionId}-${item.role}`;
      const why = s.whys[String(item.variantId)] || item.why;
      return h(
        'div',
        { class: 'rig-builder__part', 'data-role': item.role, 'data-variant': item.variantId },
        this.imageEl(item),
        h(
          'div',
          {},
          h('div', { class: 'rig-builder__role' }, this.roleName(item.role)),
          h('div', { class: 'rig-builder__name' }, this.nameEl(item), this.vendorEl(item)),
          this.specNodes(item),
          why && h('div', { class: 'rig-builder__why' }, why),
          h('div', { class: 'rig-builder__stock' }, item.checkAvailability ? this.strings.check_availability : this.strings.in_stock),
          alts.length
            ? h('button', { type: 'button', class: 'rig-builder__swap', 'data-swap': item.role, 'aria-expanded': open ? 'true' : 'false', 'aria-controls': listId, onclick: () => {
                s.openAlt = open ? null : item.role;
                this.focusAfter = `[data-swap="${item.role}"]`;
                this.render();
              } }, open ? this.strings.hide_alternatives : this.plural('see_alternatives', alts.length))
            : null,
          open
            ? h(
                'ul',
                { class: 'rig-builder__alts', id: listId },
                alts.map((alt) =>
                  h(
                    'li',
                    { class: 'rig-builder__alt' },
                    this.imageEl(alt, 48, true),
                    h(
                      'span',
                      { class: 'rig-builder__alt-text' },
                      h('span', { class: 'rig-builder__name' }, this.nameEl(alt)),
                      this.vendorEl(alt),
                      ' ',
                      h('span', { class: 'rig-builder__spec' }, this.money(alt.price, alt.currency)),
                      this.specNodes(alt),
                      alt.why ? h('div', { class: 'rig-builder__spec' }, alt.why) : null
                    ),
                    h('button', { type: 'button', class: 'rig-builder__btn rig-builder__btn--ghost', 'data-use': alt.variantId, 'aria-label': this.t('alt_swap', { role: this.roleLower(item.role), title: alt.title }), onclick: () => this.swap(item, alt) }, this.strings.alt_use)
                  )
                )
              )
            : null
        ),
        h('div', { class: 'rig-builder__price' }, this.money(item.price, item.currency))
      );
    }

    renderOwned(role, sail) {
      const sp = (sail && sail.specs) || {};
      const spec = role === 'boom' && sp.boomMinCm != null ? this.t('owned_spec', { min: sp.boomMinCm, max: sp.boomMaxCm }) : this.strings.owned_spec_plain;
      return h(
        'div',
        { class: 'rig-builder__part rig-builder__part--owned', 'data-role': role, 'data-owned': '' },
        h('div', { class: 'rig-builder__img', 'aria-hidden': 'true' }),
        h('div', {}, h('div', { class: 'rig-builder__role' }, this.roleName(role)), h('div', { class: 'rig-builder__name' }, this.t('owned_name', { role: this.roleLower(role) })), h('div', { class: 'rig-builder__spec' }, spec)),
        h('div', { class: 'rig-builder__price' }, this.strings.owned_price)
      );
    }

    renderMissing(gap) {
      return h(
        'div',
        { class: 'rig-builder__part', 'data-role': gap.role, 'data-missing': '' },
        h('div', { class: 'rig-builder__img', 'aria-hidden': 'true' }),
        h(
          'div',
          {},
          h('div', { class: 'rig-builder__role' }, this.roleName(gap.role)),
          h('div', { class: 'rig-builder__name' }, this.t('missing_title', { role: this.roleLower(gap.role) })),
          h('div', { class: 'rig-builder__spec' }, gap.reason === 'no_rule' ? this.strings.missing_norule : this.strings.missing_none)
        ),
        h('div', { class: 'rig-builder__price' })
      );
    }

    checkLabel(id) {
      const key = CHECK_LABEL[id] || (/^(excluded|unavailable|unknown)-variant-/.test(id) ? 'check_other' : /^duplicate-/.test(id) ? 'check_other' : 'check_unknown');
      return this.strings[key] || this.strings.check_unknown;
    }

    /**
     * One calm sentence: what ran, then what could not run because the shop has no data for it.
     * A rig with anything in `unchecked` is never described as simply verified.
     */
    renderChecks(missing) {
      const rig = this.s.rig;
      const ok = [];
      const bad = [];
      (rig.checks || []).forEach((c) => {
        const label = this.checkLabel(String(c.id));
        const list = c.ok ? ok : bad;
        if (!list.includes(label)) list.push(label);
      });
      const good = ok.filter((l) => !bad.includes(l));
      const unchecked = [];
      (rig.unchecked || []).forEach((u) => {
        const label = this.checkLabel(String(u && u.id));
        if (!unchecked.includes(label)) unchecked.push(label);
      });
      const parts = [];
      if (good.length) parts.push(this.t('checked', { list: good.join(' · ') }));
      if (unchecked.length) parts.push(this.t('not_checked_data', { list: unchecked.join(' · ') }));
      if (missing.length) parts.push(this.t('not_checked', { list: missing.map((m) => this.roleLower(m.role)).join(', ') }));
      const out = [h('p', { class: 'rig-builder__checks', 'data-checks': '', 'data-unchecked': unchecked.length ? '' : null }, parts.join(' '))];
      if (bad.length) out.push(h('p', { class: 'rig-builder__note rig-builder__note--attn', role: 'status' }, this.t('checks_failed', { list: bad.join(' · ') })));
      return out;
    }
  }

  customElements.define('rig-builder', RigBuilder);
}
