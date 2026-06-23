/**
 * index.ts — bridge entrypoint.
 *
 * Wires the REAL UDP OSC transport + SimulatedDiscovery + concrete vendor
 * adapters (Yamaha CL5, Midas M32) plus a simulated console as a hardware-free
 * fallback, then starts the WebSocket server on PORT (default 8088).
 *
 * GUARDED: starting the server only happens when this file is run directly
 * (`node dist/index.js`), so importing it in a test never binds a port.
 */

import { SimulatedDiscovery } from './discovery/simulated.js';
import { UdpOscIO } from './osc/udp.js';
import { YamahaAdapter } from './adapters/yamaha.js';
import { MidasAdapter } from './adapters/midas.js';
import { SimulatedConsoleAdapter } from './adapters/simulated.js';
import type { ConsoleAdapter } from './adapters/types.js';
import { createWsServer } from './server.js';
import type { RunningServer } from './server.js';

export interface StartOptions {
  port?: number;
  host?: string;
  /** Console control addresses (host:port). When unset, real adapters are
   *  configured at loopback and the simulated console carries the demo. */
  yamahaAddress?: string;
  midasAddress?: string;
}

/** Build the adapter registry the bridge exposes. */
export function buildAdapters(opts: StartOptions): ConsoleAdapter[] {
  const adapters: ConsoleAdapter[] = [];
  // Real OSC adapters — addresses default to loopback so a dev box without a
  // console doesn't blast a real network; override via env for live use.
  adapters.push(new YamahaAdapter({ address: opts.yamahaAddress ?? '127.0.0.1:10024' }));
  adapters.push(new MidasAdapter({ address: opts.midasAddress ?? '127.0.0.1:10023' }));
  // Always provide a simulated console so the bridge is useful with no hardware.
  adapters.push(new SimulatedConsoleAdapter({ id: 'sim-m32', vendor: 'Midas', model: 'M32', channelCount: 32 }));
  return adapters;
}

/** Start the bridge. Exposed for an embedding host; index does NOT auto-call. */
export function startBridge(opts: StartOptions = {}): RunningServer {
  const port = opts.port ?? Number(process.env.PORT ?? 8088);
  const host = opts.host ?? process.env.HOST;

  const oscIO = new UdpOscIO({
    onError: (e) => console.error('[osc]', e.message),
  });
  const discovery = new SimulatedDiscovery();
  const adapters = buildAdapters(opts);

  const server = createWsServer({
    port,
    host,
    oscIO,
    discovery,
    adapters,
    onError: (e) => console.error('[bridge]', e.message),
  });

  console.log(`RTA Bridge listening on ws://${host ?? '0.0.0.0'}:${port}`);
  return server;
}

// Guard: only start when run directly, never on import.
if (require.main === module) {
  const server = startBridge();
  const shutdown = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Never let a stray rejection crash the bridge.
  process.on('unhandledRejection', (reason) => {
    console.error('[bridge] unhandledRejection', reason);
  });
}
