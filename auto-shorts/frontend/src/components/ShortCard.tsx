import { PLATFORM_LABELS, type ShortCopy, type ShortPlan } from "../lib/types";
import { formatTimecode } from "../lib/format";
import { useRenderJob } from "../hooks/useRenderJob";
import {
  isDownloadable,
  isPolling,
  renderButtonLabel,
} from "../lib/render";

interface Props {
  plan: ShortPlan;
  copy?: ShortCopy;
  onEdit: () => void;
}

/** A single generated short in the results grid. */
export function ShortCard({ plan, copy, onEdit }: Props) {
  const { job, status, error, start } = useRenderJob(plan.id);
  const downloadable = isDownloadable(job);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      {/* Vertical preview placeholder (render arrives via the worker). */}
      <div className="relative flex aspect-[9/16] items-end overflow-hidden rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 p-3">
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {formatTimecode(plan.durationSec)}
        </span>
        <p className="text-lg font-bold leading-tight text-white drop-shadow">
          {plan.hook}
        </p>
      </div>

      <h3 className="font-semibold text-slate-100">{plan.title}</h3>

      <div className="flex flex-wrap gap-1">
        {plan.platforms.map((p) => (
          <span
            key={p}
            className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
          >
            {PLATFORM_LABELS[p]}
          </span>
        ))}
      </div>

      <div className="mt-auto flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Edit
        </button>

        {downloadable ? (
          <a
            href={job?.outputUrl}
            download
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
          >
            Download
          </a>
        ) : (
          <button
            onClick={start}
            disabled={isPolling(status)}
            className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-progress disabled:opacity-70"
          >
            {renderButtonLabel(status)}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {copy && copy.copies.length > 0 && (
        <p className="text-xs text-slate-500">
          {copy.copies.length} platform variants ready
        </p>
      )}
    </div>
  );
}
