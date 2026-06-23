// Client-side, dependency-free printable report builder. Pure TS -> an HTML
// string with warm-studio styling inlined and a print stylesheet. No DOM here;
// the SessionsView opens the returned HTML and calls window.print().

import type { Session } from "./sessions";
import { analyze, type DiagnosticsInput, type Insight } from "./diagnostics";

export interface ReportOptions {
  /** Optional precomputed diagnostics to summarise alongside the session. */
  diagnostics?: DiagnosticsInput;
}

/** Escape text so user-provided notes/tags can never inject HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SEVERITY_COLOR: Record<Insight["severity"], string> = {
  high: "#FF6B8A", // rose
  attention: "#F6A623", // amber
  info: "#2DD4BF", // teal
};

function insightRow(i: Insight): string {
  const color = SEVERITY_COLOR[i.severity];
  const suggestion = i.suggestion
    ? `<div class="sugg">${escapeHtml(i.suggestion)}</div>`
    : "";
  return `<li class="insight">
    <span class="chip" style="background:${color}">${escapeHtml(
      i.severity,
    )}</span>
    <div><strong>${escapeHtml(i.area)}</strong> — ${escapeHtml(
      i.message,
    )}${suggestion}</div>
  </li>`;
}

/**
 * Build a self-contained HTML report for a session. The result is a full
 * document (with <style> + print CSS) suitable for opening in a new window and
 * printing to PDF.
 */
export function buildReportHtml(
  session: Session,
  options: ReportOptions = {},
): string {
  const title = escapeHtml(session.name);
  const mode = escapeHtml(session.mode);
  const when = escapeHtml(new Date(session.createdAt).toLocaleString());
  const metricValue =
    session.unit && Number.isFinite(session.value)
      ? `${escapeHtml(String(session.value))} ${escapeHtml(session.unit)}`
      : "—";

  const tags =
    session.tags.length > 0
      ? session.tags
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join(" ")
      : '<span class="muted">none</span>';

  const notes = session.notes
    ? escapeHtml(session.notes)
    : '<span class="muted">No notes.</span>';

  const insights = options.diagnostics ? analyze(options.diagnostics) : [];
  const insightsBlock =
    insights.length > 0
      ? `<h2>Insights</h2><ul class="insights">${insights
          .map(insightRow)
          .join("")}</ul>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — RTA Insight Pro</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    background: #0C0A12; color: #EDE7F2;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header { border-bottom: 1px solid #2A2233; padding-bottom: 16px; margin-bottom: 24px; }
  .brand {
    font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
    color: #A99FB3;
  }
  h1 {
    margin: 6px 0 0; font-size: 26px; font-weight: 800;
    background: linear-gradient(90deg, #F6A623, #FF6B8A, #A855F7);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  h2 { font-size: 15px; margin: 28px 0 10px; color: #EDE7F2; }
  .meta { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: #A99FB3; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
  .card {
    border: 1px solid #2A2233; background: #16121C;
    border-radius: 12px; padding: 14px;
  }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #A99FB3; }
  .card .value { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 20px; margin-top: 4px; color: #F6A623; }
  .tag {
    display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid #2A2233; background: #1F1828; color: #EDE7F2;
  }
  .muted { color: #A99FB3; }
  .notes { border: 1px solid #2A2233; background: #16121C; border-radius: 12px; padding: 14px; white-space: pre-wrap; }
  ul.insights { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  li.insight { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #2A2233; background: #16121C; border-radius: 12px; padding: 12px; }
  .chip {
    flex: none; font-size: 11px; font-weight: 700; text-transform: uppercase;
    color: #0C0A12; border-radius: 999px; padding: 2px 8px; letter-spacing: 0.04em;
  }
  .sugg { color: #A99FB3; font-size: 13px; margin-top: 3px; }
  footer { margin-top: 32px; border-top: 1px solid #2A2233; padding-top: 12px; font-size: 11px; color: #A99FB3; }
  @media print {
    body { background: #fff; color: #0C0A12; padding: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .card, .notes, li.insight { background: #fff; border-color: #ccc; }
    .meta, .muted, .sugg, .brand, footer { color: #555; }
    .card .value { color: #0C0A12; }
    h1 { color: #0C0A12; -webkit-text-fill-color: #0C0A12; }
    .tag { background: #f2f2f2; border-color: #ccc; color: #0C0A12; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">RTA Insight Pro — Measurement Report</div>
      <h1>${title}</h1>
      <div class="meta">${mode} · ${when}</div>
    </header>

    <h2>Key metrics</h2>
    <div class="grid">
      <div class="card"><div class="label">Mode</div><div class="value">${mode}</div></div>
      <div class="card"><div class="label">Value</div><div class="value">${metricValue}</div></div>
    </div>

    <h2>Tags</h2>
    <div>${tags}</div>

    <h2>Notes</h2>
    <div class="notes">${notes}</div>

    ${insightsBlock}

    <footer>Generated by RTA Insight Pro · heuristic, offline diagnostics · ${when}</footer>
  </div>
</body>
</html>`;
}
