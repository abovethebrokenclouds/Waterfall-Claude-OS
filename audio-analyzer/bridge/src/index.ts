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
import { NetTcpControlIO } from './control/tcp.js';
import { YamahaAdapter } from './adapters/yamaha.js';
import { MidasAdapter } from './adapters/midas.js';
import { BehringerAdapter } from './adapters/behringer.js';
import { DigicoAdapter } from './adapters/digico.js';
import { AllenHeathAdapter } from './adapters/allen-heath.js';
import { SoundcraftAdapter } from './adapters/soundcraft.js';
import { AvidAdapter } from './adapters/avid.js';
import { SslAdapter } from './adapters/ssl.js';
import { PresonusAdapter } from './adapters/presonus.js';
import { SimulatedConsoleAdapter } from './adapters/simulated.js';
import type { ConsoleAdapter } from './adapters/types.js';
import { createWsServer } from './server.js';
import type { RunningServer } from './server.js';

/**
 * Vendor → adapter factory registry. Each entry constructs an adapter for a
 * `host:port` control address. Covers all 9 vendor ids in the matrix.
 * Constructing an adapter opens NO socket (the server owns the IOs).
 */
export const ADAPTER_REGISTRY: Record<string, (address: string) => ConsoleAdapter> = {
  yamaha: (address) => new YamahaAdapter({ address }),
  midas: (address) => new MidasAdapter({ address }),
  behringer: (address) => new BehringerAdapter({ address }),
  digico: (address) => new DigicoAdapter({ address }),
  'allen-heath': (address) => new AllenHeathAdapter({ address }),
  soundcraft: (address) => new SoundcraftAdapter({ address }),
  avid: (address) => new AvidAdapter({ address }),
  ssl: (address) => new SslAdapter({ address }),
  presonus: (address) => new PresonusAdapter({ address }),
};

/** Instantiate an adapter by vendor id, or null if the vendor is unknown. */
export function createAdapter(vendor: string, address: string): ConsoleAdapter | null {
  const factory = ADAPTER_REGISTRY[vendor];
  return factory ? factory(address) : null;
}

export interface StartOptions {
  port?: number;
  host?: string;
  /** Console control addresses (host:port). When unset, real adapters are
   *  configured at loopback and the simulated console carries the demo. */
  yamahaAddress?: string;
  midasAddress?: string;
}

/** Build the adapter set the bridge exposes. */
export function buildAdapters(opts: StartOptions): ConsoleAdapter[] {
  const adapters: ConsoleAdapter[] = [];
  // Real OSC adapters — addresses default to loopback so a dev box without a
  // console doesn't blast a real network; override via env for live use.
  // (Any of the 9 vendor ids can be added the same way via
  // `createAdapter(vendor, address)` / ADAPTER_REGISTRY.)
  adapters.push(new YamahaAdapter({ address: opts.yamahaAddress ?? '127.0.0.1:10024' }));
  adapters.push(new MidasAdapter({ address: opts.midasAddress ?? '127.0.0.1:10023' }));
  // Always provide a simulated console so the bridge is useful with no hardware.
  adapters.push(new SimulatedConsoleAdapter({ id: 'sim-m32', vendor: 'midas', model: 'M32', channelCount: 32 }));
  return adapters;
}

/** Start the bridge. Exposed for an embedding host; index does NOT auto-call. */
export function startBridge(opts: StartOptions = {}): RunningServer {
  const port = opts.port ?? Number(process.env.PORT ?? 8088);
  const host = opts.host ?? process.env.HOST;

  const oscIO = new UdpOscIO({
    onError: (e) => console.error('[osc]', e.message),
  });
  // Real byte-stream transport for the non-OSC vendor families (HiQnet / EUCON
  // / SSL / UCNET TCP frames and A&H MIDI-over-TCP). Lazily binds nothing on
  // construction; opens a connection only when a `set` actually routes to it.
  const tcpIO = new NetTcpControlIO({
    onError: (e) => console.error('[tcp]', e.message),
  });
  const discovery = new SimulatedDiscovery();
  const adapters = buildAdapters(opts);

  const server = createWsServer({
    port,
    host,
    oscIO,
    tcpIO,
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
