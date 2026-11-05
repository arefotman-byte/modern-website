import { NextResponse } from 'next/server';
import { channel } from '@/lib/channels';
import { now, updateDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Test helper: queue a fake marketplace sale. Only works while that channel is in dry-run. */
export async function POST(req: Request) {
  const { listingId, channel: name = 'ebay' } = await req.json().catch(() => ({}));
  try {
    const ch = channel(name);
    if (!ch.dryRun()) throw new Error(`${ch.label} is live; simulated sales are only allowed in dry-run`);
    updateDb((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing?.channels?.some((c) => c.channel === ch.name)) throw new Error(`Listing is not on ${ch.label}`);
      (db.channelInbox ??= []).push({
        channel: ch.name,
        listingId,
        quantity: 1,
        buyer: { name: 'Sam Buyer', email: '', address: '42 Test Road, Austin, TX 73301, US' },
        createdAt: now(),
      });
    });
    return NextResponse.json({ queued: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
