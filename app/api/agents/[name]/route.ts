import { NextResponse } from 'next/server';
import { AGENTS, startAgent } from '@/lib/agents';
import { isAgentRunning } from '@/lib/agents/runner';
import type { AgentName } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { name: string } }) {
  const name = params.name as AgentName;
  if (!AGENTS.includes(name)) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
  if (isAgentRunning(name)) return NextResponse.json({ error: `The ${name} agent is already running` }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const focus = typeof body.focus === 'string' && body.focus.trim() ? body.focus.trim().slice(0, 200) : undefined;

  // Runs in the background; the dashboard polls /api/state for live logs.
  startAgent(name, { focus }).catch(() => {});
  return NextResponse.json({ started: true });
}
