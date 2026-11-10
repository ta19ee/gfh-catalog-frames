// Pulls every active product (title, main image, variants) into data/products.json.
// Uses the Shopify Admin API when SHOPIFY_ADMIN_TOKEN is set (read_products scope),
// otherwise falls back to the public storefront products.json with backoff.
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const OUT = path.join(__dirname, '..', 'data', 'products.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, init = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    await sleep(2000 * 2 ** i);
  }
  throw new Error(`gave up on ${url}`);
}

async function fromAdminApi(token) {
  const query = `query($cursor: String) {
    products(first: 250, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle productType vendor tags createdAt
        featuredImage { url }
        variants(first: 100) { nodes { id price availableForSale } }
      }
    }
  }`;
  const products = [];
  let cursor = null;
  do {
    const body = await getJson(`https://${config.shopDomain}/admin/api/2025-10/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables: { cursor } }),
    });
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    const page = body.data.products;
    for (const p of page.nodes) {
      if (!p.featuredImage) continue;
      products.push({
        id: p.id.split('/').pop(),
        title: p.title,
        handle: p.handle,
        type: p.productType || '',
        vendor: p.vendor || '',
        tags: p.tags || [],
        createdAt: p.createdAt,
        image: p.featuredImage.url,
        variants: p.variants.nodes.map((v) => ({ id: v.id.split('/').pop(), price: v.price, available: v.availableForSale })),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return products;
}

async function fromStorefront() {
  const products = [];
  for (let page = 1; ; page++) {
    const body = await getJson(`${config.storefront}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'GFH-catalog-frames/1.0' },
    });
    if (!body.products.length) break;
    for (const p of body.products) {
      if (!p.images.length) continue;
      products.push({
        id: String(p.id),
        title: p.title,
        handle: p.handle,
        type: p.product_type || '',
        vendor: p.vendor || '',
        tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
        createdAt: p.created_at,
        image: p.images[0].src,
        variants: p.variants.map((v) => ({ id: String(v.id), price: v.price, available: v.available })),
      });
    }
    await sleep(1500);
  }
  return products;
}

(async () => {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const products = token ? await fromAdminApi(token) : await fromStorefront();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(products));
  const variants = products.reduce((n, p) => n + p.variants.length, 0);
  console.log(`fetched ${products.length} products, ${variants} variants via ${token ? 'Admin API' : 'storefront'}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
