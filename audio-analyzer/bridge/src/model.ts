/**
 * model.ts — the normalized domain types shared with the RTA Insight Pro web app.
 *
 * These types are the *contract* between the bridge and the app. They are kept
 * deliberately vendor-neutral: a Yamaha CL5 and a Midas M32 both surface as the
 * same {@link ConsoleChannel} shape so the UI never needs vendor-specific code.
 *
 * Keep in sync with the app's mirror of these types.
 */

/** Audio-network transports the bridge can discover devices on. */
export type Transport =
  | 'dante'
  | 'aes67'
  | 'avb'
  | 'ravenna'
  | 'madi'
  | 'aes50'
  | 'soundgrid';

export const ALL_TRANSPORTS: readonly Transport[] = [
  'dante',
  'aes67',
  'avb',
  'ravenna',
  'madi',
  'aes50',
  'soundgrid',
];

/** Where a meter tap is taken in the channel signal path. */
export type MeterTap = 'pre-eq' | 'post-eq' | 'post-fader';

/** A device found on an audio network (a Dante endpoint, MADI bridge, …). */
export interface NetworkDevice {
  id: string;
  name: string;
  transport: Transport;
  channels: number;
  sampleRate: number;
  /** Whether this device is the network clock master / grandmaster. */
  clockMaster: boolean;
}

/** A mixing console the bridge can talk to (control surface, not the network leg). */
export interface ConsoleDescriptor {
  id: string;
  vendor: string;
  model: string;
  channelCount: number;
  transport?: Transport;
  /** host:port (or host) used to reach the console's control protocol. */
  address: string;
}

/** A single parametric-EQ band on a channel. */
export interface EqBand {
  /** 1-based band index. */
  index: number;
  /** 'peq' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch' */
  type: string;
  freq: number;
  gain: number;
  q: number;
  enabled: boolean;
}

/** Dynamics processor (gate/comp) summary for a channel. */
export interface Dynamics {
  /** Compressor threshold in dB. */
  compThreshold: number;
  compRatio: number;
  compEnabled: boolean;
  /** Gate threshold in dB. */
  gateThreshold: number;
  gateEnabled: boolean;
}

/** Output / bus routing for a channel. */
export interface ChannelRouting {
  /** Output bus ids this channel is assigned to. */
  buses: string[];
  /** Direct-out enabled. */
  directOut: boolean;
}

/** A normalized input channel on a console. */
export interface ConsoleChannel {
  id: string;
  name: string;
  /** Head-amp gain in dB. */
  gain: number;
  /** Digital trim in dB. */
  trim: number;
  /** High-pass filter frequency in Hz (0 = off). */
  hpf: number;
  eq: EqBand[];
  dynamics: Dynamics;
  /** Fader position in dB. */
  faderDb: number;
  mute: boolean;
  routing: ChannelRouting;
}

/** A single meter reading for one channel. */
export interface MeterFrame {
  ch: number;
  rms: number;
  peak: number;
}

/** Word-clock / PTP status. */
export interface ClockStatus {
  locked: boolean;
  source: string;
  ppm: number;
}
