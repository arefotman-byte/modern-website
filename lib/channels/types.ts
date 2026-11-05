import type { ChannelName, Listing, Order, SupplierProduct } from '../types';

/** A sale pulled from a marketplace, before it becomes one of our orders. */
export interface ChannelOrder {
  channel: ChannelName;
  externalOrderId: string;
  lineItemId: string;
  sku: string; // our listing id
  quantity: number;
  total: number;
  buyer: Order['customer'];
}

export interface PublishInput {
  sku: string;
  listing: Listing;
  product: SupplierProduct;
  title: string;
  price: number;
  quantity: number;
  categoryId?: string;
  aspects: { name: string; value: string }[]; // eBay "item specifics"
}

/**
 * One implementation per sales channel (own store, eBay, and later Amazon,
 * Etsy, Walmart, TikTok Shop...). The agents only use channels through this.
 */
export interface ChannelAdapter {
  name: ChannelName;
  label: string;
  /** Approximate % of sale price the channel keeps (final value fee, payments). */
  feeRate: number;
  /** Fixed fee per order in USD. */
  fixedFee: number;
  maxTitleLength: number;
  /** True when no credentials are set: nothing is sent to the real marketplace. */
  dryRun(): boolean;
  suggestCategories(query: string): Promise<{ id: string; name: string }[]>;
  publish(input: PublishInput): Promise<{ externalId: string; url?: string }>;
  /** New paid orders not yet shipped. */
  fetchNewOrders(): Promise<ChannelOrder[]>;
  markShipped(
    order: { externalOrderId: string; lineItemId: string; quantity: number },
    tracking: { number: string; carrier: string },
  ): Promise<void>;
}
