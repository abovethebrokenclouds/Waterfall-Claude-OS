import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Logo } from "../components/Logo";
import { DeviceBar } from "../components/DeviceBar";
import { BottomNav, type AnalyzerTab } from "../components/BottomNav";
import { RtaView, type SpectrumSnapshot } from "../components/RtaView";
import { TransferView } from "../components/TransferView";
import { SplView } from "../components/SplView";
import { Rt60View } from "../components/Rt60View";
import { IrView } from "../components/IrView";
import {
  ConsoleNetworkView,
  type BridgeSourceSelection,
} from "../components/ConsoleNetworkView";
import { SessionsView } from "../components/SessionsView";
import { InsightsPanel } from "../components/InsightsPanel";
import { useAudioState } from "../hooks/useAudioState";
import { useBridgeAudioSpectrum } from "../hooks/useBridgeAudioSpectrum";
import { useBridgeTransfer } from "../hooks/useBridgeTransfer";
import { analyze } from "../lib/diagnostics";
import {
  EDITIONS,
  EDITION_META,
  isEdition,
  type Edition,
} from "../lib/editions";

const EDITION_STORAGE_KEY = "rta-edition";

const TAB_TITLES: Record<AnalyzerTab, string> = {
  rta: "Spectrum Analyzer",
  transfer: "Transfer Function",
  spl: "SPL Meter",
  rt60: "RT60 / Room",
  ir: "Impulse Response",
  console: "Console & Network",
  sessions: "Sessions",
};

const TAB_INSIGHTS: Record<AnalyzerTab, string> = {
  rta: "Watch for narrow peaks 6 dB above their neighbours — that's where feedback starts.",
  transfer:
    "Time-align before you EQ. Phase that wraps smoothly through crossover means your delay is set.",
  spl: "Leq is the energy average over your whole log — it's what venue limits are written against.",
  rt60: "RT rises toward the low end in most rooms. Treat the corners first.",
  ir: "C50 / C80 tell you clarity; STI tells you whether speech will be understood.",
  console:
    "The console is the source of truth — the app mirrors it through the on-LAN bridge and never writes blindly.",
  sessions: "Tag sessions by room and date so before/after comparisons stay easy to find.",
};

export default function AnalyzerApp() {
  const audio = useAudioState();
  const [tab, setTab] = useState<AnalyzerTab>("rta");
  const [spectrum, setSpectrum] = useState<SpectrumSnapshot | null>(null);
  const [consoleSource, setConsoleSource] = useState<BridgeSourceSelection | null>(null);
  const [transferRef, setTransferRef] = useState<BridgeSourceSelection | null>(null);
  const [transferMeas, setTransferMeas] = useState<BridgeSourceSelection | null>(null);
  // Delay compensation for the live transfer phase trace — default on.
  const [transferCompensate, setTransferCompensate] = useState(true);

  // When a console/network channel is wired as the measurement source, tap its
  // streamed PCM off the bridge and compute a live spectrum. Null otherwise.
  const bridgeSpectrum = useBridgeAudioSpectrum(
    consoleSource
      ? {
          url: consoleSource.url,
          consoleId: consoleSource.consoleId,
          channel: consoleSource.channel,
          label: consoleSource.label,
        }
      : null,
  );
  // When both a reference and a measurement channel are wired, tap both off the
  // bridge concurrently and compute a live dual-FFT transfer function. Null
  // until both are selected.
  const bridgeTransfer = useBridgeTransfer(
    transferRef && transferMeas
      ? {
          url: transferRef.url,
          ref: {
            consoleId: transferRef.consoleId,
            channel: transferRef.channel,
            label: transferRef.label,
          },
          meas: {
            consoleId: transferMeas.consoleId,
            channel: transferMeas.channel,
            label: transferMeas.label,
          },
        }
      : null,
    transferCompensate,
  );

  // Defaults to Studio so every feature is visible in the demo; persisted.
  const [edition, setEdition] = useState<Edition>("studio");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(EDITION_STORAGE_KEY);
      if (isEdition(stored)) setEdition(stored);
    } catch {
      // localStorage unavailable — keep the default.
    }
  }, []);

  const changeEdition = (e: Edition) => {
    setEdition(e);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(EDITION_STORAGE_KEY, e);
    } catch {
      // ignore persistence failures
    }
  };

  // Heuristic diagnostics over the active (live or demo) RTA spectrum.
  const insights = useMemo(
    () =>
      spectrum
        ? analyze({ spectrum })
        : analyze({}),
    [spectrum],
  );

  const renderView = () => {
    switch (tab) {
      case "rta":
        return (
          <RtaView
            audio={audio}
            onSpectrum={setSpectrum}
            edition={edition}
            bridgeSpectrum={bridgeSpectrum}
            bridgeLabel={consoleSource?.label ?? null}
          />
        );
      case "transfer":
        return (
          <TransferView
            edition={edition}
            bridgeTransfer={bridgeTransfer}
            refLabel={transferRef?.label ?? null}
            measLabel={transferMeas?.label ?? null}
            compensate={transferCompensate}
            onCompensateChange={setTransferCompensate}
          />
        );
      case "spl":
        return <SplView audio={audio} edition={edition} />;
      case "rt60":
        return <Rt60View />;
      case "ir":
        return <IrView />;
      case "console":
        return (
          <ConsoleNetworkView
            edition={edition}
            onSource={setConsoleSource}
            onTransferSource={({ ref, meas }) => {
              setTransferRef(ref);
              setTransferMeas(meas);
            }}
          />
        );
      case "sessions":
        return <SessionsView />;
    }
  };

  return (
    <>
      <Head>
        <title>RTA Insight Pro — Analyzer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex min-h-screen flex-col">
        {/* App header */}
        <header className="flex items-center justify-between border-b border-line bg-panel/80 px-4 py-2.5 backdrop-blur">
          <Link href="/">
            <Logo size={28} />
          </Link>
          <div className="flex items-center gap-3">
            {/* Edition switcher — gates features across the analyzer. */}
            <div
              className="flex items-center gap-0.5 rounded-lg border border-line bg-panel2 p-0.5"
              role="group"
              aria-label="Edition"
            >
              {EDITIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => changeEdition(e)}
                  title={EDITION_META[e].tagline}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    edition === e
                      ? "bg-amber text-ink"
                      : "text-haze hover:text-text"
                  }`}
                >
                  {EDITION_META[e].label}
                </button>
              ))}
            </div>
            <label className="hidden items-center gap-2 text-xs text-haze sm:flex">
              <input
                type="checkbox"
                checked={audio.performanceMode}
                onChange={(e) => audio.setPerformanceMode(e.target.checked)}
                className="accent-amber"
              />
              Performance Mode
            </label>
            <Link href="/editions" className="text-xs text-haze hover:text-text">
              Editions
            </Link>
            <Link href="/" className="text-xs text-haze hover:text-text">
              Exit
            </Link>
          </div>
        </header>

        <DeviceBar audio={audio} />

        {/* Body: bottom-nav on mobile, left-rail + insights on desktop. */}
        <div className="flex flex-1">
          <div className="hidden lg:block">
            <BottomNav active={tab} onChange={setTab} vertical edition={edition} />
          </div>

          <main className="flex-1 px-4 pb-24 pt-5 lg:pb-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-4 text-xl font-bold tracking-tight">
                {TAB_TITLES[tab]}
              </h1>
              {renderView()}

              {/* Mobile insights: collapsible, RTA tab only. */}
              {tab === "rta" && (
                <div className="mt-4 lg:hidden">
                  <InsightsPanel
                    insights={insights}
                    live={!!audio.engine}
                    collapsible
                  />
                </div>
              )}
            </div>
          </main>

          {/* Insights panel (desktop only) */}
          <aside className="hidden w-72 shrink-0 border-l border-line bg-panel/40 p-5 lg:block">
            <h2 className="mb-2 text-sm font-semibold text-text">Insights</h2>
            {tab === "rta" ? (
              <InsightsPanel insights={insights} live={!!audio.engine} />
            ) : (
              <>
                <p className="text-sm leading-relaxed text-haze">
                  {TAB_INSIGHTS[tab]}
                </p>
                <div className="mt-5 rounded-xl border border-line bg-panel2/60 p-3 text-xs text-haze">
                  {audio.engine
                    ? "Live input connected. Measurements are real."
                    : "No live input — modes show demo data until you press Start."}
                </div>
                {tab === "console" && consoleSource && (
                  <div className="mt-3 rounded-xl border border-teal/40 bg-teal/10 p-3 text-xs text-teal">
                    Measurement source:{" "}
                    <span className="font-mono">{consoleSource.label}</span>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>

        <BottomNav active={tab} onChange={setTab} edition={edition} />
      </div>
    </>
  );
}
