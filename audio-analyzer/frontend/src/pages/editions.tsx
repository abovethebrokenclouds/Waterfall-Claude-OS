import Head from "next/head";
import Link from "next/link";
import { TopNav } from "../components/TopNav";
import { GlowCard } from "../components/GlowCard";
import {
  EDITIONS,
  EDITION_META,
  FEATURES,
  FEATURE_ORDER,
  hasFeature,
  type Edition,
} from "../lib/editions";

const COLUMN_GLOW: Record<Edition, "amber" | "rose" | "violet"> = {
  free: "amber",
  pro: "rose",
  studio: "violet",
};

const PRICING: Record<
  Edition,
  { price: string; cadence?: string; cta: string; featured?: boolean }
> = {
  free: { price: "$0", cta: "Try in Browser" },
  pro: { price: "$9", cadence: "/mo", cta: "Start Pro", featured: true },
  studio: { price: "$19", cadence: "/mo", cta: "Go Studio" },
};

function Check() {
  return (
    <span className="inline-flex text-teal" aria-label="included">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function Dash() {
  return (
    <span className="inline-flex text-haze/50" aria-label="not included">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}

export default function EditionsPage() {
  return (
    <>
      <Head>
        <title>RTAI — Editions</title>
        <meta
          name="description"
          content="Compare Free, Pro, and Studio editions of RTAI — Real-Time Audio Intelligence — from real-time spectrum to full impulse-response acoustics."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <TopNav />

      <main className="mx-auto max-w-6xl px-4">
        {/* HERO */}
        <section className="py-14 text-center md:py-20">
          <span className="inline-block rounded-full border border-line bg-panel/70 px-3 py-1 text-xs font-medium text-haze backdrop-blur">
            Three editions. One workflow.
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-amber via-rose to-violet bg-clip-text text-transparent">
              Pick the edition
            </span>{" "}
            that fits the room.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-haze">
            Start free with real-time spectrum and SPL. Step up to Pro for system
            tuning, then Studio for full impulse-response acoustics and logging.
          </p>
        </section>

        {/* PRICING-STYLE COLUMN CARDS */}
        <section className="grid gap-5 md:grid-cols-3">
          {EDITIONS.map((e) => {
            const meta = EDITION_META[e];
            const p = PRICING[e];
            return (
              <GlowCard
                key={e}
                glow={COLUMN_GLOW[e]}
                className={`flex flex-col gap-4 ${p.featured ? "border-rose/40 shadow-glow-rose" : ""}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2
                      className={`text-xl font-bold ${
                        e === "free"
                          ? "text-amber-soft"
                          : e === "pro"
                            ? "text-rose"
                            : "text-violet"
                      }`}
                    >
                      {meta.label}
                    </h2>
                    {p.featured && (
                      <span className="rounded-full bg-rose/15 px-2 py-0.5 text-xs font-medium text-rose">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-haze">{meta.smaart}</p>
                  <p className="mt-2 text-sm text-haze">{meta.tagline}</p>
                </div>

                <div className="flex items-end gap-1">
                  <span className="font-mono text-4xl font-bold text-text">
                    {p.price}
                  </span>
                  {p.cadence && (
                    <span className="pb-1 text-sm text-haze">{p.cadence}</span>
                  )}
                </div>

                <Link
                  href="/app"
                  className={`mt-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${
                    p.featured ? "glass-btn-primary" : "glass-btn text-text"
                  }`}
                >
                  {p.cta}
                </Link>
              </GlowCard>
            );
          })}
        </section>

        {/* FEATURE-BY-EDITION MATRIX */}
        <section className="py-16 md:py-20">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Feature comparison
          </h2>
          <p className="mb-10 text-center text-haze">
            Every capability, edition by edition.
          </p>

          <div className="overflow-hidden rounded-2xl border border-line bg-panel/60">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-4 font-semibold text-text">
                    Capability
                  </th>
                  {EDITIONS.map((e) => (
                    <th
                      key={e}
                      className="px-3 py-4 text-center"
                    >
                      <span
                        className={`bg-gradient-to-r bg-clip-text text-transparent ${
                          e === "free"
                            ? "from-amber to-amber-soft"
                            : e === "pro"
                              ? "from-rose to-amber"
                              : "from-violet to-rose"
                        } font-bold`}
                      >
                        {EDITION_META[e].label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ORDER.map((key, idx) => {
                  const f = FEATURES[key];
                  return (
                    <tr
                      key={key}
                      className={`border-b border-line/40 ${
                        idx % 2 === 0 ? "bg-panel2/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{f.label}</div>
                        <div className="text-xs text-haze">{f.detail}</div>
                      </td>
                      {EDITIONS.map((e) => (
                        <td key={e} className="px-3 py-3 text-center">
                          <span className="inline-flex justify-center">
                            {hasFeature(e, key) ? <Check /> : <Dash />}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/app"
              className="glass-btn-primary inline-block rounded-xl px-6 py-3 font-semibold"
            >
              Open the analyzer
            </Link>
          </div>
        </section>

        {/* CREDIT */}
        <section className="border-t border-line/60 py-8 text-center">
          <p className="text-sm text-haze">
            Edition structure inspired by{" "}
            <span className="text-text">Rational Acoustics&rsquo; Smaart v9</span>{" "}
            editions (LE / RT / Suite). RTAI is an independent product
            and is not affiliated with or endorsed by Rational Acoustics.
          </p>
        </section>
      </main>

      <footer className="glass-bar border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-5 text-sm text-haze">
            <Link href="/" className="hover:text-text">Home</Link>
            <Link href="/app" className="hover:text-text">Open App</Link>
          </nav>
          <a
            href="mailto:support@waterfalltechnologies.net"
            className="text-sm text-haze hover:text-text"
          >
            support@waterfalltechnologies.net
          </a>
        </div>
      </footer>
    </>
  );
}
