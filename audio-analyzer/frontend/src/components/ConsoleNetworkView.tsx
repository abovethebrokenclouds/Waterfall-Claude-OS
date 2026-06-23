import { useEffect, useMemo, useRef, useState } from "react";
import { LockChip } from "./LockChip";
import { IconChip, IconGrid } from "./icons";
import { hasFeature, type Edition } from "../lib/editions";
import {
  makeTransport,
  type IntegrationTransport,
  type TransportStatus,
} from "../lib/integration/transport";
import type {
  NetworkDevice,
  ConsoleDescriptor,
  ConsoleChannel,
  MeterFrame,
  MeterTap,
} from "../lib/integration/model";
import { METER_TAPS } from "../lib/integration/model";

interface ConsoleNetworkViewProps {
  /** Current edition — the Console view is Studio-gated. */
  edition?: Edition;
  /** Notified when a channel is wired as the analyzer measurement source. */
  onSource?: (source: { consoleId: string; channelId: string; label: string } | null) => void;
}

const STATUS_LABEL: Record<TransportStatus, string> = {
  idle: "idle",
  connecting: "connecting…",
  connected: "connected",
  error: "no bridge",
  closed: "disconnected",
};

const TAP_LABEL: Record<MeterTap, string> = {
  "pre-eq": "Pre-EQ",
  "post-eq": "Post-EQ",
  "post-fader": "Post-fader",
};

/**
 * Studio-edition Console + Network view. Talks to an on-LAN RTA Bridge over the
 * normalized WebSocket protocol, or falls back to the built-in SimulatedTransport
 * (blank URL / "Demo"). SSR-safe: all browser globals live inside effects.
 */
export function ConsoleNetworkView({ edition = "studio", onSource }: ConsoleNetworkViewProps) {
  const unlocked = hasFeature(edition, "ir"); // Studio gate (IR is Studio-min)

  const [urlInput, setUrlInput] = useState("");
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<TransportStatus>("idle");
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [consoles, setConsoles] = useState<ConsoleDescriptor[]>([]);
  const [clockLocked, setClockLocked] = useState<boolean | null>(null);
  const [clockSource, setClockSource] = useState<string>("");
  const [selectedConsole, setSelectedConsole] = useState<string | null>(null);
  const [channels, setChannels] = useState<ConsoleChannel[]>([]);
  const [tap, setTap] = useState<MeterTap>("post-fader");
  const [meters, setMeters] = useState<Record<number, MeterFrame>>({});
  const [source, setSourceState] = useState<{ consoleId: string; channelId: string; label: string } | null>(null);

  const transportRef = useRef<IntegrationTransport | null>(null);

  // Connect / reconnect whenever the active URL changes.
  useEffect(() => {
    if (activeUrl === null) return;
    const t = makeTransport(activeUrl);
    transportRef.current = t;
    setStatus("connecting");

    const off = t.onMessage((msg) => {
      switch (msg.t) {
        case "welcome":
          setStatus("connected");
          break;
        case "devices":
          setDevices(msg.devices);
          break;
        case "consoles":
          setConsoles(msg.consoles);
          break;
        case "channels":
          setChannels(msg.channels);
          break;
        case "clock":
          setClockLocked(msg.status.locked);
          setClockSource(msg.status.source);
          break;
        case "meters":
          setMeters((prev) => {
            const next = { ...prev };
            for (const f of msg.frames) next[f.ch] = f;
            return next;
          });
          break;
        case "error":
          setStatus("error");
          break;
      }
    });

    t.connect();
    t.send({ t: "discover" });
    // Reflect the live status shortly after connect.
    const poll = setInterval(() => setStatus(t.status), 400);

    return () => {
      clearInterval(poll);
      off();
      t.disconnect();
      transportRef.current = null;
    };
  }, [activeUrl]);

  // Load channels + subscribe meters when a console is selected.
  useEffect(() => {
    const t = transportRef.current;
    if (!t || !selectedConsole) return;
    setChannels([]);
    setMeters({});
    t.send({ t: "get", scope: "channels", consoleId: selectedConsole });
  }, [selectedConsole]);

  // (Re)subscribe meters when the tap or channel set changes.
  useEffect(() => {
    const t = transportRef.current;
    if (!t || !selectedConsole || channels.length === 0) return;
    const chNums = channels.map((c) => parseInt(c.id, 10)).filter((n) => Number.isFinite(n));
    t.send({ t: "meter.subscribe", consoleId: selectedConsole, tap, channels: chNums });
    return () => {
      t.send({ t: "unsubscribe" });
    };
  }, [selectedConsole, tap, channels]);

  const connect = () => {
    setDevices([]);
    setConsoles([]);
    setChannels([]);
    setSelectedConsole(null);
    setClockLocked(null);
    setActiveUrl(urlInput);
  };

  const disconnect = () => {
    setActiveUrl(null);
    setStatus("closed");
    transportRef.current?.disconnect();
    transportRef.current = null;
  };

  const setSource = (s: { consoleId: string; channelId: string; label: string } | null) => {
    setSourceState(s);
    onSource?.(s);
  };

  const selectedDescriptor = useMemo(
    () => consoles.find((c) => c.id === selectedConsole) ?? null,
    [consoles, selectedConsole],
  );

  const isSimulated = activeUrl !== null && (activeUrl.trim() === "" || activeUrl.trim().toLowerCase() === "demo");

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-violet/40 bg-violet/10 p-4 text-sm text-text">
          <IconChip width={18} height={18} />
          Console &amp; Network integration <LockChip edition="studio" />
        </div>
        <p className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-haze">
          Connect mixing consoles (Yamaha CL/QL, Midas/Behringer M32, DiGiCo) and
          digital-audio networks (Dante, AES67, AES50) through the on-LAN RTA
          Bridge, then wire any channel as your measurement source. A Studio
          feature.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bridge connection bar. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel2/40 p-3">
        <label className="flex flex-1 items-center gap-2 text-xs text-haze">
          <span className="whitespace-nowrap">Bridge URL</span>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="ws://10.0.0.2:9000  ·  blank or “Demo” = simulated"
            className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-2.5 py-1.5 font-mono text-xs text-text placeholder:text-haze/60 focus:border-amber focus:outline-none"
          />
        </label>
        {activeUrl === null ? (
          <button
            type="button"
            onClick={connect}
            className="rounded-lg bg-gradient-to-r from-amber to-rose px-3 py-1.5 text-xs font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
            Connect
          </button>
        ) : (
          <button
            type="button"
            onClick={disconnect}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-haze hover:text-text"
          >
            Disconnect
          </button>
        )}
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
            status === "connected"
              ? "border-teal/40 bg-teal/10 text-teal"
              : status === "error"
                ? "border-rose/40 bg-rose/10 text-rose"
                : "border-line bg-panel text-haze"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {activeUrl === null && (
        <p className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-haze">
          Not connected. Leave the URL blank (or type “Demo”) and press Connect to
          explore with simulated devices — no hardware required.
        </p>
      )}

      {isSimulated && status === "connected" && (
        <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber-soft">
          No bridge connected — showing simulated devices.
        </p>
      )}

      {activeUrl !== null && (
        <>
          {/* Network devices. */}
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <IconGrid width={16} height={16} /> Network Devices
            </h3>
            {devices.length === 0 ? (
              <p className="rounded-lg border border-line bg-panel2/40 px-3 py-2 text-xs text-haze">
                No devices discovered yet.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-text">{d.name}</div>
                      <div className="font-mono text-[11px] text-haze">
                        {d.channels} ch · {(d.sampleRate / 1000).toFixed(d.sampleRate % 1000 ? 1 : 0)} kHz
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 font-mono text-[10px] uppercase text-violet">
                        {d.transport}
                      </span>
                      {d.clockMaster && (
                        <span
                          className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 font-mono text-[10px] text-teal"
                          title="Clock master"
                        >
                          master
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {clockLocked !== null && (
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className={`h-2 w-2 rounded-full ${clockLocked ? "bg-teal" : "bg-rose"}`}
                  aria-hidden
                />
                <span className="font-mono text-haze">
                  Clock {clockLocked ? "locked" : "unlocked"}
                  {clockSource ? ` · ${clockSource}` : ""}
                </span>
              </div>
            )}
          </section>

          {/* Consoles. */}
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <IconChip width={16} height={16} /> Consoles
            </h3>
            {consoles.length === 0 ? (
              <p className="rounded-lg border border-line bg-panel2/40 px-3 py-2 text-xs text-haze">
                No consoles discovered yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {consoles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedConsole(c.id)}
                    className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedConsole === c.id
                        ? "border-amber/60 bg-amber/10"
                        : "border-line bg-panel2/40 hover:border-line/80"
                    }`}
                  >
                    <span className="text-sm font-medium text-text">
                      {c.vendor} {c.model}
                    </span>
                    <span className="font-mono text-[11px] text-haze">
                      {c.channelCount} ch · {c.address}
                      {c.transport ? ` · ${c.transport}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Channel strips for the selected console. */}
          {selectedDescriptor && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-text">
                  {selectedDescriptor.vendor} {selectedDescriptor.model} — channels
                </h3>
                {/* Meter-tap selector. */}
                <div
                  className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-panel2 p-0.5"
                  role="group"
                  aria-label="Meter tap"
                >
                  {METER_TAPS.map((mt) => (
                    <button
                      key={mt}
                      type="button"
                      onClick={() => setTap(mt)}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                        tap === mt ? "bg-amber text-ink" : "text-haze hover:text-text"
                      }`}
                    >
                      {TAP_LABEL[mt]}
                    </button>
                  ))}
                </div>
              </div>

              {channels.length === 0 ? (
                <p className="rounded-lg border border-line bg-panel2/40 px-3 py-2 text-xs text-haze">
                  Reading channel list…
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {channels.map((ch) => {
                    const chNum = parseInt(ch.id, 10);
                    const m = meters[chNum];
                    const isSource =
                      source?.consoleId === selectedDescriptor.id && source?.channelId === ch.id;
                    return (
                      <div
                        key={ch.id}
                        className={`flex flex-col gap-2 rounded-xl border p-3 ${
                          isSource ? "border-teal/60 bg-teal/5" : "border-line bg-panel2/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-text">
                            {ch.id} · {ch.name}
                          </span>
                          {ch.mute && (
                            <span className="rounded-full border border-rose/40 bg-rose/10 px-2 py-0.5 font-mono text-[10px] text-rose">
                              mute
                            </span>
                          )}
                        </div>

                        {/* Mono / tabular readouts. */}
                        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[11px]">
                          <Readout label="gain" value={`${ch.gain.toFixed(0)} dB`} />
                          <Readout label="trim" value={`${ch.trim >= 0 ? "+" : ""}${ch.trim.toFixed(0)}`} />
                          <Readout label="hpf" value={ch.hpf > 0 ? `${ch.hpf} Hz` : "off"} />
                          <Readout
                            label="eq"
                            value={`${ch.eq.length} bnd`}
                          />
                          <Readout
                            label="dyn"
                            value={`${ch.dynamics.ratio.toFixed(0)}:1`}
                          />
                          <Readout
                            label="fader"
                            value={`${ch.faderDb >= 0 ? "+" : ""}${ch.faderDb.toFixed(1)}`}
                          />
                        </dl>

                        {/* Live meter. */}
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-teal via-amber to-rose transition-[width] duration-100"
                              style={{ width: `${meterPct(m?.rms)}%` }}
                            />
                          </div>
                          <span className="w-16 text-right font-mono text-[10px] text-haze">
                            {m ? `${m.rms.toFixed(1)} dB` : "— dB"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setSource(
                              isSource
                                ? null
                                : {
                                    consoleId: selectedDescriptor.id,
                                    channelId: ch.id,
                                    label: `${selectedDescriptor.vendor} ${selectedDescriptor.model} · ${ch.name}`,
                                  },
                            )
                          }
                          className={`self-start rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            isSource
                              ? "border border-teal/50 bg-teal/10 text-teal"
                              : "border border-line bg-panel text-haze hover:text-text"
                          }`}
                        >
                          {isSource ? "Measuring this channel" : "Send to analyzer"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {source && (
                <p className="rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-xs text-teal">
                  Analyzer source: <span className="font-mono">{source.label}</span> ({TAP_LABEL[tap]})
                </p>
              )}
            </section>
          )}
        </>
      )}

      <p className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-haze">
        A browser cannot speak OSC or Dante directly — the app talks to the on-LAN
        RTA Bridge over one normalized WebSocket protocol, and the console always
        stays the source of truth.
      </p>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9px] uppercase tracking-wide text-haze/70">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

/** Map a dBFS RMS (range ~[-60, 0]) to a 0..100 bar width. */
function meterPct(rms: number | undefined): number {
  if (rms === undefined) return 0;
  const pct = ((rms + 60) / 60) * 100;
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
}
