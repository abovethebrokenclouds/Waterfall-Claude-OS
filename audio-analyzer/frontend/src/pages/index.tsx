import Head from "next/head";
import Link from "next/link";
import { TopNav } from "../components/TopNav";
import { LiveSpectrumHero } from "../components/LiveSpectrumHero";
import { PricingTier } from "../components/PricingTier";
import { Logo } from "../components/Logo";
import { IconMic } from "../components/icons";

export default function Landing() {
  return (
    <>
      <Head>
        <title>RTAI — Real-Time Audio Intelligence</title>
        <meta
          name="description"
          content="Mobile-first spectrum, transfer function, and room analysis in a warm studio aesthetic. Tune your PA, measure your room, check your mix anywhere."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>

      {/* Cinematic studio-light backdrop — fixed, palette-safe, scoped to /. */}
      <div className="cinematic-bg" aria-hidden />

      <TopNav />

      <main className="mx-auto max-w-6xl px-4">
        {/* ── HERO — the real analyzer, plus the pitch ── */}
        <section className="relative grid items-center gap-6 py-6 md:grid-cols-2 md:py-10">
          <div className="hero-aura pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10" />

          <div className="flex flex-col gap-3">
            <span className="w-fit rounded-full border border-line bg-panel/70 px-3 py-1 text-xs font-medium text-haze backdrop-blur">
              Studio-grade · pocket-sized · on-device
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              <span className="bg-gradient-to-r from-amber via-rose to-violet bg-clip-text text-transparent">
                Real-time audio insight,
              </span>{" "}
              anywhere.
            </h1>
            <p className="max-w-md text-lg text-haze">
              Spectrum, transfer function, and room analysis in one warm,
              mobile-first tool. The hero on the right is the actual analyzer —{" "}
              <span className="text-text">tap Go live</span> to measure your room.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="glass-btn-primary rounded-xl px-5 py-3 font-semibold"
              >
                Launch the analyzer
              </Link>
              <Link
                href="/editions"
                className="glass-btn rounded-xl px-5 py-3 font-semibold text-text"
              >
                See editions
              </Link>
            </div>
            <p className="text-xs text-haze">
              Workflows inspired by{" "}
              <span className="text-text">Smaart</span>,{" "}
              <span className="text-text">REW</span> &{" "}
              <span className="text-text">SonaVyx</span>. Free to start — no
              account.
            </p>
          </div>

          <LiveSpectrumHero className="w-full" />
        </section>

        {/* ── INTEGRATIONS — folded to a single line ── */}
        <section className="border-y border-line/60 py-4">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-haze">
            <span className="text-amber-soft">
              <IconMic width={16} height={16} />
            </span>
            Built-in mic, USB reference mics, and class-compliant interfaces are
            recognized on connect — <span className="text-text">no drivers, no setup screens.</span>
          </p>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="py-6 md:py-8">
          <h2 className="mb-1 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Simple pricing
          </h2>
          <p className="mb-4 text-center text-haze">
            Start free. Upgrade when you need logging and AI diagnostics.
          </p>
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <PricingTier
              name="Free"
              price="$0"
              tagline="Core measurement, forever."
              cta="Try in Browser"
              href="/app"
              features={[
                "Real-time spectrum analyzer",
                "SPL meter with A / C / Z weighting",
                "Built-in and USB mic support",
                "Single-session measurement",
              ]}
            />
            <PricingTier
              featured
              name="Pro"
              price="$9"
              cadence="/mo"
              tagline="Advanced logging and AI diagnostics."
              cta="Start Pro"
              href="/app"
              features={[
                "Transfer function and RT60 modes",
                "Unlimited saved sessions and tags",
                "JSON / CSV / PDF export",
                "AI room and system diagnostics",
              ]}
            />
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="glass-bar border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size={28} />
          <nav className="flex flex-wrap gap-5 text-sm text-haze">
            <Link href="/editions" className="hover:text-text">Editions</Link>
            <a href="#pricing" className="hover:text-text">Pricing</a>
            <Link href="/app" className="hover:text-text">Open App</Link>
          </nav>
          <a
            href="mailto:support@waterfalltechnologies.net"
            className="text-sm text-haze hover:text-text"
          >
            support@waterfalltechnologies.net
          </a>
        </div>
        <div className="border-t border-line/60 px-4 py-2 text-center text-xs text-haze">
          © {new Date().getFullYear()} RTAI — Real-Time Audio Intelligence. A
          Waterfall Technologies product.
        </div>
      </footer>
    </>
  );
}
