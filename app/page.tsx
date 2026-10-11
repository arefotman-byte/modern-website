const featuredCars = [
  {
    name: '2024 Porsche 911 Carrera',
    price: '$112,400',
    image:
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80',
    tag: 'Performance',
    specs: ['0-60 in 3.4s', 'Automatic', '2.0L Turbo'],
  },
  {
    name: '2023 BMW iX xDrive50',
    price: '$88,900',
    image:
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80',
    tag: 'Electric',
    specs: ['500+ HP', 'Luxury', 'AWD'],
  },
  {
    name: '2024 Mercedes-Benz GLE 450',
    price: '$75,500',
    image:
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    tag: 'SUV',
    specs: ['3.0L Turbo', '7 Seats', 'Premium Trim'],
  },
];

const stats = [
  { value: '12k+', label: 'Cars sold' },
  { value: '4.9/5', label: 'Customer rating' },
  { value: '48h', label: 'Avg. delivery' },
  { value: '250+', label: 'Certified dealers' },
];

const benefits = [
  { title: 'Certified quality', text: 'Every vehicle is inspected and backed by our warranty program.' },
  { title: 'Transparent pricing', text: 'No hidden fees, no confusing markups, just clear, fair value.' },
  { title: 'Fast financing', text: 'Get pre-approved in minutes with flexible loan and lease options.' },
  { title: 'Trade-in support', text: 'Turn your current car into credit toward your next dream ride.' },
];

const steps = [
  'Browse the inventory and shortlist the cars you love.',
  'Book a test drive or virtual walkthrough with our team.',
  'Secure financing and finalize your purchase with confidence.',
];

const reviews = [
  {
    name: 'Sarah M.',
    quote: 'The process was effortless from start to finish. I found my dream SUV in under a week.',
  },
  {
    name: 'Daniel R.',
    quote: 'DriveLux made the whole experience feel premium. Their team was honest, fast, and knowledgeable.',
  },
  {
    name: 'Priya L.',
    quote: 'The financing options were clear, and the car arrived exactly as promised. Highly recommended.',
  },
];

export default function Home() {
  return (
    <main className="bg-slate-950 text-white">
      <header className="mx-auto max-w-7xl px-6 pt-6">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white">
              D
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.2em] text-orange-300">DRIVELUX</div>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm text-slate-200 md:flex">
            <a href="#inventory" className="transition hover:text-white">Inventory</a>
            <a href="#why-us" className="transition hover:text-white">Why Us</a>
            <a href="#reviews" className="transition hover:text-white">Reviews</a>
            <a href="#finance" className="transition hover:text-white">Finance</a>
          </div>

          <div className="flex items-center gap-3">
            <button className="hidden rounded-full border border-white/15 px-4 py-2 text-sm text-slate-100 md:block">
              Sign in
            </button>
            <button className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:bg-orange-400">
              Book a test drive
            </button>
          </div>
        </nav>
      </header>

      <section className="relative mx-auto max-w-7xl px-6 pb-16 pt-10 md:pt-16">
        <div className="absolute inset-0 -z-10 bg-mesh-light" />
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-orange-200 uppercase">
              Premium vehicles • new & certified used
            </div>
            <h1 className="max-w-xl text-5xl font-black tracking-tight text-white md:text-6xl">
              Buy the car that matches your next chapter.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Discover premium cars, luxury SUVs, and EVs tailored for performance, comfort, and everyday confidence.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <button className="rounded-full bg-orange-500 px-6 py-3 font-medium text-white shadow-glow transition hover:bg-orange-400">
                Shop inventory
              </button>
              <button className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-medium text-white transition hover:border-white/30 hover:bg-white/10">
                Speak to an advisor
              </button>
            </div>

            <div className="mt-10 flex flex-wrap gap-8">
              {stats.slice(0, 3).map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-10 top-8 h-44 w-44 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="absolute -right-8 bottom-12 h-52 w-52 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-3 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80"
                alt="Luxury sports car"
                className="h-[560px] w-full rounded-[26px] object-cover"
              />
              <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-white/10 bg-slate-950/75 p-5 backdrop-blur-md">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-orange-300">Featured</div>
                    <div className="mt-1 text-xl font-semibold">2024 Lexus IS 500</div>
                  </div>
                  <div className="rounded-full bg-orange-500 px-3 py-1 text-sm font-semibold text-white">$67,900</div>
                </div>
                <div className="mt-4 flex gap-3 text-sm text-slate-300">
                  <span>V8</span>
                  <span>•</span>
                  <span>RWD</span>
                  <span>•</span>
                  <span>Sport Luxury</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="inventory" className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-orange-300">Featured inventory</div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">Built for the way you drive</h2>
          </div>
          <a href="#" className="text-sm font-medium text-orange-300 transition hover:text-orange-200">
            View all cars →
          </a>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {featuredCars.map((car) => (
            <article key={car.name} className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-900">
              <div className="relative">
                <img src={car.image} alt={car.name} className="h-64 w-full object-cover" />
                <span className="absolute left-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-medium text-orange-200">
                  {car.tag}
                </span>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-semibold text-white">{car.name}</h3>
                  <span className="text-base font-bold text-orange-300">{car.price}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {car.specs.map((spec) => (
                    <span key={spec} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                      {spec}
                    </span>
                  ))}
                </div>
                <button className="mt-6 w-full rounded-full bg-white px-4 py-3 font-medium text-slate-950 transition hover:bg-slate-200">
                  Reserve now
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="why-us" className="bg-slate-900/70">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-orange-300">Why choose DriveLux</div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">A smarter way to buy a car.</h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="rounded-[24px] border border-white/10 bg-slate-950/60 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/15 text-xl text-orange-300">
                  ✓
                </div>
                <h3 className="text-lg font-semibold text-white">{benefit.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{benefit.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="finance" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-orange-300">How it works</div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">Find your next vehicle in three steps.</h2>
            <div className="mt-8 space-y-5">
              {steps.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                    {index + 1}
                  </div>
                  <p className="pt-2 text-slate-200">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-orange-300">Finance estimate</div>
                <h3 className="mt-2 text-3xl font-bold">$1,320/mo</h3>
              </div>
              <div className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
                72 months
              </div>
            </div>

            <div className="space-y-6">
              {[
                ['Vehicle price', '$79,995'],
                ['Down payment', '$15,000'],
                ['APR', '3.9%'],
                ['Estimated total', '$95,040'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm text-slate-300">
                  <span>{label}</span>
                  <span className="font-medium text-white">{value}</span>
                </div>
              ))}
            </div>

            <button className="mt-8 w-full rounded-full bg-orange-500 px-5 py-3 font-medium text-white transition hover:bg-orange-400">
              Get pre-approved
            </button>
          </div>
        </div>
      </section>

      <section id="reviews" className="bg-slate-900/80">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-orange-300">Customer reviews</div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">Drivers trust DriveLux.</h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {reviews.map((review) => (
              <div key={review.name} className="rounded-[26px] border border-white/10 bg-slate-950/60 p-6">
                <div className="mb-4 text-orange-300">★★★★★</div>
                <p className="text-base leading-7 text-slate-200">“{review.quote}”</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                    {review.name.charAt(0)}
                  </div>
                  <div className="text-sm font-medium text-white">{review.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="rounded-[32px] border border-orange-500/20 bg-gradient-to-r from-orange-500/20 via-slate-900 to-slate-900 p-8 md:p-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-orange-300">Don’t wait</div>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">Your next car is waiting.</h2>
            </div>
            <button className="rounded-full bg-orange-500 px-6 py-3 font-medium text-white shadow-glow transition hover:bg-orange-400">
              Start shopping
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">D</div>
            <span>DriveLux © 2026</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white">Inventory</a>
            <a href="#" className="hover:text-white">Finance</a>
            <a href="#" className="hover:text-white">Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
