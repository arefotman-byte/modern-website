import crypto from 'crypto';
import { drainInbox, dryRunId, requestJson, requireEnv } from './shared';
import type { ChannelAdapter, ChannelOrder } from './types';

/**
 * Walmart Marketplace API (client-credentials auth). Dry-run until
 * credentials are set. Walmart only admits approved sellers (US business).
 *
 * NOTE: written from Walmart's documented shapes but not yet exercised against
 * Walmart. Test against the sandbox (WALMART_ENV=sandbox) first. Item
 * publishing goes through the async MP_ITEM feed, whose spec version and
 * product-type fields change over time; check the current item spec.
 *
 * Env:
 *   WALMART_CLIENT_ID, WALMART_CLIENT_SECRET
 *   WALMART_ENV=sandbox|production       (default sandbox)
 *   WALMART_ITEM_SPEC_VERSION=5.0.20241118-04_39_24-api   (from the current MP_ITEM spec)
 */
const env = () => ({
  clientId: process.env.WALMART_CLIENT_ID ?? '',
  clientSecret: process.env.WALMART_CLIENT_SECRET ?? '',
  base: process.env.WALMART_ENV === 'production' ? 'https://marketplace.walmartapis.com' : 'https://sandbox.walmartapis.com',
  specVersion: process.env.WALMART_ITEM_SPEC_VERSION ?? '',
});

const isDryRun = () => process.env.WALMART_DRY_RUN === '1' || !env().clientId || !env().clientSecret;

const baseHeaders = () => ({
  'WM_SVC.NAME': 'Walmart Marketplace',
  'WM_QOS.CORRELATION_ID': crypto.randomUUID(),
  Accept: 'application/json',
});

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = env();
  const data = await requestJson<{ access_token: string; expires_in: number }>('Walmart auth', `${e.base}/v3/token`, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      Authorization: `Basic ${Buffer.from(`${e.clientId}:${e.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function wm<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestJson<T>('Walmart', `${env().base}${path}`, {
    method,
    headers: { ...baseHeaders(), 'WM_SEC.ACCESS_TOKEN': await accessToken(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type WalmartOrder = {
  purchaseOrderId: string;
  customerEmailId?: string;
  shippingInfo?: {
    postalAddress?: { name?: string; address1?: string; address2?: string; city?: string; state?: string; postalCode?: string; country?: string };
  };
  orderLines?: {
    orderLine?: {
      lineNumber: string;
      item?: { sku?: string };
      orderLineQuantity?: { amount?: string };
      charges?: { charge?: { chargeAmount?: { amount?: number } }[] };
    }[];
  };
};

export const walmartChannel: ChannelAdapter = {
  name: 'walmart',
  label: 'Walmart',
  // Referral fee is 15% for most categories; no per-order fee.
  feeRate: 0.15,
  fixedFee: 0,
  maxTitleLength: 150,
  dryRun: isDryRun,

  async suggestCategories(query) {
    if (isDryRun()) return [{ id: 'Home Decor', name: `(dry run) product type for "${query}"` }];
    // Walmart's taxonomy lists categories > product types; match by keyword.
    const data = await wm<{ payload?: { category: string; subcategory?: { subCategoryName: string; subCategoryId: string }[] }[] }>(
      'GET',
      '/v3/items/taxonomy',
    );
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const all = (data.payload ?? []).flatMap((c) =>
      (c.subcategory ?? []).map((s) => ({ id: s.subCategoryName, name: `${c.category} > ${s.subCategoryName}` })),
    );
    return all
      .map((c) => ({ c, hits: words.filter((w) => c.name.toLowerCase().includes(w)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 8)
      .map((x) => x.c);
  },

  async publish({ sku, listing, product, title, price, quantity, categoryId, aspects }) {
    if (isDryRun()) return { externalId: dryRunId() };
    const e = env();
    requireEnv('Walmart', { WALMART_ITEM_SPEC_VERSION: e.specVersion, productType: categoryId });
    if (!product.gtin) throw new Error('Walmart requires a UPC/GTIN for every item; the supplier product has none');
    if (!product.images?.length) throw new Error('Walmart requires product photos; the supplier product has none');

    const visible: Record<string, unknown> = {
      shortDescription: listing.description,
      keyFeatures: listing.bullets,
      mainImageUrl: product.images[0],
      productSecondaryImageURL: product.images.slice(1, 6),
    };
    for (const a of aspects) if (a.name !== 'Brand') visible[a.name] = a.value;

    const feed = await wm<{ feedId: string }>('POST', '/v3/feeds?feedType=MP_ITEM', {
      MPItemFeedHeader: { version: e.specVersion, processMode: 'REPLACE', subset: 'EXTERNAL', locale: 'en', sellingChannel: 'marketplace' },
      MPItem: [
        {
          Orderable: {
            sku,
            productIdentifiers: { productIdType: 'GTIN', productId: product.gtin.padStart(14, '0') },
            productName: title,
            brand: 'Unbranded',
            price,
            ShippingWeight: product.weightLb ?? 1,
          },
          Visible: { [categoryId!]: visible },
        },
      ],
    });
    await wm('PUT', `/v3/inventory?sku=${encodeURIComponent(sku)}`, { sku, quantity: { unit: 'EACH', amount: quantity } });
    // The feed is processed asynchronously; check its status in Seller Center (or /v3/feeds/{feedId}).
    return { externalId: feed.feedId };
  },

  async fetchNewOrders() {
    if (isDryRun()) return drainInbox('walmart');
    const out: ChannelOrder[] = [];
    // New orders must be acknowledged; already-acknowledged ones are de-duplicated on import.
    for (const status of ['Created', 'Acknowledged']) {
      const data = await wm<{ list?: { elements?: { order?: WalmartOrder[] } } }>('GET', `/v3/orders?status=${status}&limit=100`);
      for (const o of data.list?.elements?.order ?? []) {
        if (status === 'Created') await wm('POST', `/v3/orders/${o.purchaseOrderId}/acknowledge`);
        const a = o.shippingInfo?.postalAddress ?? {};
        const address = [a.address1, a.address2, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(', ');
        for (const line of o.orderLines?.orderLine ?? []) {
          if (!line.item?.sku) continue;
          const qty = Number(line.orderLineQuantity?.amount ?? 1);
          out.push({
            channel: 'walmart',
            externalOrderId: o.purchaseOrderId,
            lineItemId: line.lineNumber,
            sku: line.item.sku,
            quantity: qty,
            total: (line.charges?.charge ?? []).reduce((s, c) => s + (c.chargeAmount?.amount ?? 0), 0),
            buyer: { name: a.name ?? 'Walmart customer', email: o.customerEmailId ?? '', address },
          });
        }
      }
    }
    return out;
  },

  async markShipped(order, tracking) {
    if (isDryRun()) return;
    await wm('POST', `/v3/orders/${order.externalOrderId}/shipping`, {
      orderShipment: {
        orderLines: {
          orderLine: [
            {
              lineNumber: order.lineItemId,
              orderLineStatuses: {
                orderLineStatus: [
                  {
                    status: 'Shipped',
                    statusQuantity: { unitOfMeasurement: 'EACH', amount: String(order.quantity) },
                    trackingInfo: {
                      shipDateTime: Date.now(),
                      carrierName: { carrier: tracking.carrier },
                      methodCode: 'Standard',
                      trackingNumber: tracking.number,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
  },
};
