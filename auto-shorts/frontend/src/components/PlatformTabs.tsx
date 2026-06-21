import { useState } from "react";
import { PLATFORM_LABELS, type PlatformCopy } from "../lib/types";

interface Props {
  copies: PlatformCopy[];
}

/** Tabbed view of per-platform copy with a copy-to-clipboard action. */
export function PlatformTabs({ copies }: Props) {
  const [active, setActive] = useState(0);
  if (copies.length === 0) return null;
  const current = copies[Math.min(active, copies.length - 1)];

  const copyText = () => {
    const text = [
      current.title,
      "",
      current.description,
      "",
      current.hashtags.map((h) => `#${h}`).join(" "),
      "",
      current.cta,
    ].join("\n");
    void navigator.clipboard?.writeText(text);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {copies.map((c, i) => (
          <button
            key={c.platform}
            onClick={() => setActive(i)}
            className={`rounded-lg px-3 py-1 text-sm transition ${
              i === active
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {PLATFORM_LABELS[c.platform]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2 rounded-lg bg-slate-900/60 p-3 text-sm">
        <p className="font-semibold text-slate-100">{current.title}</p>
        <p className="text-slate-300">{current.description}</p>
        <p className="text-indigo-300">
          {current.hashtags.map((h) => `#${h}`).join(" ")}
        </p>
        <p className="text-slate-400">{current.cta}</p>
        <button
          onClick={copyText}
          className="mt-1 rounded-md bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
        >
          Copy text
        </button>
      </div>
    </div>
  );
}
