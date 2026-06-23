import Head from "next/head";
import Link from "next/link";
import { TopNav } from "../components/TopNav";
import { SpectrumHero } from "../components/SpectrumHero";
import { FeatureColumn } from "../components/FeatureColumn";
import { ModeCard } from "../components/ModeCard";
import { PricingTier } from "../components/PricingTier";
import { Logo } from "../components/Logo";
import {
  IconWave,
  IconSpeaker,
  IconRoom,
  IconGauge,
  IconTransfer,
  IconList,
  IconMic,
  IconChip,
  IconUsb,
  IconGrid,
  IconPulse,
} from "../components/icons";

export default function Landing() {
  return (
    <>
      <Head>
        <title>RTA Insight Pro — Real-Time Audio Insight, Anywhere</title>
        <meta
          name="description"
          content="Mobile-first spectrum, transfer function, and room analysis in a warm studio aesthetic. Tune your PA, measure your room, check your mix anywhere."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <TopNav />

      <main className="mx-auto max-w-6xl px-4">
        {/* HERO */}
        <section className="grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-haze">
              Studio-grade. Pocket-sized.
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              <span className="bg-gradient-to-r from-amber via-rose to-violet bg-clip-text text-transparent">
                Real-Time Audio Insight,
              </span>{" "}
              Anywhere.
            </h1>
            <p className="max-w-md text-lg text-haze">
              Mobile-first spectrum, transfer function, and room analysis in a
              warm studio aesthetic.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-xl bg-gradient-to-r from-amber to-rose px-5 py-3 font-semibold text-ink shadow-glow transition-transform hover:scale-[1.03]"
              >
                Try in Browser
              </Link>
              <a
                href="#pricing"
                className="rounded-xl border border-line bg-panel px-5 py-3 font-semibold text-text transition-colors hover:border-haze"
              >
                Download for iOS
              </a>
              <a
                href="#pricing"
                className="rounded-xl border border-line bg-panel px-5 py-3 font-semibold text-text transition-colors hover:border-haze"
              >
                Download for Android
              </a>
            </div>
          </div>

          <SpectrumHero className="h-64 w-full md:h-80" />
        </section>

        {/* TRUST STRIP */}
        <section className="border-y border-line/60 py-6 text-center">
          <p className="text-sm text-haze">
            Inspired by workflows from{" "}
            <span className="text-text">Smaart</span>,{" "}
            <span className="text-text">REW</span>, and{" "}
            <span className="text-text">SonaVyx</span>.
          </p>
        </section>

        {/* FEATURE COLUMNS */}
        <section id="features" className="py-16 md:py-20">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Built for how you work
          </h2>
          <p className="mb-10 text-center text-haze">
            One tool, three rooms. From the front-of-house to the mix bus.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            <FeatureColumn
              glow="amber"
              icon={<IconSpeaker />}
              title="Live Sound"
              body="Tune your PA with dual-FFT transfer function. Dial in your PA in three measurements."
            />
            <FeatureColumn
              glow="rose"
              icon={<IconRoom />}
              title="Studio"
              body="See your room's decay and frequency balance. See your room decay in seconds."
            />
            <FeatureColumn
              glow="violet"
              icon={<IconWave />}
              title="Creators"
              body="Check your mix translation on the go. Catch a boomy low end before you post."
            />
          </div>
        </section>

        {/* MEASUREMENT MODES */}
        <section id="modes" className="py-16 md:py-20">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            A full measurement suite
          </h2>
          <p className="mb-10 text-center text-haze">
            Everything you need to measure a system, in one app.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ModeCard
              glow="amber"
              icon={<IconWave />}
              title="Spectrum Analyzer"
              description="Real-time 1/1 to 1/24-octave RTA with peak-hold, averaging, and captured traces."
              useCase="Find the ringing frequency before it feeds back."
            />
            <ModeCard
              glow="rose"
              icon={<IconGrid />}
              title="Spectrograph"
              description="Scrolling time-frequency heatmap in a warm colormap — watch the spectrum move."
              useCase="Spot an intermittent resonance that an RTA misses."
            />
            <ModeCard
              glow="rose"
              icon={<IconTransfer />}
              title="Transfer Function"
              description="Dual-channel magnitude, phase, and coherence against a reference."
              useCase="Time-align a sub to the mains in minutes."
            />
            <ModeCard
              glow="violet"
              icon={<IconGauge />}
              title="SPL Meter"
              description="A / C / Z weighting, Fast / Slow ballistics, Leq and peak."
              useCase="Log a show against an 85 dBA venue limit."
            />
            <ModeCard
              glow="teal"
              icon={<IconRoom />}
              title="RT60 / Room"
              description="Schroeder decay curve and reverberation time with plain-language notes."
              useCase="Decide where the next bass trap should go."
            />
            <ModeCard
              glow="violet"
              icon={<IconPulse />}
              title="Impulse Response"
              description="RT60, EDT, C50, C80, D50, Ts, and STI from a measured impulse response."
              useCase="Check whether speech will be intelligible in the room."
            />
            <ModeCard
              glow="rose"
              icon={<IconTransfer />}
              title="Signal Generator"
              description="Pink and white noise, sine, and a log sweep to excite the system under test."
              useCase="Drive the PA with pink noise for a transfer measurement."
            />
            <ModeCard
              glow="amber"
              icon={<IconList />}
              title="Session & SPL Logging"
              description="Save tagged measurements and continuous SPL / Leq logs, export to JSON or CSV."
              useCase="Hand the venue a before/after report."
            />
          </div>

          <p className="mt-10 text-center text-sm text-haze">
            Features scale across editions —{" "}
            <Link href="/editions" className="text-amber-soft hover:text-amber">
              compare Free, Pro &amp; Studio
            </Link>
            .
          </p>
        </section>

        {/* INTEGRATIONS */}
        <section id="integrations" className="py-16 md:py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl font-bold tracking-tight">
                Works with your gear
              </h2>
              <p className="text-haze">
                Start with the built-in mic, then plug in a calibrated reference
                mic over USB. Class-compliant interfaces are picked up
                automatically — no drivers, no setup screens.
              </p>
              <ul className="flex flex-col gap-3 text-sm text-haze">
                <li className="flex items-center gap-3">
                  <span className="text-amber-soft"><IconMic width={18} height={18} /></span>
                  Built-in microphone for a quick check
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-rose"><IconUsb width={18} height={18} /></span>
                  USB audio interfaces and reference mics
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-violet"><IconChip width={18} height={18} /></span>
                  Class-compliant devices, recognized on connect
                </li>
              </ul>
            </div>

            {/* phone -> interface -> speakers diagram */}
            <div className="rounded-2xl border border-line bg-panel/70 p-6">
              <svg viewBox="0 0 360 120" className="w-full" role="img" aria-label="Phone connected to an interface driving speakers">
                <defs>
                  <linearGradient id="flow" x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#F6A623" />
                    <stop offset="0.5" stopColor="#FF6B8A" />
                    <stop offset="1" stopColor="#A855F7" />
                  </linearGradient>
                </defs>
                <line x1="64" y1="60" x2="150" y2="60" stroke="url(#flow)" strokeWidth="3" />
                <line x1="210" y1="60" x2="288" y2="60" stroke="url(#flow)" strokeWidth="3" />
                {/* phone */}
                <rect x="20" y="30" width="44" height="60" rx="8" fill="#1F1828" stroke="#2A2233" strokeWidth="2" />
                <rect x="30" y="40" width="24" height="34" rx="3" fill="#16121C" />
                <text x="42" y="108" fill="#A99FB3" fontSize="10" textAnchor="middle">Phone</text>
                {/* interface */}
                <rect x="150" y="38" width="60" height="44" rx="8" fill="#1F1828" stroke="#2A2233" strokeWidth="2" />
                <circle cx="166" cy="60" r="6" fill="#F6A623" />
                <circle cx="186" cy="60" r="6" fill="#2DD4BF" />
                <text x="180" y="100" fill="#A99FB3" fontSize="10" textAnchor="middle">Interface</text>
                {/* speakers */}
                <rect x="288" y="28" width="40" height="64" rx="8" fill="#1F1828" stroke="#2A2233" strokeWidth="2" />
                <circle cx="308" cy="50" r="8" fill="#16121C" stroke="#FF6B8A" strokeWidth="2" />
                <circle cx="308" cy="74" r="5" fill="#16121C" stroke="#A855F7" strokeWidth="2" />
                <text x="308" y="108" fill="#A99FB3" fontSize="10" textAnchor="middle">Speakers</text>
              </svg>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-16 md:py-20">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Simple pricing
          </h2>
          <p className="mb-10 text-center text-haze">
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
          <p className="mt-8 text-center text-sm text-haze">
            Built for engineers, creators, and studios.{" "}
            <Link href="/editions" className="text-amber-soft hover:text-amber">
              See all three editions →
            </Link>
          </p>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-line/60 bg-panel/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo size={30} />
          <nav className="flex flex-wrap gap-5 text-sm text-haze">
            <a href="#features" className="hover:text-text">Features</a>
            <a href="#modes" className="hover:text-text">Modes</a>
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
          © {new Date().getFullYear()} RTA Insight Pro. A Waterfall Technologies
          product.
        </div>
      </footer>
    </>
  );
}
