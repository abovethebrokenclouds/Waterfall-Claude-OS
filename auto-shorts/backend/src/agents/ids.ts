import { randomUUID } from "node:crypto";

/** Short, prefixed id for an entity, e.g. `short_a1b2c3d4`. */
export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
