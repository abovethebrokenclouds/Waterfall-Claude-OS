# Mobile Optimization

RTAI is built to run a real-time DSP loop on a **phone**, in a dim
room, possibly for a whole soundcheck, without draining the battery or dropping
frames. This document covers the performance strategies, the FFT-size tradeoff,
battery considerations, Performance Mode, and offline / PWA behavior.

---

## Performance strategies

The acquisition loop is the hot path — it runs once per displayed frame. The
design keeps each frame cheap:

- **`requestAnimationFrame`, not timers.** Driving off rAF caps the loop at the
  display refresh and **suspends automatically when the tab is hidden**, so a
  backgrounded analyzer stops doing work.
- **Pre-allocated, reused buffers.** The `Float32Array`/`Float64Array` buffers
  for FFT input/output are allocated once and reused every frame — no per-frame
  allocation means no garbage-collection stutter.
- **Canvas for moving traces, DOM for chrome.** The spectrum/decay traces draw to
  a `<canvas>`; only static axes and labels are DOM. Per-frame DOM work is near
  zero, which is what keeps scrolling/animation smooth on a phone.
- **Pure DSP, ready for a Worker.** Because the DSP modules are pure and
  side-effect-free (no Web Audio globals), they can move off the main thread into
  a **Web Worker** (or the capture stage into an `AudioWorklet`) so the UI thread
  only renders. This is an explicit affordance of the pure-TS DSP boundary,
  slated for the optimization pass.
- **Single audio graph.** Switching modes changes which DSP transform consumes
  the analyser buffers; it does not tear down and rebuild the `AudioContext`.

---

## FFT size tradeoffs

`fftSize` is the main cost/quality knob. Bin resolution is `df = sampleRate /
fftSize`, and the block spans `fftSize / sampleRate` seconds.

| FFT size | Bin resolution @ 48 kHz | Block length @ 48 kHz | Character |
|----------|-------------------------|-----------------------|-----------|
| 2048 | ~23.4 Hz | ~43 ms | Cheap, snappy; coarse in the low end |
| 4096 | ~11.7 Hz | ~85 ms | Good general-purpose default |
| 8192 | ~5.9 Hz | ~171 ms | Better LF detail; more cost/latency |
| 16384 | ~2.9 Hz | ~341 ms | Fine LF resolution; heaviest, slowest to update |

Guidance:

- **Low-frequency detail** (room modes, sub work) wants a **large** FFT.
- **Transient / fast response** (following dynamics, RT60 capture windows) wants
  a **smaller** FFT.
- A larger FFT is more samples to transform per frame **and** more latency before
  the display reflects a change — on a phone that shows up as both heat and lag.
- **Zero-padding** can smooth a plot but does **not** add real resolution; the
  app does not present interpolated detail as measured detail.

The default targets a phone-friendly cost (around 4096); users can raise it when
they need resolution and can afford the cost.

---

## Battery considerations

A continuous DSP + animation loop is a real power draw. Mitigations:

- **Stops when hidden.** The rAF-driven loop pauses on a backgrounded tab, and
  the app can suspend the `AudioContext` when not actively measuring.
- **Frame-rate cap.** A live spectrum does not need 120 fps; capping the redraw
  rate (e.g. to 30 fps in Performance Mode) roughly halves the per-second work
  versus 60 fps.
- **Overlays cost pixels.** The film-grain overlay and soft glows are cheap but
  not free; Performance Mode turns them off.
- **Smaller FFT, fewer bands.** Less math per frame and fewer smoothed bands to
  compute and draw.
- **Capture-then-compute modes are bursty.** RT60 is not a continuous loop — it
  records a short window and computes once — so it is inherently light.

---

## Performance Mode

**Performance Mode** is a user-facing toggle for constrained devices (older
phones, low battery, thermal throttling). When on, it:

- **Caps the frame rate** (e.g. 30 fps) for the live redraw.
- **Lowers the FFT size** to reduce per-frame math.
- **Reduces smoothing detail** (fewer bands to compute and plot).
- **Disables the film-grain and glow overlays.**
- Respects **`prefers-reduced-motion`**, which independently disables grain
  animation, glow pulses, and meter-transition motion.

It trades visual smoothness and fine resolution for **battery life and frame
stability**. Measurement correctness is unaffected — the DSP math is identical;
only the display rate, FFT size, and visual flourishes change. The mode and its
current resolution are shown so a user knows what they're looking at.

---

## Offline / PWA behavior

RTAI is **local-first** and works without a network once loaded:

- **Core measurement is fully offline.** Capture, DSP, all four modes, and local
  session storage need no server. After the app's assets are cached, the
  analyzer runs with no connection.
- **PWA install (planned).** Packaging as a Progressive Web App lets users add
  RTAI to the home screen and launch it like a native app, with a
  service worker caching the app shell so it opens instantly and offline.
- **Sessions live in `localStorage`.** They persist across reloads on-device with
  no account and no upload. See [privacy-and-data.md](privacy-and-data.md).
- **Network only for opt-in features.** The optional backend (session sync, PDF
  report generation) is the only thing that touches the network, and only when
  the user explicitly invokes it. Everything else degrades cleanly to local-only.

> **Assumption.** Service-worker caching and the installable PWA manifest are on
> the roadmap; the offline-by-design data flow (in-browser DSP, `localStorage`
> sessions) is the current behavior.
