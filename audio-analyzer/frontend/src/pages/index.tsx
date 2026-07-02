import Head from "next/head";
import Link from "next/link";
import { TopNav } from "../components/TopNav";
import { LiveSpectrumHero } from "../components/LiveSpectrumHero";
import { ModeCard } from "../components/ModeCard";
import { PricingTier } from "../components/PricingTier";
import { Logo } from "../components/Logo";
import {
  IconWave,
  IconSpeaker,
  IconRoom,
  IconGauge,
  IconTransfer,
  IconMic,
  IconGrid,
  IconPulse,
} from "../components/icons";

const AUDIENCES = [
  { icon: <IconSpeaker />, title: "Live sound", line: "Tune a PA with dual-FFT transfer function in three measurements." },
  { icon: <IconRoom />, title: "Studio", line: "Read your room's decay and frequency balance in seconds." },
  { icon: <IconWave />, title: "Creators", line: "Catch a boomy low end before you post — anywhere." },
];

export default function Landing() {
  return (
    <>
      <Head>
        <title>RTAI — Real-Time Audio Intelligence</title>
        <meta
          name="description"
          content="Mobile-first spectrum, transfer function, and room analysis in a warm studio aesthetic. Tune your PA, measure your room, check your mix anywhere."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <TopNav />

      <main className="mx-auto max-w-6xl px-4">
        {/* ── HERO — the real analyzer, plus the pitch ── */}
        <section className="relative grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div className="hero-aura pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10" />

          <div className="flex flex-col gap-5">
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

        {/* ── AUDIENCE — one tight row, no doubled copy ── */}
        <section id="features" className="grid gap-4 border-y border-line/60 py-10 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-panel2 text-amber-soft">
                {a.icon}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">{a.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-haze">{a.line}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── MEASUREMENT SUITE — condensed grid ── */}
        <section id="modes" className="py-12 md:py-16">
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              A full measurement suite
            </h2>
            <Link
              href="/editions"
              className="text-sm text-amber-soft hover:text-amber"
            >
              Compare Free, Pro &amp; Studio →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ModeCard
              glow="amber"
              icon={<IconWave />}
              title="Spectrum & Spectrograph"
              description="Real-time 1/1–1/24-oct RTA with peak-hold, averaging, captured traces, and a scrolling time-frequency view."
              useCase="Find the ringing frequency before it feeds back."
            />
            <ModeCard
              glow="rose"
              icon={<IconTransfer />}
              title="Transfer Function"
              description="Dual-channel magnitude, phase, and coherence against a reference, with delay finder and spatial averaging."
              useCase="Time-align a sub to the mains in minutes."
            />
            <ModeCard
              glow="violet"
              icon={<IconGauge />}
              title="SPL Meter"
              description="A / C / Z weighting, Fast / Slow ballistics, Leq and peak — logged continuously."
              useCase="Log a show against an 85 dBA venue limit."
            />
            <ModeCard
              glow="teal"
              icon={<IconRoom />}
              title="RT60 / Room"
              description="Schroeder decay curve and reverberation time with plain-language guidance."
              useCase="Decide where the next bass trap should go."
            />
            <ModeCard
              glow="violet"
              icon={<IconPulse />}
              title="Impulse Response"
              description="RT60, EDT, C50, C80, D50, Ts, and STI from a measured impulse response."
              useCase="Check whether speech will be intelligible."
            />
            <ModeCard
              glow="amber"
              icon={<IconGrid />}
              title="Console & Network"
              description="Tap inputs off Dante / AES67 / AVB networks and major consoles through the on-LAN bridge — plus signal generator and session logging."
              useCase="Measure straight off the desk, no patch required."
            />
          </div>
        </section>

        {/* ── INTEGRATIONS — folded to a single line ── */}
        <section className="border-y border-line/60 py-8">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-haze">
            <span className="text-amber-soft">
              <IconMic width={16} height={16} />
            </span>
            Built-in mic, USB reference mics, and class-compliant interfaces are
            recognized on connect — <span className="text-text">no drivers, no setup screens.</span>
          </p>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="py-12 md:py-16">
          <h2 className="mb-1 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Simple pricing
          </h2>
          <p className="mb-8 text-center text-haze">
            Start free. Upgrade when you need logging and AI diagnostics.
          </p>
          <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
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
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <Logo size={28} />
          <nav className="flex flex-wrap gap-5 text-sm text-haze">
            <a href="#features" className="hover:text-text">For you</a>
            <a href="#modes" className="hover:text-text">Suite</a>
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
        <div className="border-t border-line/60 px-4 py-4 text-center text-xs text-haze">
          © {new Date().getFullYear()} RTAI — Real-Time Audio Intelligence. A
          Waterfall Technologies product.
        </div>
      </footer>
    </>
  );
}
