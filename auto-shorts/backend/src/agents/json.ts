/**
 * Robustly extract a JSON value from a model response. Models sometimes wrap
 * JSON in prose or ```json fences; this pulls out the first balanced JSON
 * object or array and parses it.
 */
export function parseModelJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  // Fast path: the whole thing is JSON.
  try {
    return JSON.parse(candidate) as T;
  } catch {
    /* fall through to bracket scan */
  }

  const start = candidate.search(/[[{]/);
  if (start === -1) {
    throw new Error("No JSON found in model response.");
  }

  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("Unbalanced JSON in model response.");
}
