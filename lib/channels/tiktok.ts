import crypto from 'crypto';
import { descriptionHtml, drainInbox, dryRunId, requestJson, requireEnv } from './shared';
import type { ChannelAdapter, ChannelOrder } from './types';

/**
 * TikTok Shop Partner API (versioned 202309 endpoints, HMAC-SHA256 signed).
 * Dry-run until credentials are set.
 *
 * NOTE: written from TikTok Shop's documented shapes but not yet exercised
 * against TikTok. TikTok Shop changes its logistics rules often (e.g. required
 * TikTok shipping labels); check Seller Center before going live.
 *
 * Env:
 *   TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_REFRESH_TOKEN, TIKTOK_SHOP_CIPHER
 *   TIKTOK_WAREHOUSE_ID               (your ship-from warehouse in Seller Center)
 *   TIKTOK_SHIPPING_PROVIDER_ID       (carrier id used when marking packages shipped)
 */
const BASE = 'https://open-api.tiktokglobalshop.com';

const env = () => ({
  appKey: process.env.TIKTOK_APP_KEY ?? '',
  appSecret: process.env.TIKTOK_APP_SECRET ?? '',
  refreshToken: process.env.TIKTOK_REFRESH_TOKEN ?? '',
  shopCipher: process.env.TIKTOK_SHOP_CIPHER ?? '',
  warehouseId: process.env.TIKTOK_WAREHOUSE_ID ?? '',
  shippingProviderId: process.env.TIKTOK_SHIPPING_PROVIDER_ID ?? '',
});

const isDryRun = () => {
  const e = env();
  return process.env.TIKTOK_DRY_RUN === '1' || !e.appKey || !e.appSecret || !e.refreshToken || !e.shopCipher;
};

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = env();
  const q = new URLSearchParams({ app_key: e.appKey, app_secret: e.appSecret, refresh_token: e.refreshToken, grant_type: 'refresh_token' });
  const res = await requestJson<{ code: number; message: string; data?: { access_token: string; access_token_expire_in: number } }>(
    'TikTok auth',
    `https://auth.tiktok-shops.com/api/v2/token/refresh?${q}`,
    { method: 'GET' },
  );
  if (res.code !== 0 || !res.data) throw new Error(`TikTok auth failed: ${res.message}`);
  token = { value: res.data.access_token, expiresAt: res.data.access_token_expire_in * 1000 };
  return token.value;
}

/** sign = hex(HMAC_SHA256(secret, secret + path + sorted(k+v) + body + secret)) */
function sign(path: string, params: Record<string, string>, body: string) {
  const secret = env().appSecret;
  const joined = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return crypto.createHmac('sha256', secret).update(`${secret}${path}${joined}${body}${secret}`).digest('hex');
}

async function tt<T>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown; form?: FormData } = {}) {
  const e = env();
  const params: Record<string, string> = {
    app_key: e.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    shop_cipher: e.shopCipher,
    ...(opts.query ?? {}),
  };
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  params.sign = sign(path, params, opts.form ? '' : bodyText);
  const res = await requestJson<{ code: number; message: string; data: T }>('TikTok Shop', `${BASE}${path}?${new URLSearchParams(params)}`, {
    method,
    headers: {
      'x-tts-access-token': await accessToken(),
      ...(opts.form ? {} : { 'Content-Type': 'application/json' }),
    },
    body: opts.form ?? (bodyText || undefined),
  });
  if (res.code !== 0) throw new Error(`TikTok Shop ${path} failed: ${res.message} (code ${res.code})`);
  return res.data;
}

/** TikTok only accepts images uploaded to its own CDN. */
async function uploadImage(url: string) {
  const img = await fetch(url);
  if (!img.ok) throw new Error(`Could not download product image ${url}`);
  const form = new FormData();
  form.append('data', await img.blob(), 'image.jpg');
  form.append('use_case', 'MAIN_IMAGE');
  const data = await tt<{ uri: string }>('POST', '/product/202309/images/upload', { form });
  return data.uri;
}

export const tiktokChannel: ChannelAdapter = {
  name: 'tiktok',
  label: 'TikTok Shop',
  // Referral fee ~6% for most US categories (plus any affiliate commission you offer creators).
  feeRate: 0.06,
  fixedFee: 0,
  maxTitleLength: 255,
  dryRun: isDryRun,

  async suggestCategories(query) {
    if (isDryRun()) return [{ id: 'DRYRUN', name: `(dry run) category for "${query}"` }];
    const data = await tt<{ leaf_category_id?: string; categories?: { id: string; name: string; is_leaf?: boolean }[] }>(
      'POST',
      '/product/202309/categories/recommend',
      { body: { product_title: query } },
    );
    const path = (data.categories ?? []).map((c) => c.name).join(' > ');
    return data.leaf_category_id ? [{ id: data.leaf_category_id, name: path || 'Recommended category' }] : [];
  },

  async publish({ sku, listing, product, title, price, quantity, categoryId, aspects }) {
    if (isDryRun()) return { externalId: dryRunId() };
    const e = env();
    requireEnv('TikTok Shop', { TIKTOK_WAREHOUSE_ID: e.warehouseId, category: categoryId });
    if (!product.images?.length) throw new Error('TikTok Shop requires product photos; the supplier product has none');

    const uris = [];
    for (const url of product.images.slice(0, 9)) uris.push({ uri: await uploadImage(url) });
    const data = await tt<{ product_id: string }>('POST', '/product/202309/products', {
      body: {
        title,
        description: descriptionHtml(listing.description, listing.bullets),
        category_id: categoryId,
        main_images: uris,
        package_weight: { value: String(product.weightLb ?? 1), unit: 'POUND' },
        skus: [
          {
            seller_sku: sku,
            price: { amount: price.toFixed(2), currency: 'USD' },
            inventory: [{ warehouse_id: e.warehouseId, quantity }],
          },
        ],
        // Category attributes the agent supplies by name are passed as custom values.
        product_attributes: aspects
          .filter((a) => a.name !== 'Brand')
          .map((a) => ({ name: a.name, values: [{ name: a.value }] })),
      },
    });
    return { externalId: data.product_id, url: `https://shop.tiktok.com/view/product/${data.product_id}` };
  },

  async fetchNewOrders() {
    if (isDryRun()) return drainInbox('tiktok');
    const data = await tt<{
      orders?: {
        id: string;
        payment?: { total_amount?: string };
        buyer_email?: string;
        recipient_address?: { name?: string; full_address?: string };
        line_items?: { id: string; seller_sku?: string }[];
      }[];
    }>('POST', '/order/202309/orders/search', { query: { page_size: '50' }, body: { order_status: 'AWAITING_SHIPMENT' } });

    const out: ChannelOrder[] = [];
    for (const o of data.orders ?? []) {
      // TikTok returns one line item per unit; group them by SKU.
      const bySku = new Map<string, string[]>();
      for (const li of o.line_items ?? []) if (li.seller_sku) bySku.set(li.seller_sku, [...(bySku.get(li.seller_sku) ?? []), li.id]);
      for (const [sku, ids] of Array.from(bySku.entries())) {
        out.push({
          channel: 'tiktok',
          externalOrderId: o.id,
          lineItemId: ids.join(','),
          sku,
          quantity: ids.length,
          total: Number(o.payment?.total_amount ?? 0),
          buyer: { name: o.recipient_address?.name ?? 'TikTok buyer', email: o.buyer_email ?? '', address: o.recipient_address?.full_address ?? '' },
        });
      }
    }
    return out;
  },

  async markShipped(order, tracking) {
    if (isDryRun()) return;
    requireEnv('TikTok Shop', { TIKTOK_SHIPPING_PROVIDER_ID: env().shippingProviderId });
    await tt('POST', `/fulfillment/202309/orders/${order.externalOrderId}/packages`, {
      body: {
        order_line_item_ids: order.lineItemId.split(','),
        tracking_number: tracking.number,
        shipping_provider_id: env().shippingProviderId,
      },
    });
  },
};
