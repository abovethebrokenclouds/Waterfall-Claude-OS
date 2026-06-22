# Audio Interface Integration

RTA Insight Pro captures audio through the browser's `MediaDevices` API, so it
works with whatever input the operating system exposes — the built-in mic, a USB
audio interface, a class-compliant measurement mic, or (where supported) a
network / WebRTC source. This document covers supported device types, how the
app gets **honest** samples, sample-rate negotiation, and troubleshooting.

A scanner enforces the measurement-grade capture rules:

```bash
bash .claude/skills/audio-device-integration/scan-audio-io.sh
```

---

## Measurement-grade capture (why this matters)

A measurement mic must receive the **unaltered** signal. By default browsers turn
on voice-call processing, which silently corrupts every reading. RTA Insight Pro
always requests capture with that processing **off**:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: selectedId ? { exact: selectedId } : undefined,
    autoGainControl: false,    // AGC rides level → SPL/Leq become meaningless
    echoCancellation: false,   // AEC adds nonlinear processing
    noiseSuppression: false,   // NS gates and colors the spectrum
    channelCount: 2,           // dual-channel transfer function needs 2 inputs
    sampleRate: 48000,         // a hint — verify what you actually got
  },
});
```

All three of `autoGainControl`, `echoCancellation`, and `noiseSuppression` must
be `false`. Omitting any of them lets the browser default it to `true`, which is
a measurement-accuracy bug — the scanner flags a `getUserMedia` audio request
that does not explicitly disable all three.

---

## Supported device types

### Built-in microphone (phone / laptop)

The default input. Fine for relative measurements (spectrum shape, transfer
function, RT60). For **absolute SPL** it needs a calibration offset, because the
built-in mic's sensitivity and the device's input gain are unknown until
calibrated.

```
[ phone / laptop built-in mic ] ──(OS audio input)──▶ getUserMedia ──▶ analyzer
```

### USB audio interface

Focusrite, MOTU, and similar interfaces appear as ordinary `audioinput` devices.
A measurement mic plugs into the interface; the interface provides phantom power
and gain.

```
[ measurement mic ] ──XLR──▶ [ USB audio interface ] ──USB──▶ [ device ] ──▶ analyzer
                              (phantom power + gain)
```

Many interfaces expose their inputs as **separate devices or separate channels** —
surface that in the `DevicePicker` so the user picks the right input, and (for
the transfer function) an interface with **two input channels** for reference +
measurement.

### Class-compliant devices (e.g. UMIK-class USB mics)

Class-compliant USB mics need no driver and appear directly as an `audioinput`.
Their published sensitivity / calibration file can seed the calibration offset
(calibration-file import is on the roadmap; until then, set the offset manually).

```
[ class-compliant USB mic ] ──USB──▶ [ device ] ──▶ analyzer
```

### Network / WebRTC audio

Where the platform exposes a remote or virtual audio track (a WebRTC stream, a
virtual/aggregate device the OS presents as an input), it is captured the same
way — as a `MediaStream`. Latency and the unknown processing chain make this
better suited to **relative** spectrum work than to precise SPL or phase-critical
transfer measurements.

```
[ remote/virtual source ] ──WebRTC / virtual device──▶ MediaStream ──▶ analyzer
```

---

## Device enumeration & hot-plug

- Devices are listed with `navigator.mediaDevices.enumerateDevices()`, filtered
  to `kind === 'audioinput'`.
- **Labels are empty until permission is granted.** The app gets a stream first
  (or re-enumerates after `getUserMedia` resolves) so the picker shows real
  device names, not blank entries.
- The app subscribes to `devicechange` to refresh the list when an interface is
  plugged or unplugged, and re-resolves the persisted device choice on hot-plug —
  the default device is **not** assumed to be the measurement mic.

---

## Sample-rate negotiation

The `sampleRate` you request is only a **hint**. What matters is the rate you
actually got, because all the DSP math depends on it.

1. Request a preferred rate (the app targets **48 kHz**).
2. Read the **actual** negotiated rate back from `AudioContext.sampleRate` (or
   the track settings) after the stream resolves.
3. Feed that actual rate into the DSP layer — bin frequency (`df = fs / N`),
   octave band edges, and the weighting curves all use it. Using the requested
   rate when the hardware delivered a different one shifts every frequency
   reading.

If the requested rate is not available, the app uses what the device provides and
shows it. A common path:

```
request 48 kHz ─▶ device offers 44.1 kHz ─▶ AudioContext.sampleRate = 44100
                                            ─▶ DSP uses 44100 ─▶ readings correct
```

---

## Graceful fallbacks

The capture flow never leaves a dead spinner:

- **Permission denied / dismissed** (`NotAllowedError`): show a recovery UI
  explaining how to re-grant microphone access, with a retry.
- **No input device** (`NotFoundError`) or an **empty device list**: show an
  explicit "connect an input device" state, not a silent failure.
- **Device removed / context interrupted** (`NotReadableError`, a backgrounded
  tab, an unplugged interface): detect the context `statechange` / track `ended`
  event and offer to resume or re-select.

---

## Troubleshooting

| Symptom | Likely cause | What the app says / do |
|---------|--------------|------------------------|
| The interface doesn't appear, or drops out | Bus-powered interface under-powered through a passive hub or phone adapter | **"This device requires a powered USB hub."** Connect the interface through a powered hub or directly to a port that supplies enough current. |
| Every frequency reads slightly shifted | DSP is using the requested rate, not the negotiated one | **"Sample rate mismatch; switching to 48 kHz."** The app re-reads `AudioContext.sampleRate` and recomputes the frequency axis. |
| SPL / Leq jumps around or won't settle | Browser AGC is on (processing not disabled) | Re-grant with AGC/AEC/NS off; the app requests all three `false` — if a profile forces them on, recapture. |
| Spectrum looks gated or unnaturally clean | Noise suppression coloring the signal | Same as above — disable noise suppression; recapture. |
| Transfer function won't run | Only one input channel available | Select a 2-input interface (or the correct dual-channel device); the transfer function needs reference + measurement. |
| Device names are blank in the picker | Permission not yet granted | Grant microphone permission once; labels populate after a stream is obtained. |
| Absolute SPL is off by a fixed amount | Calibration offset not set for this mic/gain | Set the calibration offset from a known reference level (a calibration assistant is on the roadmap). |
| No capture starts on `/app` | `AudioContext` needs a user gesture / insecure context | Tap "Start"; ensure the page is served over `https://` or `localhost`. |
| Capture stops when you switch apps | Tab backgrounded, context suspended | Return to the tab; the app detects the state change and offers to resume. |

---

## SSR safety

`window`, `navigator`, `AudioContext`, and `MediaDevices` do not exist during
server rendering. The app never touches them at module scope — the `AudioContext`
is created **lazily inside a user gesture** behind a `typeof window` guard, and
all enumeration/capture lives inside effects or event handlers. See
[architecture.md](architecture.md) for the SSR + Web Audio constraints. The
`scan-audio-io.sh` scanner flags top-level `new AudioContext()` and unguarded
`navigator.mediaDevices` access as an SSR hazard.
