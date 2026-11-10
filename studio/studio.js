// Frame Studio UI. Edits a theme's design tokens and previews them live on real products
// using the same _tokens.js / _page.js as the nightly render.
(() => {
  const $ = (s) => document.querySelector(s);
  const state = { themes: {}, products: [], config: {}, name: '', tokens: null, saved: '', view: 'grid', fmt: '1x1', selected: null, show: 24, layerSel: null };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---- editable fields -------------------------------------------------------------
  // [section, [ [path, label, kind, extra] ]]
  const FIELDS = [
    ['Text', [
      ['label', 'Tag (all items)', 'text', 'Shown on every product, e.g. "Winter". Blank = no tag.'],
      ['foodLabel', 'Tag (groceries)', 'text', 'Optional. Used instead when the product type is a grocery.'],
      ['bandText', 'Bottom band', 'text', 'Use | to split into parts, e.g. "Free delivery over €29 | Thousands of Indian & Asian groceries"'],
      ['sub.text', 'Sub-line', 'text', 'Optional line under the title, e.g. "Indian | Thai | Chinese | Korean | Japanese"'],
      ['sub.color', 'Sub-line colour', 'color'],
    ]],
    ['Layers', [
      ['layers', '', 'layers'],
    ]],
    ['Price', [
      ['price.show', 'Show price', 'check'],
      ['price.bg', 'Price fill', 'color'],
      ['price.text', 'Price text', 'color'],
      ['price.showPct', 'Show -% pill', 'check'],
      ['price.pillBg', 'Pill fill', 'color'],
      ['price.pillText', 'Pill text', 'color'],
      ['price.showReference', 'Show was-price', 'check'],
      ['price.reference', 'Was-price from', 'select', ['history', 'shopify']],
      ['price.label', 'Offer label', 'text', 'Shown only with a verified reduction. Blank = no label'],
      ['price.labelBg', 'Label fill', 'color'],
      ['price.labelText', 'Label text', 'color'],
      ['price.minPct', 'Min. reduction %', 'range', [1, 50, 1]],
      ['price.maxAgeDays', 'Show for (days)', 'range', [7, 60, 1]],
    ]],
    ['Background', [
      ['background.type', 'Type', 'select', ['linear', 'radial']],
      ['background.angle', 'Angle', 'range', [0, 360, 5]],
      ['background.colors', 'Colours', 'colors'],
      ['background.pattern', 'Pattern', 'select', GFHTokens.PATTERNS],
      ['background.patternColor', 'Pattern colour', 'color'],
      ['background.patternSize', 'Pattern size', 'range', [10, 120, 2]],
    ]],
    ['Tag', [
      ['tag.bg', 'Fill', 'color'],
      ['tag.text', 'Text', 'color'],
      ['tag.outline', 'Outline only', 'check'],
    ]],
    ['Product plate', [
      ['plate.bg', 'Fill', 'color'],
      ['plate.border', 'Border', 'color'],
      ['plate.borderWidth', 'Border width', 'range', [0, 20, 1]],
      ['plate.shadow', 'Shadow', 'range', [0, 60, 2]],
      ['plate.radius', 'Corner radius', 'range', [0, 120, 4]],
    ]],
    ['Title', [
      ['title.color', 'Colour', 'color'],
      ['title.size', 'Size', 'range', [28, 52, 1]],
    ]],
    ['Bottom band', [
      ['band.bg', 'Fill', 'color'],
      ['band.text', 'Text', 'color'],
    ]],
    ['Decoration', [
      ['deco.shape', 'Shape', 'select', GFHTokens.SHAPES],
      ['deco.colors', 'Colours', 'colors'],
      ['deco.scale', 'Size', 'range', [0.2, 2, 0.05]],
      ['deco.opacity', 'Opacity', 'range', [0.1, 1, 0.05]],
    ]],
    ['Badge colours', [
      ['badge.bg', 'Fill', 'color'],
      ['badge.text', 'Text', 'color'],
    ]],
    ['Rules (badges & segments)', [
      ['rules', '', 'rules'],
    ]],
    ['Advanced CSS', [
      ['extraCss', 'Extra CSS', 'textarea', 'Classes: body .logo .tag .plate .title .band .deco'],
    ]],
  ];

  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const set = (o, p, v) => {
    const ks = p.split('.');
    let cur = o;
    for (const k of ks.slice(0, -1)) cur = cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
    cur[ks[ks.length - 1]] = v;
  };
  const withDefaults = (t) => {
    const D = GFHTokens.DEFAULTS, out = clone(t);
    for (const k of Object.keys(D)) if (D[k] && typeof D[k] === 'object' && !Array.isArray(D[k])) out[k] = { ...D[k], ...(out[k] || {}) };
      else if (out[k] === undefined) out[k] = D[k];
    return out;
  };
  // "#0B0B0B 72%" -> "#0B0B0B" for the colour picker
  const hexOf = (v) => { const m = String(v || '').match(/#[0-9a-f]{6}/i); return m ? m[0] : '#ffffff'; };

  function colorInput(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'color';
    const pick = Object.assign(document.createElement('input'), { type: 'color', value: hexOf(value) });
    const txt = Object.assign(document.createElement('input'), { type: 'text', value: value || '' });
    pick.oninput = () => { txt.value = txt.value.replace(/#[0-9a-f]{6}/i, '') ? txt.value.replace(/#[0-9a-f]{6}/i, pick.value) : pick.value; if (!/#[0-9a-f]{6}/i.test(txt.value)) txt.value = pick.value; onChange(txt.value); };
    txt.oninput = () => { pick.value = hexOf(txt.value); onChange(txt.value); };
    wrap.append(pick, txt);
    return wrap;
  }

  function buildControls() {
    const box = $('#controls');
    box.innerHTML = '';
    const t = state.tokens;
    FIELDS.forEach(([title, fields], i) => {
      const d = document.createElement('details');
      d.open = i < 2 || title === 'Layers';
      d.innerHTML = `<summary>${title}</summary>` + (title === 'Price' ? "<p class=\"hint\" style=\"margin:4px 0\">The price comes from Shopify and is re-rendered when it changes. The -% pill, was-price and label need a real reduction. Was-price from “history” (safest) uses our own 30-day price history (EU rule); “shopify” uses the Shopify compare-at price until our history covers 30 days. Tick \"Sample reduction\" above the preview to check the design.</p>" : '');
      for (const [p, label, kind, extra] of fields) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<label>${label}</label>`;
        const val = get(t, p);
        let el;
        if (kind === 'text') {
          el = Object.assign(document.createElement('input'), { type: 'text', value: val || '', placeholder: p === 'bandText' ? state.config.freeDeliveryText : '' });
          if (extra) el.title = extra;
          el.oninput = () => update(p, el.value);
        } else if (kind === 'textarea') {
          el = Object.assign(document.createElement('textarea'), { rows: 5, value: val || '', placeholder: extra });
          el.oninput = () => update(p, el.value);
        } else if (kind === 'select') {
          el = document.createElement('select');
          el.innerHTML = extra.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('');
          el.onchange = () => update(p, el.value);
        } else if (kind === 'check') {
          el = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!val });
          el.style.justifySelf = 'start';
          el.onchange = () => update(p, el.checked);
        } else if (kind === 'range') {
          const [min, max, step] = extra;
          el = document.createElement('div');
          el.className = 'color';
          const r = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: val ?? min });
          const n = Object.assign(document.createElement('span'), { textContent: val ?? min });
          n.style.minWidth = '34px';
          r.oninput = () => { n.textContent = r.value; update(p, Number(r.value)); };
          el.append(r, n);
        } else if (kind === 'color') {
          el = colorInput(val, (v) => update(p, v));
        } else if (kind === 'layers') {
          row.style.display = 'block';
          row.innerHTML = '';
          el = document.createElement('div');
          el.id = 'layersBox';
          setTimeout(() => layersControl(el));
        } else if (kind === 'rules') {
          row.style.display = 'block';
          row.innerHTML = '<p class="hint" style="margin:0 0 8px">Badges and tag text driven by real Shopify data. The first matching rule of each kind wins. Example: tag "vegan" → badge "Vegan"; created within 30 days → badge "New"; vendor "Haldiram" → tag "Haldiram favourites".</p>';
          el = document.createElement('div');
          const rules = Array.isArray(val) ? val.map((r) => ({ ...r })) : [];
          const redraw = () => {
            el.innerHTML = '';
            rules.forEach((r, idx) => {
              const box = document.createElement('div');
              box.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px;display:grid;gap:6px';
              box.innerHTML = `<div style="display:flex;gap:6px"><select data-k="field" style="flex:1">${Object.entries(GFHTokens.FIELDS).map(([k, l]) => `<option value="${k}" ${k === r.field ? 'selected' : ''}>${l}</option>`).join('')}</select><input data-k="value" type="text" placeholder="value" style="width:90px"></div>
<div style="display:flex;gap:6px"><select data-k="action"><option value="badge" ${r.action === 'badge' ? 'selected' : ''}>show badge</option><option value="tag" ${r.action === 'tag' ? 'selected' : ''}>set tag text</option></select><input data-k="text" type="text" placeholder="text" style="flex:1;min-width:0"><button class="mini" title="Remove">×</button></div>
<div class="hint" data-k="count"></div>`;
              box.querySelector('[data-k=value]').value = r.value ?? '';
              box.querySelector('[data-k=text]').value = r.text ?? '';
              box.querySelectorAll('[data-k]').forEach((inp) => { if (inp.tagName !== 'DIV') inp.oninput = inp.onchange = () => { r[inp.dataset.k] = inp.value; update(p, rules.map((x) => ({ ...x }))); count(); }; });
              const count = () => { const n = state.products.filter((pr) => GFHTokens.resolve({ rules: [r] }, pr)[r.action === 'tag' ? 'label' : 'badge']).length; box.querySelector('[data-k=count]').textContent = `Matches ${n} of ${state.products.length} loaded products`; };
              count();
              box.querySelector('button').onclick = () => { rules.splice(idx, 1); update(p, rules.map((x) => ({ ...x }))); redraw(); };
              el.append(box);
            });
            const add = Object.assign(document.createElement('button'), { className: 'mini', textContent: '+ Add rule' });
            add.onclick = () => { rules.push({ field: 'tag', value: '', action: 'badge', text: '' }); update(p, rules.map((x) => ({ ...x }))); redraw(); };
            el.append(add);
          };
          redraw();
        } else if (kind === 'colors') {
          el = document.createElement('div');
          el.className = 'list';
          const list = Array.isArray(val) ? [...val] : [];
          const redraw = () => {
            el.innerHTML = '';
            list.forEach((c, idx) => {
              const ci = colorInput(c, (v) => { list[idx] = v; update(p, [...list]); });
              const rm = Object.assign(document.createElement('button'), { className: 'mini', textContent: '×', title: 'Remove' });
              rm.onclick = () => { list.splice(idx, 1); update(p, [...list]); redraw(); };
              ci.append(rm);
              el.append(ci);
            });
            const add = Object.assign(document.createElement('button'), { className: 'mini', textContent: '+ Add colour' });
            add.onclick = () => { list.push(list[list.length - 1] || '#ffffff'); update(p, [...list]); redraw(); };
            el.append(add);
          };
          redraw();
        }
        row.append(el);
        d.append(row);
      }
      box.append(d);
    });
  }

  // ---- layers -------------------------------------------------------------------------
  // Element library (like Confect's): ready-made layers that follow the house rules.
  const LIBRARY = {
    'Brand name': () => [{ kind: 'text', text: '{vendor}', x: 16, y: 5, w: 40, h: 6, size: 30, weight: 800, color: '#142C73', align: 'left' }],
    'Category': () => [{ kind: 'text', text: '{type}', x: 16, y: 10, w: 40, h: 5, size: 24, weight: 600, color: '#555555', align: 'left' }],
    'Shop now button': () => [{ kind: 'text', text: 'Shop now', x: 36, y: 70, w: 28, h: 7, size: 30, weight: 800, color: '#FFFFFF', bg: '#142C73', radius: 40 }],
    'Free delivery badge': () => [{ kind: 'icon', icon: 'truck', x: 6, y: 72, w: 6, h: 6, color: '#142C73' }, { kind: 'text', text: state.config.freeDeliveryText, x: 12, y: 72, w: 36, h: 6, size: 26, weight: 700, color: '#142C73', align: 'left' }],
    'New ribbon (30 days)': () => [{ kind: 'text', text: 'New', x: 74, y: 16, w: 14, h: 6, size: 30, weight: 800, color: '#FFFFFF', bg: '#E8352B', radius: 12, rotate: -8, upper: true, when: { field: 'newDays', value: '30' } }],
    'Vegan icon (tag vegan)': () => [{ kind: 'icon', icon: 'leaf', x: 80, y: 62, w: 7, h: 7, color: '#2E7D32', when: { field: 'tag', value: 'vegan' } }, { kind: 'text', text: 'Vegan', x: 74, y: 69, w: 19, h: 5, size: 24, color: '#2E7D32', when: { field: 'tag', value: 'vegan' } }],
    'Spicy icon (tag spicy)': () => [{ kind: 'icon', icon: 'chili', x: 80, y: 62, w: 7, h: 7, color: '#C62828', when: { field: 'tag', value: 'spicy' } }],
    'Discount splash (verified only)': () => [{ kind: 'text', text: '-{pct}%', x: 70, y: 14, w: 16, h: 13, size: 44, weight: 800, color: '#FFFFFF', bg: '#E30613', radius: 999, rotate: -10 }],
    'Was-price line (verified only)': () => [{ kind: 'text', text: 'Was {was} · now {price}', x: 20, y: 66, w: 60, h: 5, size: 28, weight: 700, color: '#142C73' }],
    'Gift icon': () => [{ kind: 'icon', icon: 'gift', x: 84, y: 76, w: 8, h: 8, color: '#B3262E' }],
    'Assortment line': () => [{ kind: 'text', text: 'Thousands of Indian & Asian groceries', x: 10, y: 3, w: 80, h: 4, size: 22, weight: 600, color: '#FFFFFF' }],
  };
  const NEW_LAYER = {
    text: () => ({ kind: 'text', text: 'Your text', x: 30, y: 40, w: 40, h: 8, size: 36, weight: 700, color: '#142C73' }),
    box: () => ({ kind: 'box', text: '', x: 30, y: 40, w: 40, h: 10, color: '#FFFFFF', bg: '#142C73', radius: 24 }),
    image: () => ({ kind: 'image', src: '', x: 70, y: 60, w: 20, h: 20 }),
    icon: () => ({ kind: 'icon', icon: 'star', x: 80, y: 60, w: 8, h: 8, color: '#E8352B' }),
  };
  const fmtKey = () => (state.fmt === 'all' ? '1x1' : state.fmt);
  // Geometry for the format being viewed: 1:1 is the base, other sizes can override it.
  const geom = (L) => ({ x: L.x, y: L.y, w: L.w, h: L.h, ...((fmtKey() !== '1x1' && L.formats && L.formats[fmtKey()]) || {}) });
  function setGeom(layers, i, g) {
    const L = layers[i];
    if (fmtKey() === '1x1') Object.assign(L, g);
    else { L.formats = L.formats || {}; L.formats[fmtKey()] = { ...geom(L), ...g }; }
  }
  const round = (n) => Math.round(n * 10) / 10;

  function layersControl(box) {
    const layers = (state.tokens.layers || []).map((l) => clone(l));
    const commit = () => update('layers', layers.map((l) => clone(l)));
    box.innerHTML = '';
    const head = document.createElement('div');
    head.innerHTML = `<p class="hint" style="margin:0 0 6px">Free layers on top of the frame. Drag them in the Single view to move or resize. Positions are per size: 1:1 is the base; other sizes can be adjusted on their own. Text can use {title} {vendor} {type} {category} {price}; {was} and {pct} only show with a real reduction.</p>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><button class="mini" data-add="text">+ Text</button><button class="mini" data-add="box">+ Box</button><button class="mini" data-add="image">+ Image</button><button class="mini" data-add="icon">+ Icon</button>
<select class="mini" id="libSel"><option value="">+ From library…</option>${Object.keys(LIBRARY).map((k) => `<option>${k}</option>`).join('')}</select></div>`;
    box.append(head);
    head.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { layers.push(NEW_LAYER[b.dataset.add]()); state.layerSel = layers.length - 1; commit(); layersControl(box); }));
    head.querySelector('#libSel').onchange = (e) => { if (!e.target.value) return; layers.push(...LIBRARY[e.target.value]()); state.layerSel = layers.length - 1; commit(); layersControl(box); };

    layers.forEach((L, i) => {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:4px;align-items:center;padding:4px 6px;border:1px solid ${state.layerSel === i ? 'var(--accent)' : 'var(--line)'};border-radius:8px;margin:4px 0;cursor:pointer`;
      const name = L.kind === 'icon' ? `icon: ${L.icon}` : L.kind === 'image' ? `image: ${(L.src || 'none').split('/').pop()}` : `${L.kind}: ${L.text || '(empty)'}`;
      row.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${GFHPage.esc(name)}${L.when && L.when.field ? ' <span class="hint">(if ' + GFHPage.esc(L.when.field) + ')</span>' : ''}</span><button class="mini" data-a="up" title="Move back">↑</button><button class="mini" data-a="down" title="Move forward">↓</button><button class="mini" data-a="dup" title="Duplicate">⧉</button><button class="mini" data-a="del" title="Delete">×</button>`;
      row.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'del') { layers.splice(i, 1); state.layerSel = null; }
        else if (a === 'dup') { layers.splice(i + 1, 0, clone(L)); state.layerSel = i + 1; }
        else if (a === 'up' && i > 0) { [layers[i - 1], layers[i]] = [layers[i], layers[i - 1]]; state.layerSel = i - 1; }
        else if (a === 'down' && i < layers.length - 1) { [layers[i + 1], layers[i]] = [layers[i], layers[i + 1]]; state.layerSel = i + 1; }
        else state.layerSel = state.layerSel === i ? null : i;
        if (a) commit();
        layersControl(box);
        renderPreview();
      };
      box.append(row);
      if (state.layerSel === i) box.append(layerEditor(L, i, layers, commit, box));
    });
  }

  function layerEditor(L, i, layers, commit, box) {
    const ed = document.createElement('div');
    ed.style.cssText = 'border-left:3px solid var(--accent);padding:4px 0 4px 10px;margin:0 0 8px';
    const g = geom(L);
    const fields = [];
    if (L.kind === 'text' || L.kind === 'box') fields.push(['text', 'Text', 'text']);
    if (L.kind === 'icon') fields.push(['icon', 'Icon', 'select', GFHPage.ICONS]);
    if (L.kind === 'image') fields.push(['src', 'Image', 'image']);
    fields.push(['x', 'X %', 'num', g.x], ['y', 'Y %', 'num', g.y], ['w', 'Width %', 'num', g.w], ['h', 'Height %', 'num', g.h]);
    if (L.kind !== 'image') fields.push(['color', 'Colour', 'color']);
    if (L.kind !== 'icon' && L.kind !== 'image') fields.push(['bg', 'Fill', 'color'], ['size', 'Font size', 'num'], ['weight', 'Weight', 'select', ['600', '700', '800']], ['align', 'Align', 'select', ['center', 'left', 'right']], ['upper', 'UPPERCASE', 'check']);
    fields.push(['radius', 'Corner radius', 'num'], ['rotate', 'Rotate °', 'num'], ['opacity', 'Opacity', 'num']);
    for (const [k, label, kind, extra] of fields) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label>${label}</label>`;
      const geomKey = ['x', 'y', 'w', 'h'].includes(k);
      const val = geomKey ? extra : L[k];
      const set = (v) => { if (geomKey) setGeom(layers, i, { [k]: v }); else layers[i][k] = v; commit(); };
      let el;
      if (kind === 'text') { el = Object.assign(document.createElement('input'), { type: 'text', value: val || '' }); el.oninput = () => set(el.value); }
      else if (kind === 'num') { el = Object.assign(document.createElement('input'), { type: 'text', value: val ?? '' }); el.inputMode = 'decimal'; el.oninput = () => set(el.value === '' ? '' : Number(el.value)); }
      else if (kind === 'check') { el = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!val }); el.style.justifySelf = 'start'; el.onchange = () => set(el.checked); }
      else if (kind === 'select') { el = document.createElement('select'); el.innerHTML = extra.map((o) => `<option ${String(o) === String(val) ? 'selected' : ''}>${o}</option>`).join(''); el.onchange = () => set(el.value); }
      else if (kind === 'color') el = colorInput(val || '', set);
      else if (kind === 'image') {
        el = document.createElement('div');
        el.style.display = 'grid';
        el.style.gap = '4px';
        const url = Object.assign(document.createElement('input'), { type: 'text', value: val || '', placeholder: 'assets/layers/… or https://…' });
        url.oninput = () => set(url.value);
        el.append(url);
        if (StudioBackend.mode === 'local') {
          const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml' });
          file.onchange = async () => {
            const f = file.files[0];
            if (!f) return;
            const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
            const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, data }) });
            const j = await res.json();
            if (!res.ok) return status(j.error, 'err');
            url.value = j.src;
            set(j.src);
            status(`Saved ${j.src}: commit it with the theme`, 'ok');
          };
          el.append(file);
        }
      }
      row.append(el);
      ed.append(row);
    }
    // show-when condition
    const cond = document.createElement('div');
    cond.className = 'row';
    const w = L.when || {};
    cond.innerHTML = `<label>Show only if</label><div style="display:flex;gap:4px"><select data-k="field" style="flex:1;min-width:0"><option value="">always</option>${Object.entries(GFHTokens.FIELDS).map(([k, l]) => `<option value="${k}" ${k === w.field ? 'selected' : ''}>${l}</option>`).join('')}</select><input data-k="value" type="text" style="width:80px" placeholder="value"></div>`;
    cond.querySelector('[data-k=value]').value = w.value || '';
    cond.querySelectorAll('[data-k]').forEach((el) => (el.oninput = el.onchange = () => {
      const f = cond.querySelector('[data-k=field]').value;
      layers[i].when = f ? { field: f, value: cond.querySelector('[data-k=value]').value } : undefined;
      commit();
    }));
    ed.append(cond);
    if (fmtKey() !== '1x1') {
      const reset = Object.assign(document.createElement('button'), { className: 'mini', textContent: `Use 1:1 position for ${GFHPage.FORMATS[fmtKey()].label.split(' ')[0]}` });
      reset.onclick = () => { if (layers[i].formats) delete layers[i].formats[fmtKey()]; commit(); layersControl(box); };
      ed.append(reset);
    } else ed.insertAdjacentHTML('beforeend', '<p class="hint" style="margin:4px 0">Editing the 1:1 position. Pick 4:5 or 9:16 above the preview to adjust those sizes separately.</p>');
    return ed;
  }

  // Drag & resize layers on the large single-size preview.
  function attachDrag(frameBox, fmt) {
    const layers = state.tokens.layers || [];
    if (!layers.length) return;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:absolute;inset:0;z-index:5';
    frameBox.append(ov);
    const p = state.products.find((x) => x.id === state.selected);
    const compiled = GFHTokens.compile(state.tokens);
    const visible = new Set(GFHTokens.layersFor(compiled, p || {}, priceFor(p, compiled), fmt).map((l) => l.index));
    layers.forEach((L, i) => {
      if (!visible.has(i)) return;
      const g = geom(L);
      const h = document.createElement('div');
      h.title = 'Drag to move · corner to resize · click to edit';
      h.style.cssText = `position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;outline:${state.layerSel === i ? '2px solid #1F6FEB' : '1px dashed rgba(31,111,235,.7)'};cursor:move`;
      const grip = document.createElement('div');
      grip.style.cssText = 'position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:#1F6FEB;border-radius:3px;cursor:nwse-resize';
      h.append(grip);
      ov.append(h);
      const start = (e, mode) => {
        e.preventDefault();
        e.stopPropagation();
        state.layerSel = i;
        const r = ov.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY, g0 = geom(state.tokens.layers[i]);
        const move = (ev) => {
          const dx = ((ev.clientX - sx) / r.width) * 100, dy = ((ev.clientY - sy) / r.height) * 100;
          const ng = mode === 'move' ? { x: round(Math.min(100 - g0.w, Math.max(0, g0.x + dx))), y: round(Math.min(100 - g0.h, Math.max(0, g0.y + dy))) } : { w: round(Math.max(2, g0.w + dx)), h: round(Math.max(2, g0.h + dy)) };
          const all = state.tokens.layers.map((l) => clone(l));
          setGeom(all, i, ng);
          state.tokens.layers = all;
          const cur = geom(all[i]);
          Object.assign(h.style, { left: cur.x + '%', top: cur.y + '%', width: cur.w + '%', height: cur.h + '%' });
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          update('layers', state.tokens.layers.map((l) => clone(l)));
          refreshLayersPanel();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      h.onpointerdown = (e) => start(e, 'move');
      grip.onpointerdown = (e) => start(e, 'resize');
    });
  }
  function refreshLayersPanel() {
    const box = document.querySelector('#layersBox');
    if (box) layersControl(box);
  }

  // ---- preview -----------------------------------------------------------------------
  // Price shown in the preview: the real price (with a reduction only if our history proves it),
  // or, when "Sample reduction" is ticked, a made-up 20% reduction to check the design.
  function priceFor(p, compiled) {
    if (!p || !p.price) return null;
    const v = GFHTokens.priceView(compiled.price, p.price);
    if ($('#sampleDisc').checked && !v.ref) return { now: v.now, ref: Math.round(v.now * 125) / 100, pct: 20 };
    return v;
  }

  // The design a product gets in the catalog: its segment's design, else the theme being edited.
  // The theme being edited always shows your unsaved changes.
  const compiledCache = {};
  function designFor(p, compiled) {
    if (!$('#segView').checked) return { name: state.name, compiled };
    const name = GFHTokens.segmentTheme(state.config.segments, state.name, p);
    if (name === state.name || !state.themes[name]) return { name: state.name, compiled };
    compiledCache[name] = compiledCache[name] || GFHTokens.compile(state.themes[name]);
    return { name, compiled: compiledCache[name] };
  }

  function pageFor(p, editing, fmt) {
    const compiled = designFor(p, editing).compiled;
    return GFHPage.build(compiled, {
      ...GFHTokens.resolve(compiled, p),
      title: p.title,
      sub: compiled.subText || '',
      photo: p.photo,
      logo: new URL('logo.png', location.href).href,
      bandText: compiled.bandText || state.config.freeDeliveryText,
      price: priceFor(p, compiled),
      layers: GFHTokens.layersFor(compiled, p, priceFor(p, compiled), fmt).map((l) => (l.kind === 'image' && /^assets\//.test(l.src || '') ? { ...l, src: new URL(l.src, location.href).href } : l)),
    }, fmt);
  }

  function visibleProducts() {
    const q = $('#search').value.trim().toLowerCase();
    return state.products.filter((p) => (!$('#stockOnly').checked || p.inStock) && (!q || [p.title, p.type, p.vendor, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
  }

  function frameEl(p, fmt, html, caption) {
    const F = GFHPage.FORMATS[fmt];
    const f = document.createElement('div');
    f.className = 'frame';
    f.style.aspectRatio = `${F.w} / ${F.h}`;
    const ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-same-origin');
    ifr.style.width = F.w + 'px';
    ifr.style.height = F.h + 'px';
    ifr.srcdoc = html;
    f.append(ifr);
    new ResizeObserver(() => { ifr.style.transform = `scale(${f.clientWidth / F.w})`; }).observe(f);
    const card = document.createElement('div');
    card.className = 'card';
    const cap = document.createElement('div');
    cap.className = 'cap';
    const seg = designFor(p, null).name;
    cap.textContent = caption || `${seg !== state.name ? '◆ ' + seg + ' design · ' : ''}${p.type || 'no type'} · ${p.food ? 'grocery' : 'non-food'}${p.vendor ? ' · ' + p.vendor : ''}`;
    card.append(f, cap);
    return card;
  }

  const euro = (n) => '€' + Number(n).toFixed(2).replace('.', ',');

  let renderTimer = null;
  function renderPreview() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const compiled = GFHTokens.compile(state.tokens);
      const view = $('#view');
      view.innerHTML = '';
      const list = visibleProducts();
      const fmt = state.fmt === 'all' ? '1x1' : state.fmt;
      if (!list.length) { view.innerHTML = '<p class="hint">No products. Run <code>node src/fetch.js</code> to load the catalog into data/products.json.</p>'; return; }
      if (state.view === 'grid' && state.fmt !== 'all') {
        const g = document.createElement('div');
        g.className = 'grid';
        g.style.gridTemplateColumns = `repeat(auto-fill,minmax(${fmt === '9x16' ? 170 : 220}px,1fr))`;
        for (const p of list.slice(0, state.show)) {
          const f = frameEl(p, fmt, pageFor(p, compiled, fmt));
          f.style.cursor = 'pointer';
          f.onclick = () => { state.selected = p.id; setView('single'); };
          g.append(f);
        }
        view.append(g);
        if (list.length > state.show) {
          const more = Object.assign(document.createElement('button'), { className: 'more', textContent: `Show more (${Math.min(state.show, list.length)} of ${list.length})` });
          more.onclick = () => { state.show += 48; renderPreview(); };
          view.append(more);
        }
        return;
      }
      const p = list.find((x) => x.id === state.selected) || list[0];
      state.selected = p.id;
      const info = document.createElement('div');
      info.className = 'toolbar';
      const pv = p.price && GFHTokens.priceView(compiled.price, p.price);
      const why = !p.price ? '' : p.price.verified ? ` · verified reduction from ${euro(p.price.verified.ref)}` : p.price.compareAt > p.price.now ? (compiled.price.reference === 'shopify' ? (p.price.covered ? ` · Shopify compare-at ${euro(p.price.compareAt)} hidden: our 30-day history shows no real reduction` : ` · was-price = Shopify compare-at ${euro(p.price.compareAt)}`) : ` · Shopify compare-at ${euro(p.price.compareAt)} (hidden: set "Was-price from" to shopify to use it)`) : p.price.compareAt === undefined ? ' · compare-at price not loaded yet (click Load full catalog)' : ' · no compare-at price in Shopify';
      const pr = p.price ? euro(pv.now) + why : 'no price';
      info.innerHTML = `<select id="pick" style="max-width:420px">${list.slice(0, 500).map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${GFHPage.esc(x.title)}</option>`).join('')}</select>
<span class="hint">${GFHPage.esc(p.type || 'no type')} · ${pr} · ID ${p.id}</span>
${StudioBackend.canRender ? '<button id="exactBtn">Render exact JPEG</button>' : '<span class="hint">Exact JPEG render: local Studio only</span>'}`;
      view.append(info);
      const row = document.createElement('div');
      row.className = 'sizes';
      const fmts = state.fmt === 'all' ? Object.keys(GFHPage.FORMATS) : [fmt];
      for (const f of fmts) {
        const F = GFHPage.FORMATS[f];
        const use = F.metaTag ? ' · Meta ' + F.metaTag : f === '1x1' ? ' · Meta image_link' : ' · not used by Meta';
        const card = frameEl(p, f, pageFor(p, compiled, f), F.label + use);
        if (state.fmt !== 'all' && designFor(p, null).name === state.name) attachDrag(card.querySelector('.frame'), f);
        card.style.width = state.fmt === 'all' ? `${Math.round((340 * F.w) / F.h)}px` : `min(${f === '9x16' ? 420 : 560}px,100%)`;
        row.append(card);
      }
      view.append(row);
      view.insertAdjacentHTML('beforeend', '<div class="exact" id="exact"></div>');
      $('#pick').onchange = (e) => { state.selected = e.target.value; renderPreview(); };
      if ($('#exactBtn')) $('#exactBtn').onclick = renderExact;
    }, 120);
  }

  async function renderExact() {
    const btn = $('#exactBtn');
    const fmt = state.fmt === 'all' ? '1x1' : state.fmt;
    const p = state.products.find((x) => x.id === state.selected);
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    try {
      const d = designFor(p, GFHTokens.compile(state.tokens));
      const tokens = d.name === state.name ? state.tokens : state.themes[d.name];
      const url = URL.createObjectURL(await StudioBackend.render(tokens, state.selected, fmt, priceFor(p, d.compiled)));
      $('#exact').innerHTML = `<img src="${url}" alt="Rendered frame" style="max-width:min(560px,100%)"><p class="hint">${GFHPage.FORMATS[fmt].label} JPEG, rendered by the same headless Chrome as the nightly job.</p>`;
    } catch (e) {
      $('#exact').innerHTML = `<p class="status err">${GFHPage.esc(e.message)}</p>`;
    }
    btn.disabled = false;
    btn.textContent = 'Render exact JPEG';
  }

  // ---- state changes -----------------------------------------------------------------
  function update(path, value) {
    set(state.tokens, path, value);
    refreshMeta();
    renderPreview();
  }

  function refreshMeta() {
    const dirty = JSON.stringify(state.tokens) !== state.saved;
    $('#saveBtn').disabled = !dirty;
    $('#revertBtn').disabled = !dirty;
    status(dirty ? 'Unsaved changes' : '');
    const w = GFHTokens.lint(state.tokens);
    $('#warnings').innerHTML = w.map((m) => `<div class="warn">⚠ ${GFHPage.esc(m)}</div>`).join('');
    if (state.tokens.price && state.tokens.price.show && state.tokens.price.reference === 'shopify') {
      $('#warnings').insertAdjacentHTML('beforeend', '<div class="warn">⚠ Was-price comes from the Shopify compare-at price. EU rule: it must be the lowest price of the 30 days before the reduction, so only use compare-at prices you know are correct. Once our own history covers 30 days for a product, it takes over automatically and drops compare-at prices that are not a real reduction.</div>');
    }
    const live = state.config.active;
    $('#liveInfo').textContent = state.name === live ? 'This theme is live in the catalog today' : `Live today: ${live}`;
  }

  function status(msg, cls = '') {
    const s = $('#status');
    s.textContent = msg;
    s.className = 'status ' + cls;
  }

  function loadTheme(name) {
    if (state.tokens && JSON.stringify(state.tokens) !== state.saved && !confirm('Discard unsaved changes?')) { $('#themeSel').value = state.name; return; }
    state.name = name;
    state.tokens = withDefaults(state.themes[name] || {});
    state.saved = JSON.stringify(state.tokens);
    $('#themeSel').value = name;
    buildControls();
    refreshMeta();
    renderPreview();
  }

  function fillThemeSelect() {
    $('#themeSel').innerHTML = Object.keys(state.themes).map((n) => `<option value="${n}">${n}${n === state.config.active ? ' (live)' : ''}</option>`).join('');
    $('#themeSel').value = state.name;
  }

  async function save() {
    const warnings = GFHTokens.lint(state.tokens);
    if (warnings.length && !confirm(`This theme has warnings:\n\n- ${warnings.join('\n- ')}\n\nSave anyway?`)) return;
    if (state.name === state.config.active && !confirm(`"${state.name}" is the live theme. Once this reaches GitHub main, the next run re-renders every catalog image with this design. Save?`)) return;
    let msg;
    status('Saving…');
    try { msg = await StudioBackend.saveTheme(state.name, state.tokens); } catch (e) { return status(e.message, 'err'); }
    state.themes[state.name] = clone(state.tokens);
    delete compiledCache[state.name];
    state.saved = JSON.stringify(state.tokens);
    refreshMeta();
    status(msg, 'ok');
  }

  function duplicate() {
    const name = (prompt('New theme name (lowercase, e.g. diwali or summer-2027):') || '').trim().toLowerCase();
    if (!name) return;
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) return alert('Use lowercase letters, digits and dashes only.');
    if (state.themes[name]) return alert('That theme already exists.');
    state.themes[name] = clone(state.tokens);
    state.saved = '';
    state.name = name;
    fillThemeSelect();
    refreshMeta();
    status('New theme: save to create the file');
  }

  // ---- schedule ----------------------------------------------------------------------
  function openSchedule() {
    const names = Object.keys(state.themes);
    const opts = (sel) => names.map((n) => `<option ${n === sel ? 'selected' : ''}>${n}</option>`).join('');
    $('#defTheme').innerHTML = opts(state.config.theme);
    const rows = $('#schedRows');
    const addRow = (s = { theme: names[0], from: '', to: '' }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select>${opts(s.theme)}</select></td><td><input type="date" value="${s.from}"></td><td><input type="date" value="${s.to}"></td><td><button class="mini">×</button></td>`;
      tr.querySelector('button').onclick = () => tr.remove();
      rows.append(tr);
    };
    rows.innerHTML = '';
    state.config.schedule.forEach(addRow);
    $('#addRange').onclick = () => addRow();
    $('#schedDlg').showModal();
  }

  async function saveSchedule() {
    const schedule = [...$('#schedRows').children].map((tr) => {
      const [sel, from, to] = tr.querySelectorAll('select,input');
      return { theme: sel.value, from: from.value, to: to.value };
    });
    const body = { theme: $('#defTheme').value, schedule };
    for (const r of schedule) if (!r.from || !r.to || r.from > r.to) return alert(`Check the dates for ${r.theme}`);
    let msg;
    try { msg = await StudioBackend.saveSchedule(body); } catch (e) { return alert(e.message); }
    $('#schedDlg').close();
    if (StudioBackend.mode === 'local') await load(state.name);
    status(msg, 'ok');
  }

  // ---- segments ----------------------------------------------------------------------
  function openSegments() {
    const names = Object.keys(state.themes);
    const opts = (sel, blank) => (blank ? `<option value="" ${!sel ? 'selected' : ''}>always</option>` : '') + names.map((n) => `<option ${n === sel ? 'selected' : ''}>${n}</option>`).join('');
    const fields = (sel) => Object.entries(GFHTokens.FIELDS).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
    const rows = $('#segRows');
    rows.innerHTML = '';
    const addRow = (s = { field: 'type', value: '', theme: names[0], during: '' }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-k="field">${fields(s.field)}</select></td><td><input type="text" data-k="value" placeholder="e.g. Health & Beauty"></td><td><select data-k="theme">${opts(s.theme)}</select></td><td><select data-k="during">${opts(s.during, true)}</select></td><td><input type="date" data-k="from" value="${s.from || ''}" title="From (optional)"><input type="date" data-k="to" value="${s.to || ''}" title="To (optional)"></td><td class="hint" data-k="n"></td><td><button class="mini">×</button></td>`;
      tr.querySelector('[data-k=value]').value = s.value || '';
      const count = () => {
        const r = { field: tr.querySelector('[data-k=field]').value, value: tr.querySelector('[data-k=value]').value };
        tr.querySelector('[data-k=n]').textContent = state.products.filter((p) => GFHTokens.matches(r, p, Date.now())).length + ' products';
      };
      tr.querySelectorAll('select,input').forEach((el) => (el.oninput = el.onchange = count));
      tr.querySelector('button').onclick = () => tr.remove();
      count();
      rows.append(tr);
    };
    (state.config.segments || []).forEach(addRow);
    $('#addSeg').onclick = () => addRow();
    $('#segDlg').showModal();
  }

  async function saveSegments() {
    const segments = [...$('#segRows').children].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-k]')].filter((el) => el.tagName !== 'TD').map((el) => [el.dataset.k, el.value.trim()])));
    if (segments.some((s) => !s.value && s.field !== 'onSale' && s.field !== 'food')) return alert('Every segment needs a value.');
    if (segments.some((s) => s.from && s.to && s.from > s.to)) return alert('A segment has its From date after its To date.');
    let msg;
    try { msg = await StudioBackend.saveSegments({ segments }); } catch (e) { return alert(e.message); }
    $('#segDlg').close();
    state.config.segments = segments;
    renderPreview();
    status(msg, 'ok');
  }

  async function pull() {
    const b = $('#pullBtn');
    b.disabled = true;
    b.textContent = 'Loading catalog…';
    try {
      const msg = await StudioBackend.pull();
      await load(state.name);
      status(msg, 'ok');
    } catch (e) {
      status('Could not load the catalog: ' + e.message + '. The cloud build publishes it when its first run finishes.', 'err');
    }
    b.disabled = false;
    b.textContent = 'Load full catalog';
  }

  function setFmt(f) {
    state.fmt = f;
    document.querySelectorAll('#fmtSeg button').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    refreshLayersPanel();
    renderPreview();
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    renderPreview();
  }

  async function load(keep) {
    const s = await StudioBackend.load();
    Object.assign(state, { themes: s.themes, products: s.products, config: s.config });
    for (const k of Object.keys(compiledCache)) delete compiledCache[k];
    $('#count').textContent = `${s.products.length} products`;
    if (s.products.length < 100 && StudioBackend.mode === 'local') $('#count').textContent += ' (sample — click Load full catalog)';
    state.name = keep && s.themes[keep] ? keep : s.config.active;
    fillThemeSelect();
    state.tokens = null;
    loadTheme(state.name);
  }

  $('#themeSel').onchange = (e) => loadTheme(e.target.value);
  $('#saveBtn').onclick = save;
  $('#revertBtn').onclick = () => { state.tokens = JSON.parse(state.saved || JSON.stringify(withDefaults({}))); buildControls(); refreshMeta(); renderPreview(); };
  $('#dupBtn').onclick = duplicate;
  $('#schedBtn').onclick = openSchedule;
  $('#schedCancel').onclick = () => $('#schedDlg').close();
  $('#schedSave').onclick = saveSchedule;
  $('#search').oninput = renderPreview;
  $('#stockOnly').onchange = renderPreview;
  document.querySelectorAll('#viewSeg button').forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  document.querySelectorAll('#fmtSeg button').forEach((b) => (b.onclick = () => setFmt(b.dataset.f)));
  $('#sampleDisc').onchange = renderPreview;
  $('#segView').onchange = renderPreview;
  $('#segBtn').onclick = openSegments;
  $('#segCancel').onclick = () => $('#segDlg').close();
  $('#segSave').onclick = saveSegments;
  $('#pullBtn').onclick = pull;
  if (StudioBackend.mode !== 'local') $('#pullBtn').hidden = true;
  $('#search').addEventListener('input', () => { state.show = 24; });
  window.addEventListener('beforeunload', (e) => { if (state.tokens && JSON.stringify(state.tokens) !== state.saved) e.preventDefault(); });
  window.addEventListener('error', (e) => status('Studio error: ' + e.message + ' (reload the page; if it persists, restart npm run studio)', 'err'));
  if (StudioBackend.mode === 'hosted') {
    document.title = 'Frame Studio (hosted)';
    $('#saveBtn').textContent = 'Propose change (PR)';
  }
  load().catch((e) => status('Could not load themes/products: ' + e.message, 'err'));
})();
