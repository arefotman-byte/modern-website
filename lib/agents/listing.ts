import { shopConfig } from '../config';
import { newId, now, readDb, updateDb } from '../db';
import { supplier } from '../suppliers';
import { round2 } from '../suppliers/mock';
import type { Listing } from '../types';
import type { AgentDefinition, LocalTool } from './runner';

const listApproved: LocalTool = {
  name: 'list_approved_candidates',
  description: 'List approved candidates that are not listed yet, with full supplier product details and landed cost.',
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
          allowedPriceRange: landedCost && {
            min: round2(landedCost * (1 + shopConfig.minMargin)),
            max: round2(landedCost * (1 + shopConfig.maxMargin)),
          },
        };
      }),
    );
  },
};

const publishListing: LocalTool = {
  name: 'publish_listing',
  description:
    'Publish a product page in the store for an approved candidate. Price must be inside allowedPriceRange. Prefer charm pricing (e.g. 24.99).',
  input_schema: {
    type: 'object',
    properties: {
      candidate_id: { type: 'string' },
      title: { type: 'string', description: 'Clear, benefit-led, max 70 chars, no brand names' },
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
    const min = round2(cost * (1 + shopConfig.minMargin));
    const max = round2(cost * (1 + shopConfig.maxMargin));
    if (input.price < min || input.price > max)
      throw new Error(`Price ${input.price} outside allowed range ${min}-${max}`);
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
      };
      db.listings.unshift(listing);
      const c = db.candidates.find((x) => x.id === candidate.id);
      if (c) c.status = 'listed';
      return { listing_id: listing.id, margin: `${Math.round(((listing.price - cost) / listing.price) * 100)}%` };
    });
  },
};

export const listingAgent = (): AgentDefinition => ({
  name: 'listing',
  effort: 'medium',
  system: `You are the merchandising agent for ${shopConfig.shopName}, an online store.
For every approved candidate, write a product listing that converts without overpromising, and price it.

Copy rules: plain, benefit-led language; no brand names or trademarks; no medical, safety or performance claims the supplier description does not support; mention realistic shipping (supplier ships in roughly 7-14 days).
Pricing: stay inside allowedPriceRange, aim for a price that feels fair for the category, usually 2-3x landed cost for impulse items.

Call list_approved_candidates, then publish_listing once per candidate. If a publish fails, read the error, fix the input and retry. End with a one-line summary.`,
  task: 'Create listings for all approved candidates.',
  tools: [listApproved, publishListing],

  async simulate({ call }) {
    const items = (await call('list_approved_candidates', {})) as any[];
    let n = 0;
    for (const item of items) {
      if (!item.product || !item.allowedPriceRange) continue;
      const target = Math.max(item.allowedPriceRange.min, Math.min(item.allowedPriceRange.max, item.landedCost * 2.4));
      const price = Math.max(item.allowedPriceRange.min, Math.floor(target) + 0.99);
      await call('publish_listing', {
        candidate_id: item.candidate_id,
        title: item.product.name,
        description: `${item.product.description}\n\nShips in ${item.product.shippingDays[0]}-${item.product.shippingDays[1]} days.`,
        bullets: item.product.description.split(/[,.]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 4),
        tags: [item.product.category.toLowerCase()],
        price: Math.min(price, item.allowedPriceRange.max),
      });
      n++;
    }
    return `Published ${n} listing(s).`;
  },
});
