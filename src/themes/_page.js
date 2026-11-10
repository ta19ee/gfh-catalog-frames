// Shared frame layout + page builder. Used by the nightly render (Node) and the Studio
// preview (browser, window.GFHPage) so both show exactly the same frame.
// Layout adapts to each format (1:1, 4:5, 9:16, 2:3); themes only set colours and elements.
(function (root) {
  const FORMATS = {
    '1x1': { w: 1080, h: 1080, label: '1:1 · 1080×1080', metaTag: '' },
    '4x5': { w: 1080, h: 1350, label: '4:5 · 1080×1350', metaTag: 'ASPECT_RATIO_4_5_PREFERRED' },
    '9x16': { w: 1080, h: 1920, label: '9:16 · 1080×1920', metaTag: 'ASPECT_RATIO_9_16_PREFERRED' },
    '2x3': { w: 1000, h: 1500, label: '2:3 · 1000×1500', metaTag: '' },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // "3.49" -> { whole: "3", cents: "49", text: "€3,49" } (NL/BE/DE format)
  function money(v) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    const [whole, cents] = n.toFixed(2).split('.');
    return { whole, cents, text: `€${whole},${cents}` };
  }

  // Positions for a format. All sizes scale from the 1080-wide design.
  function layout(fmt, hasSub) {
    const { w, h } = FORMATS[fmt] || FORMATS['1x1'];
    const s = w / 1080;
    const r = (n) => Math.round(n * s);
    const band = r(96), headerBottom = r(150), gap = r(28);
    const titleBlock = r(hasSub ? 168 : 104);
    const plateW = r(780);
    const avail = h - band - headerBottom - gap - titleBlock - r(24);
    const plateH = Math.max(r(420), Math.min(avail, Math.round(plateW * 1.12)));
    const groupH = plateH + gap + titleBlock;
    const top = headerBottom + Math.max(0, Math.round((h - band - headerBottom - r(24) - groupH) / 2));
    return { w, h, s, band, plateW, plateH, plateLeft: Math.round((w - plateW) / 2), plateTop: top, titleTop: top + plateH + gap };
  }

  function baseCss(L) {
    const px = (n) => `${Math.round(n * L.s)}px`;
    return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${L.w}px;height:${L.h}px;overflow:hidden}
body{font-family:'Outfit',system-ui,sans-serif;position:relative;-webkit-font-smoothing:antialiased}
.logo{position:absolute;left:${px(44)};top:${px(40)};width:${px(128)};height:${px(128)};border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:5}
.logo img{width:${px(116)};height:${px(116)}}
.tag{position:absolute;right:${px(44)};top:${px(66)};font-weight:800;font-size:${px(26)};letter-spacing:${px(4)};text-transform:uppercase;padding:${px(14)} ${px(26)};border-radius:999px;z-index:5;white-space:nowrap}
.plate{position:absolute;left:${L.plateLeft}px;top:${L.plateTop}px;width:${L.plateW}px;height:${L.plateH}px;border-radius:${px(48)};background:#fff;display:grid;place-items:center;z-index:3}
.plate img{width:86%;height:86%;object-fit:contain;mix-blend-mode:multiply}
.title{position:absolute;left:${px(80)};right:${px(80)};top:${L.titleTop}px;font-weight:700;font-size:${px(40)};line-height:1.15;text-align:center;text-wrap:balance;z-index:4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sub{position:absolute;left:${px(80)};right:${px(80)};top:${L.titleTop + Math.round(104 * L.s)}px;font-weight:600;font-size:${px(28)};line-height:1.25;text-align:center;text-wrap:balance;z-index:4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.band{position:absolute;left:0;right:0;bottom:0;height:${L.band}px;display:flex;align-items:center;justify-content:center;gap:${px(28)};font-weight:800;font-size:${px(32)};z-index:4;white-space:nowrap}
.band .sep{width:${px(3)};height:${px(40)};opacity:.8}
.deco{position:absolute;z-index:1}
.badge{position:absolute;left:${L.plateLeft}px;top:${L.plateTop}px;z-index:6;font-weight:800;font-size:${px(30)};letter-spacing:${px(2)};text-transform:uppercase;padding:${px(14)} ${px(28)};border-radius:${px(48)} 0 ${px(28)} 0;white-space:nowrap}
.price{position:absolute;right:${L.plateLeft - Math.round(70 * L.s)}px;top:${L.plateTop + Math.round(40 * L.s)}px;z-index:7;display:flex;flex-direction:column;align-items:stretch;min-width:${px(240)};filter:drop-shadow(0 ${px(10)} ${px(20)} rgba(0,0,0,.25))}
.price .pill{align-self:flex-start;font-weight:800;font-size:${px(36)};padding:${px(6)} ${px(18)};border-radius:${px(10)};margin-bottom:${px(-6)};margin-left:${px(24)};position:relative;z-index:2}
.price .box{border-radius:${px(26)};padding:${px(16)} ${px(26)} ${px(14)};text-align:center;overflow:hidden}
.price .now{font-weight:800;font-size:${px(96)};line-height:1;letter-spacing:-1px;white-space:nowrap}
.price .now sup{font-size:.48em;vertical-align:top;position:relative;top:${px(8)};margin-left:${px(2)}}
.price .was{font-weight:700;font-size:${px(34)};text-decoration:line-through;opacity:.9;margin-top:${px(6)}}
.price .lbl{font-weight:800;font-size:${px(30)};padding:${px(10)} ${px(20)};margin:${px(12)} ${px(-26)} ${px(-14)}}
`;
  }

  // theme: compiled tokens; o: { label, badge, title, sub, photo, logo, bandText, price: { now, ref, pct } }
  function build(theme, o, fmt = '1x1') {
    const L = layout(fmt, !!o.sub);
    const segs = String(o.bandText || '').split('|').map((x) => x.trim()).filter(Boolean);
    const band = segs.map((x) => `<span>${esc(x)}</span>`).join('<i class="sep"></i>');
    let price = '';
    const P = theme.price || {};
    const now = o.price && money(o.price.now);
    if (P.show && now) {
      const reduced = o.price.ref && o.price.pct >= (P.minPct || 5);
      const ref = reduced && money(o.price.ref);
      price = `<div class="price">${reduced && P.showPct !== false ? `<div class="pill">-${Math.round(o.price.pct)}%</div>` : ''}<div class="box"><div class="now">€${esc(now.whole)}<sup>${esc(now.cents)}</sup></div>${ref && P.showReference !== false ? `<div class="was">${esc(ref.text)}</div>` : ''}${reduced && P.label ? `<div class="lbl">${esc(P.label)}</div>` : ''}</div></div>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&display=block" rel="stylesheet">
<style>${baseCss(L)}${theme.css}</style></head><body>
${scaleDeco(theme.deco || '', L)}
<div class="logo"><img src="${esc(o.logo)}" alt=""></div>
${o.label ? `<div class="tag">${esc(o.label)}</div>` : ''}
${o.badge ? `<div class="badge">${esc(o.badge)}</div>` : ''}
<div class="plate"><img src="${esc(o.photo)}" alt=""></div>
${price}
<div class="title">${esc(o.title)}</div>
${o.sub ? `<div class="sub">${esc(o.sub)}</div>` : ''}
<div class="band">${band}</div>
</body></html>`;
  }

  // Decorations are drawn for 1080x1080; stretch their positions to the format.
  function scaleDeco(html, L) {
    if (L.w === 1080 && L.h === 1080) return html;
    return html.replace(/left:(\d+)px;top:(\d+)px/g, (m, x, y) => `left:${Math.round(x * L.w / 1080)}px;top:${Math.round(y * L.h / 1080)}px`);
  }

  const api = { FORMATS, build, esc, money, layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GFHPage = api;
})(typeof window !== 'undefined' ? window : globalThis);
