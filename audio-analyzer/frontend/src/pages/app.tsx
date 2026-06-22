import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Logo } from "../components/Logo";
import { DeviceBar } from "../components/DeviceBar";
import { BottomNav, type AnalyzerTab } from "../components/BottomNav";
import { RtaView } from "../components/RtaView";
import { TransferView } from "../components/TransferView";
import { SplView } from "../components/SplView";
import { Rt60View } from "../components/Rt60View";
import { SessionsView } from "../components/SessionsView";
import { useAudioState } from "../hooks/useAudioState";

const TAB_TITLES: Record<AnalyzerTab, string> = {
  rta: "Spectrum Analyzer",
  transfer: "Transfer Function",
  spl: "SPL Meter",
  rt60: "RT60 / Room",
  sessions: "Sessions",
};

const TAB_INSIGHTS: Record<AnalyzerTab, string> = {
  rta: "Watch for narrow peaks 6 dB above their neighbours — that's where feedback starts.",
  transfer:
    "Time-align before you EQ. Phase that wraps smoothly through crossover means your delay is set.",
  spl: "Leq is the energy average over your whole log — it's what venue limits are written against.",
  rt60: "RT rises toward the low end in most rooms. Treat the corners first.",
  sessions: "Tag sessions by room and date so before/after comparisons stay easy to find.",
};

export default function AnalyzerApp() {
  const audio = useAudioState();
  const [tab, setTab] = useState<AnalyzerTab>("rta");

  const renderView = () => {
    switch (tab) {
      case "rta":
        return <RtaView audio={audio} />;
      case "transfer":
        return <TransferView />;
      case "spl":
        return <SplView audio={audio} />;
      case "rt60":
        return <Rt60View />;
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
            <label className="flex items-center gap-2 text-xs text-haze">
              <input
                type="checkbox"
                checked={audio.performanceMode}
                onChange={(e) => audio.setPerformanceMode(e.target.checked)}
                className="accent-amber"
              />
              Performance Mode
            </label>
            <Link
              href="/"
              className="text-xs text-haze hover:text-text"
            >
              Exit
            </Link>
          </div>
        </header>

        <DeviceBar audio={audio} />

        {/* Body: bottom-nav on mobile, left-rail + insights on desktop. */}
        <div className="flex flex-1">
          <div className="hidden lg:block">
            <BottomNav active={tab} onChange={setTab} vertical />
          </div>

          <main className="flex-1 px-4 pb-24 pt-5 lg:pb-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-4 text-xl font-bold tracking-tight">
                {TAB_TITLES[tab]}
              </h1>
              {renderView()}
            </div>
          </main>

          {/* Insights panel (desktop only) */}
          <aside className="hidden w-72 shrink-0 border-l border-line bg-panel/40 p-5 lg:block">
            <h2 className="mb-2 text-sm font-semibold text-text">Insights</h2>
            <p className="text-sm leading-relaxed text-haze">
              {TAB_INSIGHTS[tab]}
            </p>
            <div className="mt-5 rounded-xl border border-line bg-panel2/60 p-3 text-xs text-haze">
              {audio.engine
                ? "Live input connected. Measurements are real."
                : "No live input — modes show demo data until you press Start."}
            </div>
          </aside>
        </div>

        <BottomNav active={tab} onChange={setTab} />
      </div>
    </>
  );
}
