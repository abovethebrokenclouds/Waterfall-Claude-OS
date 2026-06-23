import { useEffect, useState } from "react";
import {
  sessionsToJson,
  sessionsToCsv,
  sampleSessions,
  type Session,
} from "../lib/sessions";
import { buildReportHtml } from "../lib/report";

const STORAGE_KEY = "rta-insight.sessions.v1";

function loadSessions(): Session[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return sampleSessions();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleSessions();
    const parsed = JSON.parse(raw) as Session[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to samples
  }
  return sampleSessions();
}

function persist(sessions: Session[]) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage may be full / blocked; ignore.
  }
}

function download(filename: string, content: string, mime: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a printable report for a session in a new window and trigger the print
 * dialog (browser → Save as PDF). SSR-safe: only runs in an event handler.
 */
function exportPdf(session: Session) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const html = buildReportHtml(session);
  const win = window.open("", "_blank");
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the new document a tick to lay out before printing.
    win.setTimeout(() => win.print(), 250);
    return;
  }
  // Popup blocked: fall back to a blob URL in the same tab context.
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const fallback = window.open(url, "_blank");
  if (!fallback) URL.revokeObjectURL(url);
}

/** Saved-session list with notes/tags editing and JSON/CSV/PDF export. */
export function SessionsView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    setSessions(loadSessions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(sessions);
  }, [sessions, hydrated]);

  const addSession = () => {
    const now = new Date();
    const next: Session = {
      id: `s-${now.getTime()}`,
      name: `Measurement ${sessions.length + 1}`,
      mode: "RTA",
      createdAt: now.toISOString(),
      notes: "",
      tags: [],
      value: 0,
      unit: "",
    };
    setSessions((s) => [next, ...s]);
  };

  const updateNotes = (id: string, notes: string) =>
    setSessions((s) => s.map((x) => (x.id === id ? { ...x, notes } : x)));

  const updateTags = (id: string, tagsRaw: string) =>
    setSessions((s) =>
      s.map((x) =>
        x.id === id
          ? {
              ...x,
              tags: tagsRaw
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            }
          : x,
      ),
    );

  const remove = (id: string) =>
    setSessions((s) => s.filter((x) => x.id !== id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addSession}
          className="rounded-lg bg-gradient-to-r from-amber to-rose px-3 py-1.5 text-sm font-semibold text-ink"
        >
          + New session
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() =>
              download(
                "rta-sessions.json",
                sessionsToJson(sessions),
                "application/json",
              )
            }
            className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-text"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() =>
              download("rta-sessions.csv", sessionsToCsv(sessions), "text/csv")
            }
            className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-text"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {sessions.length === 0 && (
          <p className="rounded-lg border border-line bg-panel2/60 px-3 py-6 text-center text-sm text-haze">
            No sessions yet. Create one to start logging measurements.
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-line bg-panel2/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-text">{s.name}</div>
                <div className="font-mono text-xs text-haze">
                  {s.mode} ·{" "}
                  {new Date(s.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {s.unit && (
                    <>
                      {" "}
                      · {s.value} {s.unit}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => exportPdf(s)}
                  className="text-xs text-amber hover:text-amber-soft"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="text-xs text-rose hover:text-rose-deep"
                >
                  delete
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={s.tags.join(", ")}
                onChange={(e) => updateTags(s.id, e.target.value)}
                placeholder="tags, comma separated"
                className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text placeholder:text-haze"
              />
              <input
                value={s.notes}
                onChange={(e) => updateNotes(s.id, e.target.value)}
                placeholder="notes"
                className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text placeholder:text-haze"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
