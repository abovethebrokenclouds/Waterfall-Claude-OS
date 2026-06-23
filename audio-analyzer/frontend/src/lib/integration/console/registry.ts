// Vendor → adapter registry. The UI resolves an adapter by a console's vendor
// without knowing anything vendor-specific.

import type { ConsoleVendor } from "../model";
import type { ConsoleAdapter } from "./adapter";
import { midasAdapter } from "./midas";
import { yamahaAdapter } from "./yamaha";
import { digicoAdapter } from "./digico";

/** Adapters available app-side (the OSC families). */
export const ADAPTERS: Partial<Record<ConsoleVendor, ConsoleAdapter>> = {
  midas: midasAdapter,
  // Behringer shares the X32/M32 OSC tree with Midas.
  behringer: { ...midasAdapter, vendor: "behringer" },
  yamaha: yamahaAdapter,
  digico: digicoAdapter,
};

/** Resolve the adapter for a vendor, or null if none is implemented app-side. */
export function adapterFor(vendor: ConsoleVendor): ConsoleAdapter | null {
  return ADAPTERS[vendor] ?? null;
}
