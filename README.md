# GFH catalog frames

Puts a seasonal GlobalFoodHub frame around every in-stock product photo and publishes a
Meta **supplementary feed** (`feed.csv`: `id,image_link`, one row per Shopify variant id) so
catalog and dynamic ads show the framed images. It replaces Confect.

Daily (and on every push to `main`) in GitHub Actions:
fetch (Shopify Admin API) → render (headless Chrome, cached) → feed → hosted Studio → GitHub Pages.

| URL (after setup) | What |
|---|---|
| `https://ta19ee.github.io/gfh-catalog-frames/` | Status page: live theme, sample images, products that could not be framed |
| `…/feed.csv` | The Meta supplementary feed |
| `…/studio/` | Hosted Frame Studio (saving opens a pull request) |

## Frame Studio

```
npm run studio        # opens http://localhost:4321
```

- Live preview of the frame on real products (grid, or a single product with exact JPEG render).
- Edit tag text (generic and grocery), bottom band, background gradient, tag, plate, title, band, badge colours, decoration and extra CSS.
- **Rules**: badges and tag text driven by Shopify data, such as Shopify tag `vegan` → badge "Vegan", created within 30 days → badge "New", or vendor `Haldiram` → its own tag text. The Studio shows how many products each rule matches.
- **House-rules check**: prices, discount wording, "best"/"largest" and unverified counts or reviews are flagged while you type. `npm test` blocks the nightly publish if a saved theme breaks these rules.
- **Duplicate…** makes a new theme. **Schedule…** sets which theme is live on which dates.
- Local saves write `src/themes/<name>.js` and `config.json`. Commit and push them to go live.
- The hosted Studio (`/studio/` on Pages) has the same editor. Saving there opens a GitHub pull request; merging it is the approval step. It asks once for a GitHub fine-grained token (this repo only, Contents + Pull requests read/write), which is kept only in that browser.

## Themes

One file per theme in `src/themes/<name>.js`, a plain object of design tokens
(see `src/themes/_tokens.js` for every option and default). The layout is in `src/themes/_page.js`
and is shared by the Studio preview and the nightly render, so both produce the same image.

```
npm run preview -- winter    # contact sheet previews/winter.jpg from 12 products
npm run preview              # all themes
```

### Which theme is live
1. The `theme` input on a manual workflow run (or the `THEME` env var)
2. The first date range in `config.json` → `schedule` that contains today
3. `config.json` → `theme` (the default)

Editing or switching the live theme re-renders every image in the next run
(about 3,400 products, roughly 20–40 minutes in Actions). Otherwise only new or changed products render.

### House rules for templates
- Never print a price: Meta shows the live price.
- No discount or strike-through claims unless the offer is decided. Under EU rules a strike-through price must be the lowest price of the last 30 days.
- No unverified claims (no customer counts, "largest", or "best"). Use "Thousands of Indian & Asian groceries".

## Go-live checklist
1. Create the public repo and push:
   `gh repo create ta19ee/gfh-catalog-frames --public --source . --push`
2. Enable Pages from Actions:
   `gh api -X POST repos/ta19ee/gfh-catalog-frames/pages -f build_type=workflow`
3. Shopify: create a custom app with `read_products` and add its Admin API token as the repo secret `SHOPIFY_ADMIN_TOKEN`
   (`gh secret set SHOPIFY_ADMIN_TOKEN` and paste it in your own terminal).
4. Run the workflow (Actions → Build catalog frames → Run workflow), then check the status page and `feed.csv`.
5. Meta Commerce Manager, catalog 274908271500060: pause the Confect supplementary feed, then add a supplementary feed with the scheduled URL `…/feed.csv` (daily).
   Two feeds that both override `image_link` conflict, so only one can be active.
6. Keep Confect for about 2 weeks as a fallback and compare catalog ad performance before cancelling.

## Local pipeline
```
npm test
node src/fetch.js            # needs SHOPIFY_ADMIN_TOKEN (the storefront rate-limits scripts)
node src/render.js --limit 20
node src/feed.js
node src/site.js
```
