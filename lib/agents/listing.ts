import { channel, enabledChannels, priceRange } from '../channels';
import { storeChannel } from '../channels/store';
import { shopConfig } from '../config';
import { newId, now, readDb, updateDb } from '../db';
import { supplier } from '../suppliers';
import { round2 } from '../suppliers/mock';
import type { Listing } from '../types';
import type { AgentDefinition, LocalTool } from './runner';

const range = (ch: Parameters<typeof priceRange>[0], cost: number) =>
  priceRange(ch, cost, shopConfig.minMargin, shopConfig.maxMargin);

const marketplaces = () => enabledChannels().filter((c) => c.name !== 'store');
const channelSchema = () => {
  const names = marketplaces().map((m) => m.name);
  return names.length ? { type: 'string', enum: names } : { type: 'string' };
};

const listApproved: LocalTool = {
  name: 'list_approved_candidates',
  description:
    'List approved candidates that are not on the storefront yet, with full supplier product details, landed cost and the allowed storefront price range.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  async run() {
    const approved = readDb().candidates.filter((c) => c.status === 'approved');
    return Promise.all(
      approved.map(async (c) => {
        const product = await supplier().getProduct(c.supplierProductId);
        const landedCost = product ? round2(product.unitCost + product.shippingCost) : null;
        return {
          candidate_id: c.id,
          rationale: c.rationale,
          product,
          landedCost,
          allowedPriceRange: landedCost && range(storeChannel, landedCost),
        };
      }),
    );
  },
};

const publishListing: LocalTool = {
  name: 'publish_listing',
  description:
    'Create the product page on our own storefront for an approved candidate. Price must be inside allowedPriceRange. Prefer charm pricing (e.g. 24.99). Returns the listing_id used for marketplace publishing.',
  input_schema: {
    type: 'object',
    properties: {
      candidate_id: { type: 'string' },
      title: { type: 'string', description: 'Clear, benefit-led, max 80 chars, no brand names' },
      description: { type: 'string', description: '2 short paragraphs, honest, no unverifiable claims' },
      bullets: { type: 'array', items: { type: 'string' }, description: '3-5 key features' },
      tags: { type: 'array', items: { type: 'string' } },
      price: { type: 'number' },
    },
    required: ['candidate_id', 'title', 'description', 'bullets', 'tags', 'price'],
    additionalProperties: false,
  },
  async run(input: {
    candidate_id: string;
    title: string;
    description: string;
    bullets: string[];
    tags: string[];
    price: number;
  }) {
    const candidate = readDb().candidates.find((c) => c.id === input.candidate_id);
    if (!candidate) throw new Error('No such candidate');
    if (candidate.status !== 'approved') throw new Error(`Candidate is ${candidate.status}, not approved`);
    const product = await supplier().getProduct(candidate.supplierProductId);
    if (!product) throw new Error('Supplier product no longer available');

    const cost = round2(product.unitCost + product.shippingCost);
    const { min, max } = range(storeChannel, cost);
    if (input.price < min || input.price > max) throw new Error(`Price ${input.price} outside allowed range ${min}-${max}`);
    if (input.title.length > 90) throw new Error('Title too long');

    return updateDb((db) => {
      const listing: Listing = {
        id: newId('lst'),
        candidateId: candidate.id,
        supplierProductId: product.id,
        title: input.title,
        description: input.description,
        bullets: input.bullets.slice(0, 6),
        tags: input.tags.slice(0, 8),
        price: round2(input.price),
        cost,
        image: product.image,
        active: true,
        createdAt: now(),
        channels: [],
      };
      db.listings.unshift(listing);
      const c = db.candidates.find((x) => x.id === candidate.id);
      if (c) c.status = 'listed';
      return { listing_id: listing.id, margin_before_fees: `${Math.round(((listing.price - cost) / listing.price) * 100)}%` };
    });
  },
};

const listMissingChannels: LocalTool = {
  name: 'list_listings_missing_channels',
  description:
    'List active storefront listings that are not yet published on one or more enabled marketplaces (e.g. eBay), with the allowed price range per marketplace after its fees, title length limit and whether the marketplace is in dry-run mode.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  async run() {
    const out = [];
    for (const l of readDb().listings.filter((x) => x.active)) {
      const missing = marketplaces().filter((m) => !(l.channels ?? []).some((c) => c.channel === m.name));
      if (missing.length === 0) continue;
      const product = await supplier().getProduct(l.supplierProductId);
      out.push({
        listing_id: l.id,
        title: l.title,
        storePrice: l.price,
        landedCost: l.cost,
        supplierCategory: product?.category,
        hasPhotos: (product?.images ?? []).length > 0,
        missing: missing.map((m) => ({
          channel: m.name,
          dryRun: m.dryRun(),
          maxTitleLength: m.maxTitleLength,
          fees: `${Math.round(m.feeRate * 1000) / 10}% + $${m.fixedFee}`,
          allowedPriceRange: range(m, l.cost),
        })),
      });
    }
    return out;
  },
};

const findCategory: LocalTool = {
  name: 'find_channel_category',
  description:
    'Get category suggestions for a product on a marketplace (eBay category id, Amazon product type, Walmart product type, TikTok Shop category id). Needed before publish_to_channel.',
  input_schema: {
    type: 'object',
    properties: {
      channel: channelSchema(),
      query: { type: 'string', description: 'Short product description, e.g. "car phone mount magnetic"' },
    },
    required: ['channel', 'query'],
    additionalProperties: false,
  },
  async run({ channel: ch, query }: { channel: string; query: string }) {
    return channel(ch).suggestCategories(query);
  },
};

const publishToChannel: LocalTool = {
  name: 'publish_to_channel',
  description:
    'Publish an existing storefront listing to a marketplace. Price must be inside that channel\'s allowedPriceRange. aspects are the marketplace\'s product attributes (eBay item specifics such as Type; Amazon snake_case attributes such as material or color; TikTok/Walmart attribute names). If the marketplace rejects the listing (e.g. a missing required attribute), read the error and retry with it. Brand is always "Unbranded".',
  input_schema: {
    type: 'object',
    properties: {
      listing_id: { type: 'string' },
      channel: channelSchema(),
      title: { type: 'string', description: 'Marketplace-style title, keyword-rich, within maxTitleLength' },
      price: { type: 'number' },
      category_id: { type: 'string' },
      aspects: {
        type: 'array',
        description: 'Product attributes, e.g. [{"name":"Brand","value":"Unbranded"},{"name":"Type","value":"Vent Mount"}]',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, value: { type: 'string' } },
          required: ['name', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['listing_id', 'channel', 'title', 'price', 'category_id', 'aspects'],
    additionalProperties: false,
  },
  async run(input: {
    listing_id: string;
    channel: string;
    title: string;
    price: number;
    category_id: string;
    aspects: { name: string; value: string }[];
  }) {
    const ch = channel(input.channel);
    if (ch.name === 'store') throw new Error('Use publish_listing for the own store');
    const listing = readDb().listings.find((l) => l.id === input.listing_id && l.active);
    if (!listing) throw new Error('No such active listing');
    if ((listing.channels ?? []).some((c) => c.channel === ch.name)) throw new Error(`Already on ${ch.label}`);
    const product = await supplier().getProduct(listing.supplierProductId);
    if (!product) throw new Error('Supplier product no longer available');
    if (supplier().name === 'mock' && !ch.dryRun())
      throw new Error('Refusing to list demo-supplier products on a live marketplace. Connect a real supplier first.');

    const { min, max } = range(ch, listing.cost);
    if (input.price < min || input.price > max) throw new Error(`Price ${input.price} outside allowed range ${min}-${max} for ${ch.label}`);
    if (input.title.length > ch.maxTitleLength) throw new Error(`Title is ${input.title.length} chars; ${ch.label} allows ${ch.maxTitleLength}`);

    // List a small quantity so a supplier stock-out can't oversell us badly.
    const quantity = Math.max(1, Math.min(shopConfig.marketplaceListQuantity, product.stock));
    const result = await ch.publish({
      sku: listing.id,
      listing,
      product,
      title: input.title,
      price: round2(input.price),
      quantity,
      categoryId: input.category_id,
      aspects: input.aspects,
    });
    updateDb((db) => {
      const l = db.listings.find((x) => x.id === listing.id);
      if (!l) return;
      (l.channels ??= []).push({
        channel: ch.name,
        externalId: result.externalId,
        url: result.url,
        price: round2(input.price),
        quantity,
        dryRun: ch.dryRun(),
        publishedAt: now(),
      });
    });
    return { ...result, dryRun: ch.dryRun() };
  },
};

export const listingAgent = (): AgentDefinition => ({
  name: 'listing',
  effort: 'medium',
  system: `You are the merchandising agent for ${shopConfig.shopName}. We sell on our own storefront and on marketplaces (${marketplaces()
    .map((m) => m.label)
    .join(', ') || 'none enabled'}).

Step 1: for every approved candidate (list_approved_candidates), write a listing that converts without overpromising and publish it to our storefront with publish_listing.
Step 2: for every listing in list_listings_missing_channels, publish it to each missing marketplace: find_channel_category, pick the most specific matching category, then publish_to_channel with a title written for that marketplace's shoppers and its product attributes (always include Brand: Unbranded). Marketplaces that require photos or a barcode (GTIN) will refuse products without them; report those rather than retrying.

Copy rules: plain, benefit-led language; no brand names or trademarks; no medical, safety or performance claims the supplier description does not support; mention realistic shipping (supplier ships in roughly 7-14 days).
Pricing: stay inside each channel's allowedPriceRange (it already accounts for that channel's fees); impulse items usually sell at 2-3x landed cost. Marketplace prices may be higher than the storefront price to cover fees.
If a tool fails, read the error, fix the input and retry once; if it still fails, move on and report it. End with a short summary.`,
  task: 'Create storefront listings for all approved candidates, then publish all listings to the enabled marketplaces.',
  tools: [listApproved, publishListing, listMissingChannels, findCategory, publishToChannel],

  async simulate({ call }) {
    const items = (await call('list_approved_candidates', {})) as any[];
    let n = 0;
    for (const item of items) {
      if (!item.product || !item.allowedPriceRange) continue;
      const r = item.allowedPriceRange;
      const price = Math.min(r.max, Math.max(r.min, Math.floor(item.landedCost * 2.4) + 0.99));
      await call('publish_listing', {
        candidate_id: item.candidate_id,
        title: item.product.name,
        description: `${item.product.description}\n\nShips in ${item.product.shippingDays[0]}-${item.product.shippingDays[1]} days.`,
        bullets: item.product.description.split(/[,.]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 4),
        tags: [item.product.category.toLowerCase()],
        price,
      });
      n++;
    }
    let m = 0;
    const missing = (await call('list_listings_missing_channels', {})) as any[];
    for (const l of missing) {
      for (const ch of l.missing) {
        const cats = (await call('find_channel_category', { channel: ch.channel, query: l.title })) as { id: string }[];
        const r = ch.allowedPriceRange;
        try {
          await call('publish_to_channel', {
            listing_id: l.listing_id,
            channel: ch.channel,
            title: l.title.slice(0, ch.maxTitleLength),
            price: Math.min(r.max, Math.max(r.min, Math.ceil(l.storePrice * 1.15) - 0.01)),
            category_id: cats[0]?.id ?? '',
            aspects: [{ name: 'Brand', value: 'Unbranded' }],
          });
          m++;
        } catch {
          // logged by the runner; move on
        }
      }
    }
    return `Published ${n} storefront listing(s) and ${m} marketplace listing(s).`;
  },
});
