import { shopConfig } from '../config';
import { newId, now, readDb, updateDb } from '../db';
import { supplier } from '../suppliers';
import type { Candidate, SupplierProduct } from '../types';
import type { AgentDefinition, LocalTool } from './runner';

const landed = (p: SupplierProduct) => Math.round((p.unitCost + p.shippingCost) * 100) / 100;

const searchSupplier: LocalTool = {
  name: 'search_supplier_catalog',
  description:
    'Search the supplier catalog. Returns products with unit cost, shipping cost, stock, rating and orders in the last 30 days (a sales-velocity signal). Use short keyword queries; an empty query lists best sellers.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Keywords, e.g. "led lights" or "pet"' } },
    required: ['query'],
    additionalProperties: false,
  },
  async run({ query }: { query: string }) {
    const products = await supplier().searchProducts(query, 10);
    return products.map((p) => ({ ...p, landedCost: landed(p) }));
  },
};

const listExisting: LocalTool = {
  name: 'list_existing_products',
  description: 'List supplier product ids we already shortlisted or sell, so you do not propose duplicates.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  async run() {
    const db = readDb();
    return db.candidates.map((c) => ({ supplierProductId: c.supplierProductId, status: c.status }));
  },
};

const saveCandidate: LocalTool = {
  name: 'save_candidate',
  description: `Shortlist a supplier product as a candidate to sell. Only call this for products with real evidence of demand. Landed cost must be <= $${shopConfig.maxLandedCost}.`,
  input_schema: {
    type: 'object',
    properties: {
      supplier_product_id: { type: 'string' },
      demand_score: { type: 'integer', description: '0-100: how confident you are this will sell' },
      rationale: { type: 'string', description: '2-4 sentences: why now, who buys it, margin headroom, risks' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'URLs from web search and/or supplier metrics' },
    },
    required: ['supplier_product_id', 'demand_score', 'rationale', 'evidence'],
    additionalProperties: false,
  },
  async run(input: { supplier_product_id: string; demand_score: number; rationale: string; evidence: string[] }) {
    const product = await supplier().getProduct(input.supplier_product_id);
    if (!product) throw new Error('No such supplier product');
    if (landed(product) > shopConfig.maxLandedCost)
      throw new Error(`Landed cost $${landed(product)} exceeds limit $${shopConfig.maxLandedCost}`);
    const score = Math.max(0, Math.min(100, Math.round(input.demand_score)));

    return updateDb((db) => {
      if (db.candidates.some((c) => c.supplierProductId === product.id))
        throw new Error('Already shortlisted');
      const thisRun = db.candidates.filter((c) => Date.now() - Date.parse(c.createdAt) < 30 * 60_000);
      if (thisRun.length >= shopConfig.maxCandidatesPerRun * 2)
        throw new Error('Candidate limit reached for now');
      const status: Candidate['status'] = shopConfig.requireCandidateApproval
        ? 'pending_review'
        : score >= shopConfig.autoApproveMinScore
          ? 'approved'
          : 'rejected';
      const candidate: Candidate = {
        id: newId('cand'),
        supplierProductId: product.id,
        demandScore: score,
        rationale: input.rationale,
        evidence: input.evidence.slice(0, 8),
        status,
        createdAt: now(),
      };
      db.candidates.unshift(candidate);
      return { saved: candidate.id, status };
    });
  },
};

export const researchAgent = (focus?: string): AgentDefinition => ({
  name: 'research',
  effort: 'high',
  maxTurns: 30,
  system: `You are the product research agent for ${shopConfig.shopName}, a dropshipping store.
Your job is to find products with strong, current consumer demand that we can source from our supplier at a healthy margin.

How to work:
1. Use web search to find what is trending right now (social media virality, marketplace best-seller lists, seasonal demand, search trends). Prefer recent sources.
2. Map trends onto the supplier catalog with search_supplier_catalog. Only products in the catalog can be sold.
3. Check list_existing_products and skip anything already shortlisted.
4. Judge each match on demand evidence, supplier sales velocity (ordersLast30d), rating, stock, landed cost and room for a ${Math.round(shopConfig.minMargin * 100)}%+ margin at a price customers will pay.
5. Save at most ${shopConfig.maxCandidatesPerRun} candidates with save_candidate. Quality over quantity — it is fine to save fewer.

Avoid products that are regulated, unsafe, counterfeit/branded, or likely to cause high return rates. Finish with a short summary of what you shortlisted and why.`,
  task: focus
    ? `Find high-demand products to add to the store. Focus: ${focus}`
    : 'Find high-demand products to add to the store.',
  serverTools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
  tools: [searchSupplier, listExisting, saveCandidate],

  async simulate({ call, log }) {
    log('info', 'Simulated: skipping web search, ranking supplier catalog by sales velocity and margin.');
    const products = (await call('search_supplier_catalog', { query: focus ?? '' })) as (SupplierProduct & {
      landedCost: number;
    })[];
    const existing = new Set(
      ((await call('list_existing_products', {})) as { supplierProductId: string }[]).map((c) => c.supplierProductId),
    );
    const ranked = products
      .filter((p) => !existing.has(p.id) && p.landedCost <= shopConfig.maxLandedCost && p.stock > 30)
      .map((p) => ({ p, score: Math.min(100, Math.round(p.ordersLast30d / 1000 + p.rating * 10)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const { p, score } of ranked) {
      await call('save_candidate', {
        supplier_product_id: p.id,
        demand_score: score,
        rationale: `${p.ordersLast30d.toLocaleString()} supplier orders in 30 days with a ${p.rating}★ rating. Landed cost $${p.landedCost} leaves room for a strong margin.`,
        evidence: [`supplier:ordersLast30d=${p.ordersLast30d}`, `supplier:rating=${p.rating}`],
      });
    }
    return ranked.length
      ? `Shortlisted ${ranked.map((r) => r.p.name).join(', ')}.`
      : 'No new products worth shortlisting.';
  },
});
