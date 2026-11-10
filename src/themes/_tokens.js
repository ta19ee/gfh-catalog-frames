// Turns a theme's design tokens into { label, foodLabel, bandText, css, deco }.
// Works in Node (require) and in the browser (window.GFHTokens) so the Studio preview
// and the nightly render produce exactly the same frame.
(function (root) {
  // Fixed decoration spots around the plate: [x, y, size, rotation]
  const SPOTS = [[24, 260, 96, 20], [960, 230, 74, -30], [40, 640, 64, 70], [972, 600, 96, -60], [180, 112, 46, 110], [880, 760, 52, 40], [520, 104, 30, 0]];

  const SHAPES = {
    none: () => '',
    leaf: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:0 80% 0 80%;background:${c};transform:rotate(${r}deg);opacity:${o}"></i>`,
    flake: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;font-size:${s}px;line-height:1;color:${c};font-style:normal;opacity:${o};transform:rotate(${r}deg)">✻</i>`,
    star: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;font-size:${s}px;line-height:1;color:${c};font-style:normal;opacity:${o}">★</i>`,
    dot: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;width:${Math.round(s / 4)}px;height:${Math.round(s / 4)}px;border-radius:50%;background:${c};box-shadow:0 0 ${Math.round(s / 2)}px ${c};opacity:${o}"></i>`,
    heart: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;font-size:${s}px;line-height:1;color:${c};font-style:normal;opacity:${o};transform:rotate(${r}deg)">♥</i>`,
    diya: (x, y, s, r, c, o) => `<i class="deco" style="left:${x}px;top:${y}px;width:${s}px;height:${Math.round(s / 2)}px;border-radius:0 0 ${s}px ${s}px;background:${c};opacity:${o};box-shadow:0 ${-Math.round(s / 3)}px ${Math.round(s / 3)}px -${Math.round(s / 8)}px #FFD27A"></i>`,
  };

  // Background patterns drawn with CSS gradients (no image files).
  const PATTERNS = {
    none: null,
    dots: (c) => `radial-gradient(${c} 18%, transparent 20%)`,
    stripes: (c) => `repeating-linear-gradient(45deg, ${c} 0 10px, transparent 10px 24px)`,
    grid: (c) => `linear-gradient(${c} 2px, transparent 2px), linear-gradient(90deg, ${c} 2px, transparent 2px)`,
    checks: (c) => `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`,
  };
  const PSIZE = { dots: (n) => `${n}px ${n}px`, grid: (n) => `${n}px ${n}px,${n}px ${n}px`, checks: (n) => `${n}px ${n}px` };

  const DEFAULTS = {
    label: '', foodLabel: '', bandText: '',
    background: { type: 'linear', angle: 160, colors: ['#FFFFFF', '#FFFFFF'], pattern: 'none', patternColor: 'rgba(255,255,255,.18)', patternSize: 40 },
    tag: { bg: '#142C73', text: '#FFFFFF', outline: false },
    plate: { bg: '#FFFFFF', border: '#FFFFFF', borderWidth: 0, shadow: 30, radius: 48 },
    title: { color: '#111111', size: 40 },
    band: { bg: '#142C73', text: '#FFFFFF' },
    deco: { shape: 'none', colors: ['#FFFFFF'], scale: 1, opacity: 0.85 },
    badge: { bg: '#E8352B', text: '#FFFFFF' },
    sub: { text: '', color: '#1F3FBF' },
    // Price block. The "-%" pill, struck-through reference price and label only appear when our own
    // 30-day price history proves a reduction (EU rule), never from Shopify's compare-at price.
    price: { show: false, bg: '#E30613', text: '#FFFFFF', label: 'Offer price', labelBg: '#0B1F4D', labelText: '#FFFFFF', pillBg: '#1F3FBF', pillText: '#FFFFFF', showPct: true, showReference: true, minPct: 5, maxAgeDays: 30, reference: 'history' },
    rules: [],
    // Free layers: [{ kind: 'text'|'box'|'image'|'icon', text, x, y, w, h (percent), size, weight, color, bg,
    //   radius, align, rotate, opacity, src, icon, when: { field, value }, formats: { '4x5': { x, y, w, h } } }]
    layers: [],
    extraCss: '',
  };

  const merge = (a, b) => {
    const out = { ...a };
    for (const k of Object.keys(b || {})) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? { ...a[k], ...b[k] } : b[k];
    return out;
  };

  function compile(tokens) {
    const t = merge(DEFAULTS, tokens);
    const bg = t.background;
    const stops = (bg.colors || []).join(',');
    const bgCss = bg.colors.length < 2 ? bg.colors[0] : bg.type === 'radial' ? `radial-gradient(80% 60% at 50% 40%,${stops})` : `linear-gradient(${bg.angle}deg,${stops})`;
    const sh = Number(t.plate.shadow) || 0;
    const ring = Number(t.plate.borderWidth) ? `0 0 0 ${t.plate.borderWidth}px ${t.plate.border}` : '';
    const drop = sh ? `0 ${sh}px ${sh * 2}px rgba(0,0,0,${Math.min(0.6, sh / 70).toFixed(2)})` : '';
    const shadow = [ring, drop].filter(Boolean).join(',') || 'none';
    const tagCss = t.tag.outline ? `background:transparent;border:3px solid ${t.tag.text};color:${t.tag.text}` : `background:${t.tag.bg};color:${t.tag.text}`;
    const pat = PATTERNS[bg.pattern] ? PATTERNS[bg.pattern](bg.patternColor || 'rgba(255,255,255,.18)', Number(bg.patternSize) || 40) : '';
    const css = `
body{background:${pat ? pat + ',' : ''}${bgCss}}${pat ? `
body{background-size:${PSIZE[bg.pattern] ? PSIZE[bg.pattern](Number(bg.patternSize) || 40) : 'auto'},100% 100%}` : ''}
.tag{${tagCss}}
.plate{background:${t.plate.bg};box-shadow:${shadow};border-radius:${t.plate.radius}px}
.title{color:${t.title.color};font-size:${t.title.size}px}
.band{background:${t.band.bg};color:${t.band.text}}.band .dot{background:${t.band.text}}
.badge{background:${t.badge.bg};color:${t.badge.text}}
.sub{color:${t.sub.color}}
.band .sep{background:${t.band.text}}
.price .box{background:${t.price.bg};color:${t.price.text}}
.price .lbl{background:${t.price.labelBg};color:${t.price.labelText}}
.price .pill{background:${t.price.pillBg};color:${t.price.pillText}}
${t.extraCss || ''}`;
    const shape = SHAPES[t.deco.shape] || SHAPES.none;
    const colors = t.deco.colors && t.deco.colors.length ? t.deco.colors : ['#FFFFFF'];
    const deco = SPOTS.map(([x, y, s, r], i) => shape(x, y, Math.round(s * (t.deco.scale || 1)), r, colors[i % colors.length], t.deco.opacity)).join('');
    return { label: t.label, foodLabel: t.foodLabel, bandText: t.bandText, subText: t.sub.text, price: t.price, rules: t.rules || [], layers: t.layers || [], css, deco };
  }

  // Rules: [{ field, value, action: 'badge'|'tag', text }]. First matching 'tag' rule replaces the
  // tag text; first matching 'badge' rule adds a corner badge. Fields: tag, type, vendor, title, newDays.
  // product: { type, vendor, title, tags: [], createdAt, food }
  function matches(rule, p, now) {
    const v = String(rule.value == null ? '' : rule.value).trim().toLowerCase();
    if (!v && rule.field !== 'food' && rule.field !== 'onSale') return false;
    switch (rule.field) {
      case 'tag': return (p.tags || []).some((t) => String(t).toLowerCase() === v);
      case 'type': return String(p.type || '').toLowerCase().includes(v);
      case 'vendor': return String(p.vendor || '').toLowerCase().includes(v);
      case 'title': return String(p.title || '').toLowerCase().includes(v);
      case 'newDays': return !!p.createdAt && (now - Date.parse(p.createdAt)) / 864e5 <= Number(v);
      case 'food': return !!p.food === (v !== 'no');
      case 'collection': return (p.collections || []).some((c) => String(c).toLowerCase().includes(v));
      case 'category': return String(p.category || '').toLowerCase().includes(v);
      case 'onSale': return !!p.onSale === (v !== 'no');
      default: return false;
    }
  }
  function resolve(compiled, p, now = Date.now()) {
    const rules = compiled.rules || [];
    const tagRule = rules.find((r) => r.action === 'tag' && matches(r, p, now));
    const badgeRule = rules.find((r) => r.action === 'badge' && matches(r, p, now));
    const label = tagRule ? tagRule.text : compiled.foodLabel && p.food ? compiled.foodLabel : compiled.label;
    return { label: label || '', badge: badgeRule ? badgeRule.text : '' };
  }
  const FIELDS = { onSale: 'Is on sale (yes/no)', type: 'Product type contains', collection: 'Collection contains', category: 'Shopify category contains', tag: 'Shopify tag is', vendor: 'Vendor contains', title: 'Title contains', newDays: 'Created within N days', food: 'Is grocery (yes/no)' };

  // Designs per product segment (like Confect's design per category).
  // segments: [{ field, value, theme, during }]; the first match wins. "during" limits a segment
  // to the time when that theme is the live one (blank = always).
  function segmentTheme(segments, active, p, now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    for (const s of segments || []) {
      if (s.during && s.during !== active) continue;
      if ((s.from && today < s.from) || (s.to && today > s.to)) continue;
      if (s.theme && matches(s, p, now)) return s.theme;
    }
    return active;
  }

  // Layers for one product: conditions applied and {fields} filled in. A layer that uses {was} or
  // {pct} only shows when there is a real reduction; {price} only when the product has a price.
  const euro = (n) => '€' + Number(n).toFixed(2).replace('.', ',');
  function layersFor(compiled, p, price, fmt = '1x1', now = Date.now()) {
    const out = [];
    (compiled.layers || []).forEach((L, index) => out.push(...one(L, index)));
    return out;
    function one(L, index) {
      if (L.when && L.when.field && !matches(L.when, p, now)) return [];
      let text = L.text || '';
      if (/\{(was|pct)\}/.test(text) && !(price && price.ref)) return [];
      if (/\{price\}/.test(text) && !(price && isFinite(price.now))) return [];
      text = text
        .replace(/\{title\}/g, p.title || '')
        .replace(/\{vendor\}/g, p.vendor || '')
        .replace(/\{type\}/g, p.type || '')
        .replace(/\{category\}/g, String(p.category || '').split('>').pop().trim())
        .replace(/\{price\}/g, price ? euro(price.now) : '')
        .replace(/\{was\}/g, price && price.ref ? euro(price.ref) : '')
        .replace(/\{pct\}/g, price && price.pct ? String(price.pct) : '');
      return [{ ...L, ...((L.formats && L.formats[fmt]) || {}), text, index }];
    }
  }

  // Every text a theme can put on a frame (for the translation editor).
  function texts(compiled, fallbackBand) {
    const out = [];
    const add = (s) => { s = String(s || '').trim(); if (s && !out.includes(s)) out.push(s); };
    add(compiled.label); add(compiled.foodLabel);
    String(compiled.subText || '').split('|').forEach(add);
    String(compiled.bandText || fallbackBand || '').split('|').forEach(add);
    if (compiled.price && compiled.price.show) add(compiled.price.label);
    (compiled.rules || []).forEach((r) => add(r.text));
    (compiled.layers || []).forEach((l) => { if (l.kind === 'text' || l.kind === 'box') add(l.text); });
    return out;
  }

  // A compiled theme with its texts swapped for one language. dict: { "Free delivery over €29": "Gratis…" }
  // Texts without a translation stay as they are; band parts (split by |) are translated one by one.
  function translate(compiled, dict, fallbackBand) {
    if (!dict) return compiled;
    const tr = (s) => { const k = String(s || '').trim(); return k && dict[k] ? dict[k] : s; };
    return {
      ...compiled,
      label: tr(compiled.label),
      foodLabel: tr(compiled.foodLabel),
      subText: compiled.subText ? String(compiled.subText).split('|').map((x) => tr(x.trim())).join(' | ') : compiled.subText,
      bandText: String(compiled.bandText || fallbackBand || '').split('|').map((x) => tr(x.trim())).join(' | '),
      price: compiled.price ? { ...compiled.price, label: tr(compiled.price.label) } : compiled.price,
      rules: (compiled.rules || []).map((r) => ({ ...r, text: tr(r.text) })),
      layers: (compiled.layers || []).map((l) => (l.kind === 'text' || l.kind === 'box' ? { ...l, text: tr(l.text) } : l)),
    };
  }

  // Which price, reference price and % to show.
  // facts: { now, compareAt, verified: { ref, pct } | null, covered: bool }
  // reference 'history' (default): only a reduction our own 30-day history proves.
  // reference 'shopify': the Shopify compare-at price, but our history wins once it covers the
  //   30 days before the current price (then a compare-at that is no real reduction is dropped).
  function priceView(price, facts) {
    if (!facts || !isFinite(facts.now)) return null;
    const P = price || {};
    let ref = facts.verified ? facts.verified.ref : null;
    if (!ref && P.reference === 'shopify' && !facts.covered && Number(facts.compareAt) > facts.now) ref = Number(facts.compareAt);
    const pct = ref ? Math.round(((ref - facts.now) / ref) * 100) : null;
    return { now: facts.now, ref: pct >= (P.minPct || 5) ? ref : null, pct: pct >= (P.minPct || 5) ? pct : null };
  }

  // Words that would make a frame claim something we can't back up (house rules / EU pricing rules).
  const RISKY = [
    [/€\s?\d|\d\s?€|\d+[.,]\d{2}/, 'Looks like a price: prices go stale, and Meta already shows the live price.'],
    [/%|korting|rabatt|discount|sale|off\b|deal|aanbieding|angebot/i, 'Discount wording: only use it once the offer is decided, and any strike-through must be the lowest price of the last 30 days.'],
    [/\bbest\b|largest|biggest|grootste|größte|#1|number one/i, 'No "best" or "largest" claims.'],
    [/\d{2,}[.,]?\d*\+?\s*(happy|customers|klanten|kunden|products|producten|produkte)/i, 'Unverified count: use "Thousands of Indian & Asian groceries" instead.'],
    [/review|★★|rated|beoordeel|bewertung/i, 'No review or rating claims.'],
  ];
  function lint(tokens) {
    const texts = [tokens.label, tokens.foodLabel, tokens.bandText, tokens.sub && tokens.sub.text, ...(tokens.rules || []).map((r) => r.text), ...(tokens.layers || []).filter((l) => !/\{(was|pct)\}/.test(l.text || '')).map((l) => String(l.text || '').replace(/\{price\}/g, ''))].filter(Boolean).join(' | ');
    // A delivery threshold ("over €29", "vanaf €29") is not a product price.
    const plain = texts.replace(/(over|from|vanaf|boven|ab|über|dès|à partir de)\s*(€\s?\d+([.,]\d{2})?|\d+([.,]\d{2})?\s?€)/gi, '');
    const out = RISKY.filter(([re]) => re.test(plain)).map(([, msg]) => msg);
    // The price label only shows with a verified reduction, so discount wording is fine there.
    const guarded = [tokens.price && tokens.price.label, ...(tokens.layers || []).filter((l) => /\{(was|pct)\}/.test(l.text || '')).map((l) => l.text)].filter(Boolean);
    for (const lbl of guarded) for (const [re, msg] of RISKY.slice(2)) if (re.test(lbl) && !out.includes(msg)) out.push(msg);
    return out;
  }

  const api = { compile, lint, texts, translate, resolve, matches, segmentTheme, priceView, layersFor, PATTERNS: Object.keys(PATTERNS), FIELDS, DEFAULTS, SHAPES: Object.keys(SHAPES) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GFHTokens = api;
})(typeof window !== 'undefined' ? window : globalThis);
