import { useState } from "react";
import { api } from "../lib/api";
import { PlatformTabs } from "./PlatformTabs";
import type { ShortCopy, ShortPlan } from "../lib/types";

interface Props {
  plan: ShortPlan;
  copy?: ShortCopy;
  onClose: () => void;
  onSave: (patch: Partial<ShortPlan>) => void;
}

/** Edit a short: tweak hook/CTA, view per-platform copy, re-angle via the agent. */
export function EditModal({ plan, copy, onClose, onSave }: Props) {
  const [hook, setHook] = useState(plan.hook);
  const [cta, setCta] = useState(plan.cta);
  const [instruction, setInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const regenerate = async () => {
    if (!instruction.trim()) return;
    setRegenerating(true);
    try {
      const updated = await api.variation({ ...plan, hook, cta }, instruction);
      setHook(updated.hook);
      setCta(updated.cta);
      onSave({ hook: updated.hook, cta: updated.cta, theme: updated.theme, title: updated.title });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="grid max-h-[90vh] w-full max-w-3xl gap-6 overflow-auto rounded-2xl bg-slate-900 p-6 md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex aspect-[9/16] items-end rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 p-3">
          <p className="text-lg font-bold text-white">{hook}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-slate-400">Hook</label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100"
              rows={2}
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Call to action</label>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100"
            />
          </div>

          {copy && <PlatformTabs copies={copy.copies} />}

          <div>
            <label className="text-sm text-slate-400">Re-generate with a new angle</label>
            <div className="mt-1 flex gap-2">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. make it funnier, lead with the stat"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100"
              />
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="rounded-lg bg-fuchsia-600 px-3 py-2 text-sm text-white hover:bg-fuchsia-500 disabled:opacity-50"
              >
                {regenerating ? "…" : "Re-angle"}
              </button>
            </div>
          </div>

          <div className="mt-auto flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSave({ hook, cta });
                onClose();
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
