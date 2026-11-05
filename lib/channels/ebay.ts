import crypto from 'crypto';
import { updateDb } from '../db';
import type { ChannelAdapter, ChannelOrder } from './types';

/**
 * eBay via the Sell APIs (Inventory, Fulfillment, Taxonomy) with a user
 * refresh token. With no credentials it runs in dry-run mode: nothing is
 * sent to eBay and test sales come from the admin "Simulate eBay sale" button.
 *
 * NOTE: written from eBay's documented REST shapes but not yet exercised
 * against eBay. Test with EBAY_ENV=sandbox before production.
 *
 * Env:
 *   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN   (OAuth, user token)
 *   EBAY_ENV=sandbox|production                                (default sandbox)
 *   EBAY_MARKETPLACE_ID=EBAY_US   EBAY_CURRENCY=USD   EBAY_CATEGORY_TREE_ID=0
 *   EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID
 *   EBAY_LOCATION_KEY   (inventory location set up in your eBay account)
 */
const env = () => ({
  clientId: process.env.EBAY_CLIENT_ID ?? '',
  clientSecret: process.env.EBAY_CLIENT_SECRET ?? '',
  refreshToken: process.env.EBAY_REFRESH_TOKEN ?? '',
  base: process.env.EBAY_ENV === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com',
  web: process.env.EBAY_ENV === 'production' ? 'https://www.ebay.com' : 'https://sandbox.ebay.com',
  marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
  currency: process.env.EBAY_CURRENCY ?? 'USD',
  categoryTreeId: process.env.EBAY_CATEGORY_TREE_ID ?? '0',
  policies: {
    fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID ?? '',
    paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID ?? '',
    returnPolicyId: process.env.EBAY_RETURN_POLICY_ID ?? '',
  },
  locationKey: process.env.EBAY_LOCATION_KEY ?? '',
});

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = env();
  const res = await fetch(`${e.base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${e.clientId}:${e.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: e.refreshToken, scope: SCOPES }),
  });
  if (!res.ok) throw new Error(`eBay auth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function ebay<T>(method: string, path: string, body?: unknown): Promise<T> {
  const e = env();
  const res = await fetch(`${e.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': e.marketplaceId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface eBay's own error messages so the agent can fix its input (e.g. missing item specifics).
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = (j.errors ?? []).map((x: { message?: string; longMessage?: string }) => x.longMessage || x.message).join('; ') || text;
    } catch {}
    throw new Error(`eBay ${method} ${path.split('?')[0]} failed (${res.status}): ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const isDryRun = () => {
  const e = env();
  return process.env.EBAY_DRY_RUN === '1' || !e.clientId || !e.clientSecret || !e.refreshToken;
};

export const ebayChannel: ChannelAdapter = {
  name: 'ebay',
  label: 'eBay',
  // Approximate US final value fee for most categories + per-order fee. Check your categories.
  feeRate: 0.136,
  fixedFee: 0.4,
  maxTitleLength: 80,
  dryRun: isDryRun,

  async suggestCategories(query) {
    if (isDryRun()) return [{ id: 'DRYRUN', name: `(dry run) best match for "${query}"` }];
    const e = env();
    const data = await ebay<{
      categorySuggestions?: { category: { categoryId: string; categoryName: string }; categoryTreeNodeAncestors?: { categoryName: string }[] }[];
    }>('GET', `/commerce/taxonomy/v1/category_tree/${e.categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`);
    return (data.categorySuggestions ?? []).slice(0, 8).map((s) => ({
      id: s.category.categoryId,
      name: [...(s.categoryTreeNodeAncestors ?? []).map((a) => a.categoryName).reverse(), s.category.categoryName].join(' > '),
    }));
  },

  async publish({ sku, listing, product, title, price, quantity, categoryId, aspects }) {
    if (isDryRun()) return { externalId: `DRYRUN-${crypto.randomBytes(4).toString('hex')}` };

    const e = env();
    const images = product.images ?? [];
    if (images.length === 0) throw new Error('eBay requires at least one product photo; the supplier product has none');
    if (!categoryId) throw new Error('categoryId is required for eBay');
    const missing = Object.entries({ ...e.policies, locationKey: e.locationKey }).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`eBay setup incomplete, missing env: ${missing.join(', ')}`);

    const itemAspects: Record<string, string[]> = {};
    for (const a of aspects) (itemAspects[a.name] ??= []).push(a.value);
    const descriptionHtml = `<p>${escapeHtml(listing.description).replace(/\n\n/g, '</p><p>')}</p><ul>${listing.bullets
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join('')}</ul>`;

    await ebay('PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      availability: { shipToLocationAvailability: { quantity } },
      condition: 'NEW',
      product: { title, description: descriptionHtml, imageUrls: images.slice(0, 12), aspects: itemAspects },
    });
    const offer = await ebay<{ offerId: string }>('POST', '/sell/inventory/v1/offer', {
      sku,
      marketplaceId: e.marketplaceId,
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      categoryId,
      listingDescription: descriptionHtml,
      listingPolicies: e.policies,
      merchantLocationKey: e.locationKey,
      pricingSummary: { price: { value: price.toFixed(2), currency: e.currency } },
    });
    const published = await ebay<{ listingId: string }>('POST', `/sell/inventory/v1/offer/${offer.offerId}/publish`);
    return { externalId: published.listingId, url: `${e.web}/itm/${published.listingId}` };
  },

  async fetchNewOrders() {
    if (isDryRun()) {
      // Turn simulated sales into eBay-shaped orders.
      return updateDb((db) => {
        const inbox = (db.channelInbox ?? []).filter((x) => x.channel === 'ebay');
        db.channelInbox = (db.channelInbox ?? []).filter((x) => x.channel !== 'ebay');
        return inbox.map((x): ChannelOrder => {
          const listing = db.listings.find((l) => l.id === x.listingId);
          const price = listing?.channels?.find((c) => c.channel === 'ebay')?.price ?? listing?.price ?? 0;
          const id = `DRYRUN-ORDER-${crypto.randomBytes(3).toString('hex')}`;
          return {
            channel: 'ebay',
            externalOrderId: id,
            lineItemId: `${id}-1`,
            sku: x.listingId,
            quantity: x.quantity,
            total: Math.round(price * x.quantity * 100) / 100,
            buyer: x.buyer,
          };
        });
      });
    }

    type EbayOrder = {
      orderId: string;
      orderPaymentStatus: string;
      pricingSummary?: { total?: { value: string } };
      buyer?: { username?: string };
      lineItems: { lineItemId: string; sku?: string; quantity: number }[];
      fulfillmentStartInstructions?: {
        shippingStep?: {
          shipTo?: {
            fullName?: string;
            email?: string;
            contactAddress?: {
              addressLine1?: string;
              addressLine2?: string;
              city?: string;
              stateOrProvince?: string;
              postalCode?: string;
              countryCode?: string;
            };
          };
        };
      }[];
    };
    const filter = encodeURIComponent('orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}');
    const data = await ebay<{ orders?: EbayOrder[] }>('GET', `/sell/fulfillment/v1/order?filter=${filter}&limit=50`);
    const out: ChannelOrder[] = [];
    for (const o of data.orders ?? []) {
      if (o.orderPaymentStatus !== 'PAID') continue;
      const shipTo = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
      const a = shipTo?.contactAddress ?? {};
      const address = [a.addressLine1, a.addressLine2, a.city, a.stateOrProvince, a.postalCode, a.countryCode]
        .filter(Boolean)
        .join(', ');
      for (const li of o.lineItems) {
        if (!li.sku) continue;
        out.push({
          channel: 'ebay',
          externalOrderId: o.orderId,
          lineItemId: li.lineItemId,
          sku: li.sku,
          quantity: li.quantity,
          total: Number(o.pricingSummary?.total?.value ?? 0),
          buyer: { name: shipTo?.fullName ?? o.buyer?.username ?? 'eBay buyer', email: shipTo?.email ?? '', address },
        });
      }
    }
    return out;
  },

  async markShipped(order, tracking) {
    if (isDryRun()) return;
    await ebay('POST', `/sell/fulfillment/v1/order/${encodeURIComponent(order.externalOrderId)}/shipping_fulfillment`, {
      lineItems: [{ lineItemId: order.lineItemId, quantity: order.quantity }],
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: tracking.carrier,
      trackingNumber: tracking.number,
    });
  },
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
