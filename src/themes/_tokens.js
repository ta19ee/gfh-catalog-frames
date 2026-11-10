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

  const DEFAULTS = {
    label: '', foodLabel: '', bandText: '',
    background: { type: 'linear', angle: 160, colors: ['#FFFFFF', '#FFFFFF'] },
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
    const css = `
body{background:${bgCss}}
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
    return { label: t.label, foodLabel: t.foodLabel, bandText: t.bandText, subText: t.sub.text, price: t.price, rules: t.rules || [], css, deco };
  }

  // Rules: [{ field, value, action: 'badge'|'tag', text }]. First matching 'tag' rule replaces the
  // tag text; first matching 'badge' rule adds a corner badge. Fields: tag, type, vendor, title, newDays.
  // product: { type, vendor, title, tags: [], createdAt, food }
  function matches(rule, p, now) {
    const v = String(rule.value == null ? '' : rule.value).trim().toLowerCase();
    if (!v && rule.field !== 'food') return false;
    switch (rule.field) {
      case 'tag': return (p.tags || []).some((t) => String(t).toLowerCase() === v);
      case 'type': return String(p.type || '').toLowerCase().includes(v);
      case 'vendor': return String(p.vendor || '').toLowerCase().includes(v);
      case 'title': return String(p.title || '').toLowerCase().includes(v);
      case 'newDays': return !!p.createdAt && (now - Date.parse(p.createdAt)) / 864e5 <= Number(v);
      case 'food': return !!p.food === (v !== 'no');
      case 'collection': return (p.collections || []).some((c) => String(c).toLowerCase().includes(v));
      case 'category': return String(p.category || '').toLowerCase().includes(v);
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
  const FIELDS = { type: 'Product type contains', collection: 'Collection contains', category: 'Shopify category contains', tag: 'Shopify tag is', vendor: 'Vendor contains', title: 'Title contains', newDays: 'Created within N days', food: 'Is grocery (yes/no)' };

  // Designs per product segment (like Confect's design per category).
  // segments: [{ field, value, theme, during }]; the first match wins. "during" limits a segment
  // to the time when that theme is the live one (blank = always).
  function segmentTheme(segments, active, p, now = Date.now()) {
    for (const s of segments || []) {
      if (s.during && s.during !== active) continue;
      if (s.theme && matches(s, p, now)) return s.theme;
    }
    return active;
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
    const texts = [tokens.label, tokens.foodLabel, tokens.bandText, tokens.sub && tokens.sub.text, ...(tokens.rules || []).map((r) => r.text)].filter(Boolean).join(' | ');
    // A delivery threshold ("over €29", "vanaf €29") is not a product price.
    const plain = texts.replace(/(over|from|vanaf|boven|ab|über|dès|à partir de)\s*€\s?\d+([.,]\d{2})?/gi, '');
    const out = RISKY.filter(([re]) => re.test(plain)).map(([, msg]) => msg);
    // The price label only shows with a verified reduction, so discount wording is fine there.
    const lbl = tokens.price && tokens.price.label;
    if (lbl) for (const [re, msg] of RISKY.slice(2)) if (re.test(lbl) && !out.includes(msg)) out.push(msg);
    return out;
  }

  const api = { compile, lint, resolve, matches, segmentTheme, priceView, FIELDS, DEFAULTS, SHAPES: Object.keys(SHAPES) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GFHTokens = api;
})(typeof window !== 'undefined' ? window : globalThis);
