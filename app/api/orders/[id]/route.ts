import { NextResponse } from 'next/server';
import { now, updateDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Owner actions on an order: send a flagged order back to the agent, or cancel it. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { action } = await req.json().catch(() => ({}));
  if (action !== 'retry' && action !== 'cancel')
    return NextResponse.json({ error: 'action must be retry or cancel' }, { status: 400 });
  try {
    const order = updateDb((db) => {
      const o = db.orders.find((x) => x.id === params.id);
      if (!o) throw new Error('Not found');
      if (action === 'retry') {
        if (o.status !== 'needs_human') throw new Error('Only flagged orders can be retried');
        o.status = o.supplierOrderId ? 'ordered_from_supplier' : 'paid';
      } else {
        if (o.supplierOrderId) throw new Error('Already ordered from supplier; cancel with the supplier first');
        o.status = 'cancelled';
      }
      o.updatedAt = now();
      o.notes.push(`${now()} Owner action: ${action}`);
      return o;
    });
    return NextResponse.json(order);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
