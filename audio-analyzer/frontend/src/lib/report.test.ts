import { describe, it, expect } from "vitest";
import { buildReportHtml, escapeHtml } from "./report";
import type { Session } from "./sessions";

const baseSession: Session = {
  id: "s-test",
  name: "Main room — house tune",
  mode: "RTA",
  createdAt: "2026-06-20T19:14:00.000Z",
  notes: "Slight 250 Hz buildup.",
  tags: ["live", "PA"],
  value: 250,
  unit: "Hz",
};

describe("escapeHtml", () => {
  it("escapes angle brackets, quotes and ampersands", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">&'`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;",
    );
  });
});

describe("buildReportHtml", () => {
  const html = buildReportHtml(baseSession);

  it("contains the session title", () => {
    expect(html).toContain("Main room — house tune");
  });

  it("contains the key metric value and unit", () => {
    expect(html).toContain("250 Hz");
  });

  it("contains a <style> print block", () => {
    expect(html).toContain("<style>");
    expect(html).toContain("@media print");
  });

  it("renders tags", () => {
    expect(html).toContain("live");
    expect(html).toContain("PA");
  });

  it("escapes user-provided notes (no HTML injection)", () => {
    const evil = buildReportHtml({
      ...baseSession,
      notes: '<script>alert("xss")</script>',
    });
    expect(evil).not.toContain("<script>alert");
    expect(evil).toContain("&lt;script&gt;");
  });

  it("escapes user-provided tags", () => {
    const evil = buildReportHtml({
      ...baseSession,
      tags: ['<b onclick="x">tag'],
    });
    expect(evil).not.toContain('<b onclick="x">');
    expect(evil).toContain("&lt;b");
  });

  it("includes an Insights section when diagnostics are supplied", () => {
    const withDiag = buildReportHtml(baseSession, {
      diagnostics: { splDb: 96 },
    });
    expect(withDiag).toContain("Insights");
    expect(withDiag).toContain("Level");
  });

  it("omits the Insights section when no diagnostics are supplied", () => {
    expect(html).not.toContain("<h2>Insights</h2>");
  });

  it("is a full HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
  });
});
