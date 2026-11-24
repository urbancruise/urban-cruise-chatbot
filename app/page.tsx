import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5" aria-label="Main navigation">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-emerald-900">URBAN CRUISE</Link>
          <a href="https://urbancruise.in/delhi/" className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline">
            Delhi services
          </a>
        </nav>
      </header>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden="true" className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,#d1fae5_1px,transparent_1px),linear-gradient(to_bottom,#d1fae5_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 md:grid-cols-[1.2fr_0.8fr] md:items-center md:py-32">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">Travel, together</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Your next journey starts with the right ride.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Find a car, tempo traveller, or bus for your plans in and beyond Delhi. Share your route and our team can follow up with an enquiry.
            </p>
            <p className="mt-8 text-sm text-slate-300">Agent chat 09:00–21:00 IST · FAQ support 21:00–09:00 IST</p>
          </div>
          <div className="grid grid-cols-2 gap-3" aria-label="Rental options">
            {[
              ["01", "Cars & SUVs"],
              ["02", "Tempo Traveller"],
              ["03", "Urbania"],
              ["04", "Mini & luxury buses"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm">
                <span className="text-xs font-semibold text-emerald-300">{number}</span>
                <p className="mt-8 text-sm font-semibold text-white">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Plan your trip</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">Tell us where you’re headed.</h2>
        <p className="mt-4 max-w-2xl leading-7 text-slate-700">
          Chat with an agent from 09:00 to 21:00 IST. From 21:00 to 09:00 IST, the chatbot answers using approved FAQs. An enquiry is not a confirmed booking.
        </p>
      </section>
    </main>
  );
}
