---
name: audio-device-integration
description: >-
  Guide and audit safe Web Audio / MediaDevices integration for the RTAI
  analyzer — device enumeration (navigator.mediaDevices.enumerateDevices),
  getUserMedia audio constraints with the measurement-critical processing
  DISABLED (autoGainControl, echoCancellation, noiseSuppression all false),
  sample-rate negotiation, USB / class-compliant interface handling, AudioContext
  / AudioWorklet capture, SSR-safety (guarding window / navigator / AudioContext
  so they never run at module scope or during server render), and graceful
  permission-denied / empty-device-list fallbacks. Use when building or reviewing
  microphone/input capture, a device picker, the audio input pipeline, getUserMedia
  permission flow, or interface selection, or when measurements read wrong because
  the browser is "helpfully" gain-riding the mic. Ships a `scan-audio-io.sh`
  scanner that flags getUserMedia calls that don't disable AGC/echo/noise
  (a measurement-accuracy bug) and unguarded top-level AudioContext /
  navigator.mediaDevices access (an SSR hazard); exits non-zero on findings.
---

# Audio Device Integration

The capture layer of RTAI: getting honest samples from a real input
device into the DSP core. Two things ruin a measurement here — the browser's
**voice-call DSP** (AGC/AEC/NS) silently altering the signal, and **SSR/module
-scope** access to browser globals crashing the build or hydration.

## How to run

```bash
bash .claude/skills/audio-device-integration/scan-audio-io.sh
```

It greps `audio-analyzer/frontend/src/` (if present) for the two regression
classes below, prints offenders as `[SEV] source: detail`, and exits non-zero
when any are found (safe as a CI gate). It no-ops cleanly (exit 0) when the src
dir is absent.

## Measurement-grade capture (the non-negotiables)

A measurement mic must receive the **unaltered** signal. The browser defaults to
voice-call processing, which corrupts every reading:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: selectedId ? { exact: selectedId } : undefined,
    autoGainControl: false,    // ← AGC rides level → SPL/Leq meaningless
    echoCancellation: false,    // ← AEC adds nonlinear processing
    noiseSuppression: false,    // ← NS gates/colors the spectrum
    channelCount: 2,            // dual-channel transfer function needs 2 in
    sampleRate: 48000,          // request; verify what you actually got
  },
});
```

- **All three of `autoGainControl`, `echoCancellation`, `noiseSuppression` must
  be `false`.** Omitting them lets the UA default to `true`. The scanner flags a
  `getUserMedia` audio request that doesn't explicitly disable all three.
- **Sample-rate negotiation:** the requested `sampleRate` is a hint. Read the
  **actual** rate back from `AudioContext.sampleRate` (or the track settings) and
  feed *that* to the DSP — bin math (`fs/N`) and weighting depend on it.
- **Channel count:** the dual-channel transfer function needs ≥2 input channels;
  many interfaces expose them as separate devices — surface that in the picker.

## Device enumeration & interface handling

- Enumerate with `navigator.mediaDevices.enumerateDevices()`, filtering
  `kind === 'audioinput'`. **Labels are empty until permission is granted** — get
  a stream first (or re-enumerate after `getUserMedia` resolves) to show real
  names.
- **USB / class-compliant interfaces** (Focusrite, MOTU, UMIK-class mics) appear
  as normal `audioinput` devices; let the user pick by `deviceId`, persist the
  choice, and re-resolve on `devicechange` (hot-plug). Don't assume the default
  device is the measurement mic.
- Subscribe to `navigator.mediaDevices.addEventListener('devicechange', …)` to
  refresh the list when an interface is plugged/unplugged.

## SSR-safety (browser globals)

The app may server-render. `window`, `navigator`, `AudioContext`, and
`MediaDevices` **do not exist on the server** and must never be touched at module
scope:

```ts
// ❌ crashes SSR / vite build — runs at import time
const ctx = new AudioContext();
const devices = navigator.mediaDevices.enumerateDevices();

// ✅ inside an effect / event handler, guarded
useEffect(() => {
  if (typeof window === "undefined") return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  // ...
  return () => void ctx.close();
}, []);
```

- Create the `AudioContext` **lazily** inside a user gesture (autoplay policy
  requires a gesture to start audio) and inside a `typeof window` guard.
- The scanner flags top-level `new AudioContext()` / `new webkitAudioContext()`
  and bare `navigator.mediaDevices` access that isn't inside a `useEffect` /
  callback or behind a `typeof window`/`typeof navigator` guard.

## Graceful fallbacks

- **Permission denied / dismissed:** catch the `getUserMedia` rejection
  (`NotAllowedError`, `NotFoundError`, `NotReadableError`) and show a recovery UI
  with how to re-grant — never leave a dead spinner.
- **Empty device list:** if no `audioinput` exists, show an explicit "connect an
  input device" state, not a silent failure.
- **Context interrupted/suspended** (tab backgrounded, device removed): detect
  `statechange`/`ended` and offer to resume/re-select.

## Quality bar
- Every `getUserMedia` audio request disables AGC, AEC, and NS.
- No browser global at module scope; all capture lives behind a gesture + a
  `typeof window` guard inside an effect.
- Actual negotiated sample rate flows into the DSP layer, not the requested one.
- Permission and empty-device paths have real fallback UI.
