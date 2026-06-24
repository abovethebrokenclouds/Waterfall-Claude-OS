/**
 * clock.ts — derive normalized ClockStatus from a discovered device list.
 *
 * The bridge must never present measurements from an unlocked tap as
 * trustworthy, so it surfaces an honest {@link ClockStatus} to the app. This
 * pure helper derives status from the discovered devices: the clock master
 * (grandmaster) defines the source; with no master, the network is unlocked.
 *
 * A production build would track live PTP/word-clock lock + offset; here the
 * status is derived deterministically so it is testable and honest.
 */

import type { ClockStatus, NetworkDevice } from './model.js';

/**
 * Derive clock status from devices. If exactly one master exists, the network
 * is locked to it; zero masters → unlocked; multiple masters → unlocked
 * (contention) so the app does not trust it.
 */
export function deriveClockStatus(devices: NetworkDevice[]): ClockStatus {
  const masters = devices.filter((d) => d.clockMaster);
  if (masters.length === 1) {
    const m = masters[0]!;
    const source = m.transport === 'madi' ? 'word-clock' : 'ptp';
    return { locked: true, source: `${source}:${m.id}`, ppm: 0 };
  }
  if (masters.length === 0) {
    return { locked: false, source: 'none', ppm: 0 };
  }
  return { locked: false, source: 'contention', ppm: 0 };
}
