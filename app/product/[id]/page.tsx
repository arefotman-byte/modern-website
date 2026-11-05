import { notFound } from 'next/navigation';
import { readDb } from '@/lib/db';
import CheckoutForm from './CheckoutForm';

export const dynamic = 'force-dynamic';

export default function ProductPage({ params }: { params: { id: string } }) {
  const listing = readDb().listings.find((l) => l.id === params.id && l.active);
  if (!listing) notFound();

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="flex aspect-square items-center justify-center rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 text-[10rem]">
        {listing.image}
      </div>
      <div>
        <h1 className="text-3xl font-bold">{listing.title}</h1>
        <p className="mt-3 text-2xl font-bold text-accent">${listing.price.toFixed(2)}</p>
        <div className="mt-5 space-y-3 whitespace-pre-line text-slate-300">{listing.description}</div>
        <ul className="mt-5 space-y-2 text-slate-300">
          {listing.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-accent">✓</span>
              {b}
            </li>
          ))}
        </ul>
        <CheckoutForm listingId={listing.id} price={listing.price} />
      </div>
    </div>
  );
}
