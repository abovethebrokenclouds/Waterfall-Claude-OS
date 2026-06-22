import type { ReactNode } from "react";
import {
  IconWave,
  IconTransfer,
  IconGauge,
  IconRoom,
  IconList,
} from "./icons";

export type AnalyzerTab = "rta" | "transfer" | "spl" | "rt60" | "sessions";

interface TabDef {
  id: AnalyzerTab;
  label: string;
  icon: ReactNode;
}

const TABS: TabDef[] = [
  { id: "rta", label: "RTA", icon: <IconWave width={20} height={20} /> },
  { id: "transfer", label: "Transfer", icon: <IconTransfer width={20} height={20} /> },
  { id: "spl", label: "SPL", icon: <IconGauge width={20} height={20} /> },
  { id: "rt60", label: "RT60", icon: <IconRoom width={20} height={20} /> },
  { id: "sessions", label: "Sessions", icon: <IconList width={20} height={20} /> },
];

interface BottomNavProps {
  active: AnalyzerTab;
  onChange: (tab: AnalyzerTab) => void;
  /** When true, render as a vertical left rail (desktop). */
  vertical?: boolean;
}

/** Thumb-friendly fixed bottom navigation, or a left rail on desktop. */
export function BottomNav({ active, onChange, vertical = false }: BottomNavProps) {
  if (vertical) {
    return (
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-line bg-panel/60 p-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active === t.id
                ? "bg-panel2 text-amber-soft"
                : "text-haze hover:text-text"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={active === t.id ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              active === t.id ? "text-amber-soft" : "text-haze"
            }`}
          >
            <span className={active === t.id ? "drop-shadow-[0_0_8px_rgba(246,166,35,0.5)]" : ""}>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
