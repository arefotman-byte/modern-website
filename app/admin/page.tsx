'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentName, AgentRun, Candidate, DB, SupplierProduct } from '@/lib/types';

type State = Omit<DB, 'candidates'> & {
  candidates: (Candidate & { product: SupplierProduct | null })[];
  mode: 'live' | 'simulate';
  channels: { name: string; label: string; dryRun: boolean }[];
  autopilot: { enabled: boolean; researchMinutes: number; listingMinutes: number; fulfillmentMinutes: number };
  config: Record<string, unknown>;
};

const AGENT_INFO: Record<AgentName, { title: string; text: string }> = {
  research: { title: '1 · Research', text: 'Searches the web for trends and shortlists supplier products with real demand.' },
  listing: { title: '2 · Listing', text: 'Writes product pages, prices them after fees, and publishes to your store and marketplaces.' },
  fulfillment: { title: '3 · Fulfillment', text: 'Imports marketplace sales, orders from the supplier, uploads tracking and emails store customers.' },
};

const card = 'rounded-2xl border border-white/10 bg-white/5 p-5';
const btn = 'rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50';

export default function Admin() {
  const [state, setState] = useState<State | null>(null);
  const [focus, setFocus] = useState('');
  const [error, setError] = useState('');
  const [openRun, setOpenRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) setState(await res.json());
  }, []);

  const running = state?.runs.some((r) => r.status === 'running');
  useEffect(() => {
    load();
    const t = setInterval(load, running ? 1500 : 5000);
    return () => clearInterval(t);
  }, [load, running]);

  async function post(url: string, body: unknown = {}) {
    setError('');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error ?? 'Request failed');
    load();
  }

  if (!state) return <p className="text-slate-400">Loading…</p>;

  const isRunning = (a: AgentName) => state.runs.some((r) => r.agent === a && r.status === 'running');
  const revenue = state.orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const cogs = state.orders
    .filter((o) => o.supplierOrderId)
    .reduce((s, o) => s + (state.listings.find((l) => l.id === o.listingId)?.cost ?? 0) * o.quantity, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Agent control room</h1>
          <p className="mt-1 text-slate-400">
            Mode:{' '}
            <span className={state.mode === 'live' ? 'text-emerald-400' : 'text-amber-400'}>
              {state.mode === 'live' ? 'live (Claude API)' : 'simulate (no API key set)'}
            </span>
            {' · '}Autopilot:{' '}
            {state.autopilot.enabled ? (
              <span className="text-emerald-400" title="Research / listing / fulfillment intervals">
                on ({state.autopilot.researchMinutes / 60}h / {state.autopilot.listingMinutes}m / {state.autopilot.fulfillmentMinutes}m)
              </span>
            ) : (
              <span className="text-slate-500">off</span>
            )}
            {' · '}Selling on:{' '}
            {state.channels.map((c) => (
              <span key={c.name} className="mr-2">
                {c.label}
                {c.dryRun && <span className="text-amber-400"> (dry run)</span>}
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Live products" value={String(state.listings.filter((l) => l.active).length)} />
          <Stat label="Orders" value={String(state.orders.length)} />
          <Stat label="Revenue" value={`$${revenue.toFixed(2)}`} />
          <Stat label="Supplier cost" value={`$${cogs.toFixed(2)}`} />
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">{error}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        {(Object.keys(AGENT_INFO) as AgentName[]).map((a) => (
          <div key={a} className={card}>
            <h2 className="font-semibold">{AGENT_INFO[a].title}</h2>
            <p className="mt-1 text-sm text-slate-400">{AGENT_INFO[a].text}</p>
            {a === 'research' && (
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Optional focus, e.g. pet products"
                className="mt-3 w-full rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-sm"
              />
            )}
            <button
              disabled={isRunning(a)}
              onClick={() => post(`/api/agents/${a}`, a === 'research' ? { focus } : {})}
              className={`${btn} mt-3 bg-accent text-white`}
            >
              {isRunning(a) ? 'Running…' : 'Run agent'}
            </button>
          </div>
        ))}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Shortlisted products</h2>
        {state.candidates.length === 0 && <Empty>Run the research agent to find products.</Empty>}
        <div className="divide-y divide-white/10">
          {state.candidates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start gap-4 py-3">
              <span className="text-3xl">{c.product?.image}</span>
              <div className="min-w-[240px] flex-1">
                <p className="font-medium">
                  {c.product?.name} <span className="text-sm text-slate-400">· demand {c.demandScore}/100</span>
                </p>
                <p className="text-sm text-slate-400">{c.rationale}</p>
                {c.evidence.length > 0 && (
                  <p className="mt-1 truncate text-xs text-slate-500">Evidence: {c.evidence.join(' · ')}</p>
                )}
                {c.product && (
                  <p className="mt-1 text-xs text-slate-500">
                    Landed cost ${(c.product.unitCost + c.product.shippingCost).toFixed(2)} · {c.product.ordersLast30d} orders/30d ·{' '}
                    {c.product.rating}★
                  </p>
                )}
              </div>
              <Badge status={c.status} />
              {c.status === 'pending_review' && (
                <div className="flex gap-2">
                  <button onClick={() => post(`/api/candidates/${c.id}`, { action: 'approve' })} className={`${btn} bg-emerald-600`}>
                    Approve
                  </button>
                  <button onClick={() => post(`/api/candidates/${c.id}`, { action: 'reject' })} className={`${btn} bg-white/10`}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Listings</h2>
        {state.listings.length === 0 && <Empty>Approve products, then run the listing agent.</Empty>}
        <div className="divide-y divide-white/10">
          {state.listings.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="text-2xl">{l.image}</span>
              <div className="min-w-[200px] flex-1">
                <a href={`/product/${l.id}`} className="font-medium hover:text-accent">
                  {l.title}
                </a>
                <p className="text-xs text-slate-500">
                  Store ${l.price.toFixed(2)} · landed cost ${l.cost.toFixed(2)}
                </p>
              </div>
              {(l.channels ?? []).map((c) => (
                <span key={c.channel} className="flex items-center gap-2">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs text-sky-300"
                    title={c.externalId}
                  >
                    {c.channel} ${c.price.toFixed(2)} × {c.quantity}
                    {c.dryRun ? ' · dry run' : ''}
                  </a>
                  {c.dryRun && (
                    <button
                      onClick={() => post('/api/dev/channel-order', { listingId: l.id, channel: c.channel })}
                      className={`${btn} bg-white/10 text-xs`}
                    >
                      Simulate {c.channel} sale
                    </button>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Orders</h2>
        {state.orders.length === 0 && <Empty>No orders yet. Buy something from the storefront to test fulfillment.</Empty>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-white/10">
              {state.orders.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="py-2 pr-4 font-mono text-xs">
                    {o.id}
                    <div className="mt-1 font-sans text-slate-400">{o.channel ?? 'store'}</div>
                  </td>
                  <td className="py-2 pr-4">
                    {state.listings.find((l) => l.id === o.listingId)?.title} × {o.quantity}
                    <div className="text-xs text-slate-500">{o.customer.email || o.customer.address}</div>
                    {o.notes.length > 0 && <div className="text-xs text-slate-500">{o.notes[o.notes.length - 1]}</div>}
                  </td>
                  <td className="py-2 pr-4">${o.total.toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    <Badge status={o.status} />
                    {o.trackingNumber && <div className="mt-1 font-mono text-xs text-slate-400">{o.trackingNumber}</div>}
                  </td>
                  <td className="py-2">
                    {o.status === 'needs_human' && (
                      <button onClick={() => post(`/api/orders/${o.id}`, { action: 'retry' })} className={`${btn} bg-white/10`}>
                        Retry
                      </button>
                    )}
                    {o.status === 'paid' && (
                      <button onClick={() => post(`/api/orders/${o.id}`, { action: 'cancel' })} className={`${btn} bg-white/10`}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-semibold">Agent runs</h2>
          {state.runs.length === 0 && <Empty>No runs yet.</Empty>}
          <div className="space-y-2">
            {state.runs.slice(0, 12).map((r) => (
              <RunItem key={r.id} run={r} open={openRun === r.id || (openRun === null && r === state.runs[0])} toggle={() => setOpenRun(openRun === r.id ? '' : r.id)} />
            ))}
          </div>
        </section>
        <section className={card}>
          <h2 className="mb-3 font-semibold">Customer emails (outbox)</h2>
          {state.outbox.length === 0 && <Empty>Emails sent by the fulfillment agent appear here.</Empty>}
          <div className="space-y-3">
            {state.outbox.slice(0, 10).map((m) => (
              <div key={m.id} className="rounded-lg bg-black/20 p-3 text-sm">
                <p className="font-medium">{m.subject}</p>
                <p className="text-xs text-slate-500">to {m.to}</p>
                <p className="mt-2 whitespace-pre-line text-slate-300">{m.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RunItem({ run, open, toggle }: { run: AgentRun; open: boolean; toggle: () => void }) {
  const color = { running: 'text-amber-400', succeeded: 'text-emerald-400', failed: 'text-red-400' }[run.status];
  const kindColor: Record<string, string> = {
    tool_call: 'text-sky-300',
    tool_result: 'text-slate-500',
    web_search: 'text-violet-300',
    error: 'text-red-400',
    text: 'text-slate-200',
    info: 'text-slate-400',
  };
  return (
    <div className="rounded-lg bg-black/20">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
        <span>
          <span className="font-medium capitalize">{run.agent}</span>{' '}
          <span className="text-xs text-slate-500">{new Date(run.startedAt).toLocaleTimeString()} · {run.mode}</span>
        </span>
        <span className={`text-xs ${color}`}>{run.status}</span>
      </button>
      {open && (
        <div className="max-h-80 space-y-1 overflow-y-auto border-t border-white/10 px-3 py-2 font-mono text-xs">
          {run.logs.map((l, i) => (
            <p key={i} className={`whitespace-pre-wrap break-words ${kindColor[l.kind] ?? ''}`}>
              <span className="text-slate-600">{l.kind.padEnd(11)}</span> {l.message}
            </p>
          ))}
          {run.summary && <p className="pt-2 text-slate-200">→ {run.summary}</p>}
        </div>
      )}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-500/20 text-amber-300',
    approved: 'bg-sky-500/20 text-sky-300',
    listed: 'bg-emerald-500/20 text-emerald-300',
    rejected: 'bg-white/10 text-slate-400',
    paid: 'bg-amber-500/20 text-amber-300',
    ordered_from_supplier: 'bg-sky-500/20 text-sky-300',
    shipped: 'bg-violet-500/20 text-violet-300',
    delivered: 'bg-emerald-500/20 text-emerald-300',
    needs_human: 'bg-red-500/20 text-red-300',
    cancelled: 'bg-white/10 text-slate-400',
  };
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${colors[status] ?? 'bg-white/10'}`}>{status.replace(/_/g, ' ')}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
