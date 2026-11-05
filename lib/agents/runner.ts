import Anthropic from '@anthropic-ai/sdk';
import { agentMode, shopConfig } from '../config';
import { newId, now, readDb, updateDb } from '../db';
import type { AgentName, AgentRun, LogKind } from '../types';

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

/** A tool our own code executes. Side effects and business rules live in `run`. */
export interface LocalTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
  run: (input: any) => Promise<unknown>;
}

export interface AgentContext {
  runId: string;
  log: (kind: LogKind, message: string) => void;
  /** Call one of the agent's tools by name (used by simulate mode). */
  call: (name: string, input: unknown) => Promise<unknown>;
}

export interface AgentDefinition {
  name: AgentName;
  system: string;
  task: string;
  effort: 'low' | 'medium' | 'high';
  tools: LocalTool[];
  /** Anthropic-hosted tools such as web search. */
  serverTools?: Anthropic.Beta.BetaToolUnion[];
  maxTurns?: number;
  /** Scripted, no-API version of the agent for demos and tests. */
  simulate: (ctx: AgentContext) => Promise<string>;
}

const short = (v: unknown, n = 600) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

function appendLog(runId: string, kind: LogKind, message: string) {
  updateDb((db) => {
    const run = db.runs.find((r) => r.id === runId);
    run?.logs.push({ at: now(), kind, message });
  });
}

function finishRun(runId: string, status: AgentRun['status'], summary: string) {
  updateDb((db) => {
    const run = db.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, { status, summary, finishedAt: now() });
  });
}

export function isAgentRunning(name: AgentName) {
  // Avoid two copies of the same agent racing over the same orders.
  // Runs older than 15 minutes are treated as stale (e.g. the server restarted mid-run).
  return readDb().runs.some(
    (r) => r.agent === name && r.status === 'running' && Date.now() - Date.parse(r.startedAt) < 15 * 60_000,
  );
}

export async function runAgent(def: AgentDefinition): Promise<AgentRun> {
  const mode = agentMode();
  const run: AgentRun = {
    id: newId('run'),
    agent: def.name,
    mode,
    status: 'running',
    startedAt: now(),
    logs: [],
  };
  updateDb((db) => {
    db.runs.unshift(run);
    db.runs = db.runs.slice(0, 50);
  });

  const log = (kind: LogKind, message: string) => appendLog(run.id, kind, message);
  const toolsByName = new Map(def.tools.map((t) => [t.name, t]));

  const call = async (name: string, input: unknown) => {
    const tool = toolsByName.get(name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    log('tool_call', `${name}(${short(input, 400)})`);
    const result = await tool.run(input);
    log('tool_result', short(result));
    return result;
  };

  try {
    log('info', `Starting ${def.name} agent in ${mode} mode`);
    const summary =
      mode === 'simulate'
        ? await def.simulate({ runId: run.id, log, call })
        : await liveLoop(def, log, call);
    finishRun(run.id, 'succeeded', summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', message);
    finishRun(run.id, 'failed', message);
  }
  return { ...run };
}

/** Manual agentic loop over the Messages API. */
async function liveLoop(
  def: AgentDefinition,
  log: AgentContext['log'],
  call: AgentContext['call'],
): Promise<string> {
  const client = new Anthropic();
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(def.serverTools ?? []),
    ...def.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
      strict: true,
    })),
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: def.task }];
  let lastText = '';

  for (let turn = 0; turn < (def.maxTurns ?? 25); turn++) {
    const response = await client.beta.messages.create({
      model: shopConfig.model,
      max_tokens: 16000,
      // On a safety refusal, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: def.effort },
      system: def.system,
      tools,
      messages,
    });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        lastText = block.text.trim();
        log('text', lastText);
      } else if (block.type === 'server_tool_use') {
        log('web_search', short(block.input, 300));
      }
    }

    if (response.stop_reason === 'refusal') {
      throw new Error(`Model declined the task (${response.stop_details?.category ?? 'unspecified'})`);
    }

    messages.push({ role: 'assistant', content: response.content });

    // A long server-side web search turn paused; send it back to continue.
    if (response.stop_reason === 'pause_turn') continue;
    if (response.stop_reason === 'max_tokens') throw new Error('Response hit max_tokens');
    if (response.stop_reason !== 'tool_use') return lastText || 'Done.';

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const out = await call(tu.name, tu.input);
          return { type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(out) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log('error', `${tu.name}: ${message}`);
          return { type: 'tool_result' as const, tool_use_id: tu.id, content: message, is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  return `Stopped after ${def.maxTurns ?? 25} turns. ${lastText}`;
}
