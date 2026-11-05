import { NextResponse } from 'next/server';
import { updateDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Human-in-the-loop: approve or reject a product the research agent shortlisted. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { action } = await req.json().catch(() => ({}));
  if (action !== 'approve' && action !== 'reject')
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  try {
    const c = updateDb((db) => {
      const cand = db.candidates.find((x) => x.id === params.id);
      if (!cand) throw new Error('Not found');
      if (cand.status === 'listed') throw new Error('Already listed');
      cand.status = action === 'approve' ? 'approved' : 'rejected';
      return cand;
    });
    return NextResponse.json(c);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
