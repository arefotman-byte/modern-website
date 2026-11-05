import type { AgentName } from '../types';
import { fulfillmentAgent } from './fulfillment';
import { listingAgent } from './listing';
import { researchAgent } from './research';
import { isAgentRunning, runAgent } from './runner';

export async function startAgent(name: AgentName, opts: { focus?: string } = {}) {
  if (isAgentRunning(name)) throw new Error(`The ${name} agent is already running`);
  const def =
    name === 'research' ? researchAgent(opts.focus) : name === 'listing' ? listingAgent() : fulfillmentAgent();
  return runAgent(def);
}

export const AGENTS: AgentName[] = ['research', 'listing', 'fulfillment'];
