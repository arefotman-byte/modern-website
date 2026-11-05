import { descriptionHtml, drainInbox, dryRunId, requestJson, requireEnv } from './shared';
import type { ChannelAdapter, ChannelOrder } from './types';

/**
 * Amazon via the Selling Partner API (SP-API), authorised with a Login with
 * Amazon (LWA) refresh token. Dry-run until credentials are set.
 *
 * NOTE: written from SP-API's documented shapes but not yet exercised against
 * Amazon. Test against the SP-API sandbox (AMAZON_ENV=sandbox) first.
 *
 * Uses: Product Type Definitions (category), Listings Items (publish),
 * Orders (fetch + shipment confirmation) and Tokens (restricted data token so
 * we can read the buyer's shipping address; needs the PII role on your app).
 *
 * Env:
 *   AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET, AMAZON_REFRESH_TOKEN
 *   AMAZON_SELLER_ID                 (merchant token)
 *   AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER (amazon.com)
 *   AMAZON_REGION_ENDPOINT=https://sellingpartnerapi-na.amazon.com
 *   AMAZON_ENV=sandbox|production    (default sandbox)
 *   AMAZON_GTIN_EXEMPT=1             (only if Amazon granted you a GTIN exemption)
 */
const env = () => {
  const endpoint = process.env.AMAZON_REGION_ENDPOINT ?? 'https://sellingpartnerapi-na.amazon.com';
  return {
    clientId: process.env.AMAZON_LWA_CLIENT_ID ?? '',
    clientSecret: process.env.AMAZON_LWA_CLIENT_SECRET ?? '',
    refreshToken: process.env.AMAZON_REFRESH_TOKEN ?? '',
    sellerId: process.env.AMAZON_SELLER_ID ?? '',
    marketplaceId: process.env.AMAZON_MARKETPLACE_ID ?? 'ATVPDKIKX0DER',
    base: process.env.AMAZON_ENV === 'production' ? endpoint : endpoint.replace('https://', 'https://sandbox.'),
    gtinExempt: process.env.AMAZON_GTIN_EXEMPT === '1',
  };
};

const isDryRun = () => {
  const e = env();
  return process.env.AMAZON_DRY_RUN === '1' || !e.clientId || !e.clientSecret || !e.refreshToken || !e.sellerId;
};

let token: { value: string; expiresAt: number } | null = null;

async function lwaToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = env();
  const data = await requestJson<{ access_token: string; expires_in: number }>('Amazon auth', 'https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: e.refreshToken,
      client_id: e.clientId,
      client_secret: e.clientSecret,
    }),
  });
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function sp<T>(method: string, path: string, body?: unknown, accessToken?: string): Promise<T> {
  return requestJson<T>('Amazon', `${env().base}${path}`, {
    method,
    headers: { 'x-amz-access-token': accessToken ?? (await lwaToken()), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Amazon attribute values are arrays of { value, marketplace_id, language_tag? }. */
const attr = (value: unknown, lang = true) => {
  const m = env().marketplaceId;
  return [{ value, marketplace_id: m, ...(lang ? { language_tag: 'en_US' } : {}) }];
};

export const amazonChannel: ChannelAdapter = {
  name: 'amazon',
  label: 'Amazon',
  // Referral fee is 15% for most categories (8% for some); no per-order fee on the Professional plan.
  feeRate: 0.15,
  fixedFee: 0,
  maxTitleLength: 200,
  dryRun: isDryRun,

  async suggestCategories(query) {
    if (isDryRun()) return [{ id: 'HOME', name: `(dry run) product type for "${query}"` }];
    const e = env();
    const data = await sp<{ productTypes?: { name: string; displayName?: string }[] }>(
      'GET',
      `/definitions/2020-09-01/productTypes?keywords=${encodeURIComponent(query)}&marketplaceIds=${e.marketplaceId}`,
    );
    return (data.productTypes ?? []).slice(0, 8).map((p) => ({ id: p.name, name: p.displayName ?? p.name }));
  },

  async publish({ sku, listing, product, title, price, quantity, categoryId, aspects }) {
    if (isDryRun()) return { externalId: dryRunId() };
    const e = env();
    requireEnv('Amazon', { productType: categoryId });
    if (!product.gtin && !e.gtinExempt)
      throw new Error('Amazon requires a UPC/EAN (GTIN) for this product, or a GTIN exemption (AMAZON_GTIN_EXEMPT=1)');
    if (!product.images?.length) throw new Error('Amazon requires at least one product photo; the supplier product has none');

    const attributes: Record<string, unknown> = {
      item_name: attr(title),
      brand: attr('Unbranded'),
      product_description: attr(descriptionHtml(listing.description, listing.bullets)),
      bullet_point: listing.bullets.map((b) => attr(b)[0]),
      condition_type: attr('new_new', false),
      main_product_image_locator: [{ media_location: product.images[0], marketplace_id: e.marketplaceId }],
      other_product_image_locator_1: product.images[1]
        ? [{ media_location: product.images[1], marketplace_id: e.marketplaceId }]
        : undefined,
      purchasable_offer: [
        { currency: 'USD', marketplace_id: e.marketplaceId, our_price: [{ schedule: [{ value_with_tax: price }] }] },
      ],
      fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity }],
      ...(product.gtin
        ? { externally_assigned_product_identifier: [{ type: product.gtin.length === 13 ? 'ean' : 'upc', value: product.gtin, marketplace_id: e.marketplaceId }] }
        : { supplier_declared_has_product_identifier_exemption: attr(true, false) }),
    };
    // Extra attributes the agent supplies (snake_case Amazon attribute names, e.g. "material", "color").
    for (const a of aspects) if (a.name !== 'Brand') attributes[a.name] = attr(a.value);
    for (const k of Object.keys(attributes)) if (attributes[k] === undefined) delete attributes[k];

    const res = await sp<{ status: string; submissionId: string; issues?: { code: string; message: string; severity: string }[] }>(
      'PUT',
      `/listings/2021-08-01/items/${e.sellerId}/${encodeURIComponent(sku)}?marketplaceIds=${e.marketplaceId}`,
      { productType: categoryId, requirements: 'LISTING', attributes },
    );
    const errors = (res.issues ?? []).filter((i) => i.severity === 'ERROR');
    if (res.status !== 'ACCEPTED' || errors.length)
      throw new Error(`Amazon rejected the listing: ${errors.map((i) => `${i.code} ${i.message}`).join('; ') || res.status}`);
    // Amazon processes asynchronously; the SKU is our id until an ASIN is assigned.
    return { externalId: sku, url: `https://sellercentral.amazon.com/skucentral?mSku=${encodeURIComponent(sku)}` };
  },

  async fetchNewOrders() {
    if (isDryRun()) return drainInbox('amazon');
    const e = env();
    // A restricted data token lets getOrders include the buyer's shipping address.
    const rdt = await sp<{ restrictedDataToken: string }>('POST', '/tokens/2021-03-01/restrictedDataToken', {
      restrictedResources: [{ method: 'GET', path: '/orders/v0/orders', dataElements: ['shippingAddress', 'buyerInfo'] }],
    });
    const createdAfter = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const data = await sp<{
      payload?: {
        Orders?: {
          AmazonOrderId: string;
          OrderTotal?: { Amount: string };
          ShippingAddress?: {
            Name?: string;
            AddressLine1?: string;
            AddressLine2?: string;
            City?: string;
            StateOrRegion?: string;
            PostalCode?: string;
            CountryCode?: string;
          };
          BuyerInfo?: { BuyerEmail?: string };
        }[];
      };
    }>(
      'GET',
      `/orders/v0/orders?MarketplaceIds=${e.marketplaceId}&OrderStatuses=Unshipped,PartiallyShipped&FulfillmentChannels=MFN&CreatedAfter=${encodeURIComponent(createdAfter)}`,
      undefined,
      rdt.restrictedDataToken,
    );

    const out: ChannelOrder[] = [];
    for (const o of data.payload?.Orders ?? []) {
      const items = await sp<{ payload?: { OrderItems?: { OrderItemId: string; SellerSKU?: string; QuantityOrdered: number }[] } }>(
        'GET',
        `/orders/v0/orders/${o.AmazonOrderId}/orderItems`,
      );
      const a = o.ShippingAddress ?? {};
      const address = [a.AddressLine1, a.AddressLine2, a.City, a.StateOrRegion, a.PostalCode, a.CountryCode].filter(Boolean).join(', ');
      for (const it of items.payload?.OrderItems ?? []) {
        if (!it.SellerSKU) continue;
        out.push({
          channel: 'amazon',
          externalOrderId: o.AmazonOrderId,
          lineItemId: it.OrderItemId,
          sku: it.SellerSKU,
          quantity: it.QuantityOrdered,
          total: Number(o.OrderTotal?.Amount ?? 0),
          buyer: { name: a.Name ?? 'Amazon buyer', email: o.BuyerInfo?.BuyerEmail ?? '', address },
        });
      }
    }
    return out;
  },

  async markShipped(order, tracking) {
    if (isDryRun()) return;
    await sp('POST', `/orders/v0/orders/${order.externalOrderId}/shipmentConfirmation`, {
      marketplaceId: env().marketplaceId,
      packageDetail: {
        packageReferenceId: '1',
        carrierCode: tracking.carrier,
        trackingNumber: tracking.number,
        shipDate: new Date().toISOString(),
        orderItems: [{ orderItemId: order.lineItemId, quantity: order.quantity }],
      },
    });
  },
};
