// Pulls every active product into data/products.json:
// title, main image, type, vendor, tags, created date, collections, category and variants
// (id, price, compare-at price, availability).
// - With SHOPIFY_ADMIN_TOKEN (read_products): Shopify Admin API bulk export (no query-cost limits).
// - Otherwise: the public storefront products.json (no collections or category).
// - With --from-site: download the catalog the cloud build published (for the local Studio).
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'products.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = `https://${config.shopDomain}/admin/api/2025-10/graphql.json`;

async function getJson(url, init = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    await sleep(2000 * 2 ** i);
  }
  throw new Error(`gave up on ${url}`);
}

async function gql(token, query, variables) {
  const body = await getJson(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

async function fromAdminApi(token) {
  const bulkQuery = `{
    products(query: "status:active") {
      edges { node {
        id title handle productType vendor tags createdAt
        featuredImage { url }
        category { fullName }
        collections { edges { node { id handle title } } }
        variants { edges { node { id price compareAtPrice availableForSale } } }
      } }
    }
  }`;
  const start = await gql(token, `mutation($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id } userErrors { field message } } }`, { q: bulkQuery });
  const errs = start.bulkOperationRunQuery.userErrors;
  if (errs.length) throw new Error(JSON.stringify(errs));
  let op;
  for (let i = 0; i < 360; i++) {
    await sleep(5000);
    op = (await gql(token, '{ currentBulkOperation { id status errorCode objectCount url } }')).currentBulkOperation;
    if (op && ['COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED'].includes(op.status)) break;
  }
  if (!op || op.status !== 'COMPLETED') throw new Error(`bulk export ${op ? op.status + ' ' + (op.errorCode || '') : 'did not start'}`);
  if (!op.url) return []; // no products
  const text = await (await fetch(op.url)).text();

  // JSONL: products first, then children (variants, collections) pointing to them via __parentId.
  const byId = new Map();
  const id = (gid) => gid.split('/').pop();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.id && row.id.includes('/Product/')) {
      byId.set(row.id, {
        id: id(row.id),
        title: row.title,
        handle: row.handle,
        type: row.productType || '',
        vendor: row.vendor || '',
        tags: row.tags || [],
        createdAt: row.createdAt,
        category: (row.category && row.category.fullName) || '',
        collections: [],
        image: row.featuredImage && row.featuredImage.url,
        variants: [],
      });
    } else if (row.__parentId && byId.has(row.__parentId)) {
      const p = byId.get(row.__parentId);
      if (row.id.includes('/ProductVariant/')) p.variants.push({ id: id(row.id), price: row.price, compareAt: row.compareAtPrice || null, available: row.availableForSale });
      else if (row.id.includes('/Collection/')) p.collections.push(row.handle, row.title);
    }
  }
  return [...byId.values()].filter((p) => p.image);
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
        category: '',
        collections: [],
        image: p.images[0].src,
        variants: p.variants.map((v) => ({ id: String(v.id), price: v.price, compareAt: v.compare_at_price || null, available: v.available })),
      });
    }
    await sleep(1500);
  }
  return products;
}

// Newest "catalog" download from a cloud run (needs the GitHub CLI, logged in). Available as soon
// as a run has fetched products, without waiting for the render.
function fromArtifact() {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const list = JSON.parse(execFileSync('gh', ['api', `repos/${config.repo}/actions/artifacts?name=catalog&per_page=5`], { encoding: 'utf8' }));
  const a = (list.artifacts || []).find((x) => !x.expired);
  if (!a) throw new Error('no catalog download yet: run "gh workflow run catalog.yml" and try again in a minute');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfh-catalog-'));
  execFileSync('gh', ['run', 'download', String(a.workflow_run.id), '-R', config.repo, '-n', 'catalog', '-D', dir], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(dir, 'products.json'), 'utf8'));
}

async function fromSite() {
  const base = config.siteUrl;
  let products;
  try {
    products = await getJson(`${base}/data/products.json`, {}, 2);
  } catch (e) {
    products = fromArtifact(); // site not published yet (first render still running)
  }
  try {
    const hist = await getJson(`${base}/price-history.json`, {}, 2);
    fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'public', 'price-history.json'), JSON.stringify(hist));
  } catch {}
  return products;
}

async function main(mode = process.argv.includes('--from-site') ? 'site' : process.env.SHOPIFY_ADMIN_TOKEN ? 'admin' : 'storefront') {
  const products = mode === 'site' ? await fromSite() : mode === 'admin' ? await fromAdminApi(process.env.SHOPIFY_ADMIN_TOKEN) : await fromStorefront();
  if (!products.length) throw new Error('no products fetched');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(products));
  const variants = products.reduce((n, p) => n + p.variants.length, 0);
  const msg = `fetched ${products.length} products, ${variants} variants via ${mode === 'site' ? 'the cloud build' : mode === 'admin' ? 'Admin API' : 'storefront'}`;
  console.log(msg);
  return msg;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main };
