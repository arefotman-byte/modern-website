import { NextResponse } from 'next/server';
import { startAgent } from '@/lib/agents';
import { shopConfig } from '@/lib/config';
import { newId, now, updateDb } from '@/lib/db';
import { round2 } from '@/lib/suppliers/mock';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(body?.name, 100);
  const email = str(body?.email, 200);
  const address = str(body?.address, 500);
  const quantity = Math.floor(Number(body?.quantity));
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || address.length < 10 || !(quantity >= 1 && quantity <= 10))
    return NextResponse.json({ error: 'Please fill in name, a valid email, full address and quantity 1-10.' }, { status: 400 });

  // PAYMENT: this demo marks the order paid immediately. Plug in Stripe Checkout
  // here and only create the order from the payment-succeeded webhook.
  try {
    const order = updateDb((db) => {
      const listing = db.listings.find((l) => l.id === body.listingId && l.active);
      if (!listing) throw new Error('Product not available');
      const o: Order = {
        id: newId('ord'),
        listingId: listing.id,
        quantity,
        customer: { name, email, address },
        total: round2(listing.price * quantity),
        status: 'paid',
        notes: [],
        createdAt: now(),
        updatedAt: now(),
      };
      db.orders.unshift(o);
      return o;
    });
    if (shopConfig.autoFulfillOnCheckout) startAgent('fulfillment').catch(() => {});
    return NextResponse.json({ orderId: order.id, total: order.total });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
