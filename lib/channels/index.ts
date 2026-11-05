import { round2 } from '../suppliers/mock';
import type { ChannelName } from '../types';
import { ebayChannel } from './ebay';
import { storeChannel } from './store';
import type { ChannelAdapter } from './types';

const adapters: Record<ChannelName, ChannelAdapter> = {
  store: storeChannel,
  ebay: ebayChannel,
  // amazon, etsy, walmart, tiktok: implement ChannelAdapter and add here
};

/** Channels to sell on, from CHANNELS=store,ebay (default: both). */
export function enabledChannels(): ChannelAdapter[] {
  const names = (process.env.CHANNELS ?? 'store,ebay').split(',').map((s) => s.trim()) as ChannelName[];
  return names.filter((n) => adapters[n]).map((n) => adapters[n]);
}

export function channel(name: string): ChannelAdapter {
  const a = adapters[name as ChannelName];
  if (!a || !enabledChannels().includes(a)) throw new Error(`Channel "${name}" is not enabled`);
  return a;
}

/**
 * Allowed price range on a channel so that, after the channel's fees, we still
 * earn at least minMargin (and at most maxMargin) over landed cost.
 */
export function priceRange(ch: ChannelAdapter, landedCost: number, minMargin: number, maxMargin: number) {
  const gross = (net: number) => (net + ch.fixedFee) / (1 - ch.feeRate);
  return { min: round2(gross(landedCost * (1 + minMargin))), max: round2(gross(landedCost * (1 + maxMargin))) };
}
