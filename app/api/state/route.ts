import { NextResponse } from 'next/server';
import { autopilotSchedule } from '@/lib/autopilot';
import { enabledChannels } from '@/lib/channels';
import { agentMode, shopConfig } from '@/lib/config';
import { readDb } from '@/lib/db';
import { supplier } from '@/lib/suppliers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = readDb();
  const candidates = await Promise.all(
    db.candidates.map(async (c) => ({ ...c, product: await supplier().getProduct(c.supplierProductId) })),
  );
  return NextResponse.json({ ...db, candidates, mode: agentMode(), config: shopConfig,
    autopilot: autopilotSchedule(),
    channels: enabledChannels().map((c) => ({ name: c.name, label: c.label, dryRun: c.dryRun() })),
  });
}
