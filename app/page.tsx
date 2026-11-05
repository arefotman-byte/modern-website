import Link from 'next/link';
import { readDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function Storefront() {
  const listings = readDb().listings.filter((l) => l.active);

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-mesh-light p-8 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Trending right now</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
          The internet&apos;s favourite finds, delivered to your door.
        </h1>
        <p className="mt-4 max-w-xl text-slate-300">
          Hand-picked from what people are buying this week. Tracked shipping, 7–14 days.
        </p>
      </section>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">
          No products yet. Open the{' '}
          <Link href="/admin" className="text-accent underline">
            agent control room
          </Link>{' '}
          and run the research and listing agents.
        </div>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/product/${l.id}`}
              className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:-translate-y-1 hover:border-accent/60"
            >
              <div className="flex h-44 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-7xl">
                {l.image}
              </div>
              <h2 className="mt-4 font-semibold text-white group-hover:text-accent">{l.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{l.description}</p>
              <p className="mt-3 text-lg font-bold">${l.price.toFixed(2)}</p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
