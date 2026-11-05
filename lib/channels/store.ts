import type { ChannelAdapter } from './types';

/** Our own storefront. Listings show up automatically; orders come from checkout. */
export const storeChannel: ChannelAdapter = {
  name: 'store',
  label: 'Own store',
  feeRate: 0.03, // card processing, roughly
  fixedFee: 0.3,
  maxTitleLength: 90,
  dryRun: () => false,
  async suggestCategories() {
    return [];
  },
  async publish(input) {
    return { externalId: input.sku, url: `/product/${input.sku}` };
  },
  async fetchNewOrders() {
    return [];
  },
  async markShipped() {
    // Store customers get tracking by email from the fulfillment agent.
  },
};
