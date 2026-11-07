import { startAgent } from './agents';
import { isAgentRunning } from './agents/runner';
import { enabledChannels } from './channels';
import { shopConfig } from './config';
import { readDb } from './db';
import type { AgentName } from './types';

/**
 * Runs the agents on a schedule so the shop works without anyone clicking
 * buttons. Enabled with AUTOPILOT=1. Each agent is skipped when it has
 * nothing to do, so idle periods cost nothing.
 *
 *   AUTOPILOT_RESEARCH_HOURS=24     research for new products
 *   AUTOPILOT_LISTING_MINUTES=60    list approved products / backfill marketplaces
 *   AUTOPILOT_FULFILLMENT_MINUTES=15  import sales, order from supplier, sync tracking
 */
export function autopilotSchedule() {
  const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
  return {
    enabled: process.env.AUTOPILOT === '1',
    researchMinutes: num(process.env.AUTOPILOT_RESEARCH_HOURS, 24) * 60,
    listingMinutes: num(process.env.AUTOPILOT_LISTING_MINUTES, 60),
    fulfillmentMinutes: num(process.env.AUTOPILOT_FULFILLMENT_MINUTES, 15),
  };
}

/** Why an agent should not run right now, or null if it has work to do. */
function skipReason(agent: AgentName): string | null {
  const db = readDb();
  if (agent === 'research') {
    const waiting = db.candidates.filter((c) => c.status === 'pending_review').length;
    if (waiting >= shopConfig.maxCandidatesPerRun) return `${waiting} products are still waiting for your review`;
    return null;
  }
  if (agent === 'listing') {
    const approved = db.candidates.some((c) => c.status === 'approved');
    const markets = enabledChannels().filter((c) => c.name !== 'store');
    const missing = db.listings.some((l) => l.active && markets.some((m) => !(l.channels ?? []).some((c) => c.channel === m.name)));
    return approved || missing ? null : 'nothing to list';
  }
  // fulfillment: open orders, or a live marketplace that may have new sales to import
  const open = db.orders.some((o) => ['paid', 'ordered_from_supplier', 'shipped'].includes(o.status));
  const liveMarket = enabledChannels().some((c) => c.name !== 'store' && !c.dryRun());
  const queuedTestSales = (db.channelInbox ?? []).length > 0;
  return open || liveMarket || queuedTestSales ? null : 'no open orders';
}

export function startAutopilot() {
  const g = globalThis as { __autopilot?: boolean };
  const schedule = autopilotSchedule();
  if (!schedule.enabled || g.__autopilot) return;
  g.__autopilot = true;

  const every: Record<AgentName, number> = {
    research: schedule.researchMinutes,
    listing: schedule.listingMinutes,
    fulfillment: schedule.fulfillmentMinutes,
  };
  // Start from the last recorded run so a restart doesn't re-run everything at once.
  const lastRun: Record<AgentName, number> = { research: 0, listing: 0, fulfillment: 0 };
  for (const r of readDb().runs) lastRun[r.agent] = Math.max(lastRun[r.agent], Date.parse(r.startedAt));

  console.log(
    `[autopilot] on: research every ${every.research / 60}h, listing every ${every.listing}m, fulfillment every ${every.fulfillment}m`,
  );

  const lastSkip: Partial<Record<AgentName, string>> = {};
  const tick = () => {
    for (const agent of ['fulfillment', 'listing', 'research'] as AgentName[]) {
      if (Date.now() - lastRun[agent] < every[agent] * 60_000) continue;
      if (isAgentRunning(agent)) continue;
      // When skipped, check again next minute (the work may appear any time) but log only changes.
      const reason = skipReason(agent);
      if (reason) {
        if (lastSkip[agent] !== reason) console.log(`[autopilot] waiting on ${agent}: ${reason}`);
        lastSkip[agent] = reason;
        continue;
      }
      delete lastSkip[agent];
      lastRun[agent] = Date.now();
      console.log(`[autopilot] running ${agent}`);
      startAgent(agent).catch((err) => console.error(`[autopilot] ${agent} failed:`, err));
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, 60_000);
}
