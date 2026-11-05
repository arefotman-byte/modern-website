import crypto from 'crypto';
import { updateDb } from '../db';
import type { ChannelName } from '../types';
import type { ChannelOrder } from './types';

/** fetch + JSON with readable errors (marketplace error text is passed back to the agent). */
export async function requestJson<T>(label: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${init.method ?? 'GET'} ${new URL(url).pathname} failed (${res.status}): ${text.slice(0, 800)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Turn simulated sales queued from the dashboard into channel orders (dry-run only). */
export function drainInbox(channel: ChannelName): ChannelOrder[] {
  return updateDb((db) => {
    const mine = (db.channelInbox ?? []).filter((x) => x.channel === channel);
    db.channelInbox = (db.channelInbox ?? []).filter((x) => x.channel !== channel);
    return mine.map((x) => {
      const listing = db.listings.find((l) => l.id === x.listingId);
      const price = listing?.channels?.find((c) => c.channel === channel)?.price ?? listing?.price ?? 0;
      const id = `DRYRUN-ORDER-${crypto.randomBytes(3).toString('hex')}`;
      return {
        channel,
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

export const dryRunId = () => `DRYRUN-${crypto.randomBytes(4).toString('hex')}`;

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function descriptionHtml(description: string, bullets: string[]) {
  return `<p>${escapeHtml(description).replace(/\n\n/g, '</p><p>')}</p><ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

/** Throw a clear error listing env vars that must be set for live mode. */
export function requireEnv(label: string, vars: Record<string, string | undefined>) {
  const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`${label} setup incomplete, missing env: ${missing.join(', ')}`);
}

export function aspectsToRecord(aspects: { name: string; value: string }[]) {
  const out: Record<string, string[]> = {};
  for (const a of aspects) (out[a.name] ??= []).push(a.value);
  return out;
}
