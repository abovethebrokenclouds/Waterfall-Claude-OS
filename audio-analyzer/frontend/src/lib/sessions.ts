// Session model + pure export serializers (JSON / CSV). The serializers are
// DOM-free and unit-testable; localStorage / download wiring lives in the view.

export interface Session {
  id: string;
  name: string;
  mode: "RTA" | "Transfer" | "SPL" | "RT60";
  createdAt: string; // ISO 8601
  notes: string;
  tags: string[];
  /** A representative measured value for the mode (e.g. SPL dB, RT60 s). */
  value: number;
  unit: string;
}

/** Pretty-printed JSON for export. */
export function sessionsToJson(sessions: Session[]): string {
  return JSON.stringify(sessions, null, 2);
}

/** Escape a CSV field per RFC 4180. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize sessions to CSV with a header row. */
export function sessionsToCsv(sessions: Session[]): string {
  const header = [
    "id",
    "name",
    "mode",
    "createdAt",
    "value",
    "unit",
    "tags",
    "notes",
  ];
  const rows = sessions.map((s) =>
    [
      s.id,
      s.name,
      s.mode,
      s.createdAt,
      String(s.value),
      s.unit,
      s.tags.join("|"),
      s.notes,
    ]
      .map(csvField)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/** A small deterministic set of demo sessions for first run. */
export function sampleSessions(): Session[] {
  return [
    {
      id: "s-001",
      name: "Main room — house tune",
      mode: "RTA",
      createdAt: "2026-06-20T19:14:00.000Z",
      notes: "Slight 250 Hz buildup, pulled 2 dB on the graphic.",
      tags: ["live", "PA"],
      value: 250,
      unit: "Hz",
    },
    {
      id: "s-002",
      name: "Control room RT60",
      mode: "RT60",
      createdAt: "2026-06-21T10:02:00.000Z",
      notes: "Low end rings — needs corner traps.",
      tags: ["studio", "acoustics"],
      value: 0.92,
      unit: "s",
    },
    {
      id: "s-003",
      name: "Show A — FOH SPL log",
      mode: "SPL",
      createdAt: "2026-06-21T21:40:00.000Z",
      notes: "Peaked under the 96 dBA limit.",
      tags: ["live", "compliance"],
      value: 94.6,
      unit: "dBA",
    },
  ];
}
