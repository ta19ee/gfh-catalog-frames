# GFH catalog frames

Puts a seasonal GlobalFoodHub frame around every in-stock product photo and publishes a
Meta **supplementary feed** (`feed.csv`: `id,image_link`, one row per Shopify variant id) so
catalog and dynamic ads show the framed images. It replaces Confect.

Every 6 hours (and on every push to `main`) in GitHub Actions:
fetch (Shopify Admin API) → render (headless Chrome, cached) → feed → hosted Studio → GitHub Pages.

| URL (after setup) | What |
|---|---|
| `https://ta19ee.github.io/gfh-catalog-frames/` | Status page: live theme, sample images, products that could not be framed |
| `…/feed.csv` | The Meta supplementary feed (square image_link) |
| `…/feed-multi.csv` | Same, plus tagged 4:5 and 9:16 images for placement-aware catalog ads |
| `…/studio/` | Hosted Frame Studio (saving opens a pull request) |

## Frame Studio

```
npm run studio        # opens http://localhost:4321
```

- Live preview of the frame on real products: a grid, a single product, or **All sizes** side by side (1:1, 4:5, 9:16, 2:3), plus an exact JPEG render.
- **Sizes**: 1:1 1080×1080 (Meta image_link), 4:5 1080×1350 (Meta `ASPECT_RATIO_4_5_PREFERRED`), 9:16 1080×1920 (Meta `ASPECT_RATIO_9_16_PREFERRED`, Stories/Reels) and 2:3 1000×1500 (not used by Meta). The nightly job renders the formats listed in `config.json` → `formats`.
- **Dynamic elements**: product title, a sub-line (such as cuisines), a bottom band split into parts with `|`, rule badges and the **price block**.
- **Price block** (off by default; turn on per theme): the current Shopify price, re-rendered whenever it changes. The **-% pill, struck-through was-price and "Offer price" label appear only when our own price history proves a reduction**: the was-price is the lowest price of the 30 days before the reduction (EU Omnibus rule), and it only shows for the first N days of the reduction. The history starts on the first run.
  - **Was-price from "history"** (default, safest): only our own 30-day history, so no reduction shows during the first 30 days.
  - **Was-price from "shopify"**: the Shopify compare-at price, so reductions show straight away. You are responsible for that price being the lowest of the last 30 days. Once our history covers 30 days for a variant, it takes over and drops compare-at prices that are not a real reduction. Tick "Sample reduction" in the Studio to check the design.
- Edit tag text (generic and grocery), bottom band, background gradient, tag, plate, title, band, badge colours, decoration and extra CSS.
- **Rules**: badges and tag text driven by Shopify data, such as Shopify tag `vegan` → badge "Vegan", created within 30 days → badge "New", or vendor `Haldiram` → its own tag text. The Studio shows how many products each rule matches.
- **House-rules check**: prices, discount wording, "best"/"largest" and unverified counts or reviews are flagged while you type. `npm test` blocks the nightly publish if a saved theme breaks these rules.
- **Duplicate…** makes a new theme. **Schedule…** sets which theme is live on which dates.
- **Layers** (free layout, like Confect's editor): add text, boxes, images (upload to `assets/layers/`) and icons on top of the frame, then **drag to move and resize** them in the Single view. Each size (1:1, 4:5, 9:16, 2:3) can have its own position. Text can use `{title}` `{vendor}` `{type}` `{category}` `{price}`; `{was}` and `{pct}` only show with a real reduction. "Show only if" makes a layer conditional (tag vegan, new within 30 days, on sale and so on). **From library…** adds ready-made elements: brand name, category, Shop now button, free delivery badge, New ribbon, vegan or spicy icon, discount splash, was-price line, gift icon and assortment line.
- **Background patterns**: dots, stripes, grid or checks over the gradient.
- **Segments…** gives categories of products their own design, like Confect's design per category: for example product type contains "Beauty" → `neutral`, or collection "snacks" → `christmas` only while `winter` is live. Match on on sale (Shopify compare-at above price), product type, collection, Shopify category, tag, vendor, title, "new within N days" or grocery/non-food. Each row can also have its own From/To dates. The first matching row wins; everything else uses the live theme. "Apply segments" in the toolbar previews each product with its own design.
- **Load full catalog** downloads every product from the last cloud build (`npm run pull`), because the storefront blocks scripts from this PC. Before that the Studio shows 12 sample products.
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

## Notes on prices and sizes
- Product images now carry the price, so a Shopify price change shows in the frame after the next run (at most about 6 hours) plus Meta's feed fetch. Meta also shows its own live price under the ad.
- Variants with different prices get their own image (the feed maps each variant to the right one).
- `feed-multi.csv` uses Meta's `image[n].url` / `image[n].tag[0]` columns. Test it on a small product set in Commerce Manager before switching the live feed to it; `feed.csv` stays the safe default.
- GitHub Pages allows 1 GB. The feed step fails before publishing if images exceed 950 MB; then drop a format or lower `jpegQuality` in `config.json`.

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
npm run pull                 # full catalog from the last cloud build (for the Studio)
node src/fetch.js            # SHOPIFY_ADMIN_TOKEN: Admin API bulk export incl. collections and category; else storefront
node src/render.js --limit 20
node src/feed.js
node src/site.js
```
