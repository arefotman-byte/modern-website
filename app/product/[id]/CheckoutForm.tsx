'use client';

import { useState } from 'react';

type State = { status: 'idle' | 'busy' | 'done' | 'error'; message?: string };

export default function CheckoutForm({ listingId, price }: { listingId: string; price: number }) {
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<State>({ status: 'idle' });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ status: 'busy' });
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId, quantity, ...Object.fromEntries(form) }),
    });
    const data = await res.json();
    if (!res.ok) setState({ status: 'error', message: data.error });
    else
      setState({
        status: 'done',
        message: `Order ${data.orderId} placed — $${data.total.toFixed(2)}. Check your email for confirmation.`,
      });
  }

  if (state.status === 'done')
    return (
      <p className="mt-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
        {state.message}
      </p>
    );

  const input =
    'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder:text-slate-500 focus:border-accent focus:outline-none';
  return (
    <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-semibold">Checkout</h2>
      <input name="name" required placeholder="Full name" className={input} />
      <input name="email" type="email" required placeholder="Email" className={input} />
      <textarea name="address" required rows={3} placeholder="Shipping address" className={input} />
      <div className="flex items-center gap-3">
        <label htmlFor="qty" className="text-sm text-slate-400">
          Qty
        </label>
        <input
          id="qty"
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className={`${input} w-20`}
        />
        <span className="ml-auto font-bold">${(price * quantity).toFixed(2)}</span>
      </div>
      {state.status === 'error' && <p className="text-sm text-red-400">{state.message}</p>}
      <button
        disabled={state.status === 'busy'}
        className="w-full rounded-full bg-accent py-3 font-semibold text-white shadow-glow disabled:opacity-60"
      >
        {state.status === 'busy' ? 'Placing order…' : 'Place order'}
      </button>
      <p className="text-xs text-slate-500">Demo checkout: no payment is taken.</p>
    </form>
  );
}
