// Shared frame layout + page builder. Used by the nightly render (Node) and the Studio
// preview (browser, window.GFHPage) so both show exactly the same frame.
// No price is ever printed on the image: Meta shows the live price under the ad.
(function (root) {
  const BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1080px;overflow:hidden}
body{font-family:'Outfit',system-ui,sans-serif;position:relative;-webkit-font-smoothing:antialiased}
.logo{position:absolute;left:44px;top:40px;width:128px;height:128px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:5}
.logo img{width:116px;height:116px}
.tag{position:absolute;right:44px;top:66px;font-weight:800;font-size:26px;letter-spacing:4px;text-transform:uppercase;padding:14px 26px;border-radius:999px;z-index:5;white-space:nowrap}
.plate{position:absolute;left:150px;top:150px;width:780px;height:640px;border-radius:48px;background:#fff;display:grid;place-items:center;z-index:3}
.plate img{width:86%;height:86%;object-fit:contain;mix-blend-mode:multiply}
.title{position:absolute;left:80px;right:80px;top:818px;font-weight:700;font-size:40px;line-height:1.15;text-align:center;text-wrap:balance;z-index:4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.band{position:absolute;left:0;right:0;bottom:0;height:96px;display:flex;align-items:center;justify-content:center;gap:22px;font-weight:800;font-size:34px;z-index:4}
.band .dot{width:10px;height:10px;border-radius:50%}
.deco{position:absolute;z-index:1}
.badge{position:absolute;left:150px;top:150px;z-index:6;font-weight:800;font-size:30px;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;border-radius:48px 0 28px 0;white-space:nowrap}
`;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // theme: compiled { css, deco }; opts: { label, badge, title, photo, logo, bandText }
  function build(theme, o) {
    return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&display=block" rel="stylesheet">
<style>${BASE}${theme.css}</style></head><body>
${theme.deco || ''}
<div class="logo"><img src="${esc(o.logo)}" alt=""></div>
${o.label ? `<div class="tag">${esc(o.label)}</div>` : ''}
${o.badge ? `<div class="badge">${esc(o.badge)}</div>` : ''}
<div class="plate"><img src="${esc(o.photo)}" alt=""></div>
<div class="title">${esc(o.title)}</div>
<div class="band"><span>${esc(o.bandText)}</span></div>
</body></html>`;
  }

  const api = { BASE, build, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GFHPage = api;
})(typeof window !== 'undefined' ? window : globalThis);
