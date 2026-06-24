// Barrel for the app-side console + digital-audio-network integration library:
// the normalized model, the bridge WS protocol, and the transport client. The
// app is a pure WebSocket client — OSC and all vendor wire-protocols live in the
// RTA Bridge (audio-analyzer/bridge), the single source of truth for encoding.
// SSR-safe.

export * from "./model";
export * from "./bridge-protocol";
export * from "./transport";
