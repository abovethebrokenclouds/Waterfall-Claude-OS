/**
 * osc/types.ts — shared OSC value/message types for the pure-TS codec.
 *
 * We support the OSC 1.0 core type tags used by audio consoles:
 *   i = int32, f = float32, s = OSC-string, b = OSC-blob.
 */

/** A typed OSC argument. */
export type OscArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Uint8Array };

/** A decoded / to-be-encoded OSC message. */
export interface OscMessage {
  /** OSC address pattern, e.g. "/ch/01/mix/fader". */
  address: string;
  args: OscArg[];
}

/** Convenience constructors. */
export const osc = {
  i: (value: number): OscArg => ({ type: 'i', value: value | 0 }),
  f: (value: number): OscArg => ({ type: 'f', value }),
  s: (value: string): OscArg => ({ type: 's', value }),
  b: (value: Uint8Array): OscArg => ({ type: 'b', value }),
  msg: (address: string, ...args: OscArg[]): OscMessage => ({ address, args }),
};
