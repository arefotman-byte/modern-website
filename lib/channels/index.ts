import { round2 } from '../suppliers/mock';
import type { ChannelName } from '../types';
import { amazonChannel } from './amazon';
import { ebayChannel } from './ebay';
import { storeChannel } from './store';
import { tiktokChannel } from './tiktok';
import type { ChannelAdapter } from './types';
import { walmartChannel } from './walmart';

const adapters: Record<ChannelName, ChannelAdapter> = {
  store: storeChannel,
  ebay: ebayChannel,
  amazon: amazonChannel,
  walmart: walmartChannel,
  tiktok: tiktokChannel,
  // Etsy is deliberately absent: Etsy prohibits reselling/dropshipping ready-made goods.
};

/** Channels to sell on, from CHANNELS=store,ebay,amazon,walmart,tiktok (default: all). */
export function enabledChannels(): ChannelAdapter[] {
  const names = (process.env.CHANNELS ?? 'store,ebay,amazon,walmart,tiktok').split(',').map((s) => s.trim()) as ChannelName[];
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
