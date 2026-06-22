# 🎚️ RTAi — Lovable Master Prompt
### A pro-grade, real-time audio analyzer (RTA) web app — built from the Universal Lovable Master Prompt template.

> **How to use:** Paste this entire file into Lovable. It already contains a complete `APP BRIEF` for **RTAi**, so Lovable will plan and then build the app in intelligent, quality-gated phases. Edit the brief only if you want to change scope.

---

## ✍️ APP BRIEF

> **What I want:** **RTAi** — a real-time audio analyzer that turns any device's microphone or audio interface into a professional acoustic measurement suite. It shows a live FFT/RTA spectrum, fractional-octave bands, an SPL meter (A/C/Z weighting), reverberation time (RT60), and a dual-channel transfer function with coherence — all computed **locally in the browser** with measurement-grade accuracy. Used by live-sound engineers, studio/room tuners, AV installers, and acoustics enthusiasts to measure, compare, and tune rooms and systems.
>
> - **Target users:** live-sound & FOH engineers, recording/mix engineers, AV integrators, acousticians, AV/hi-fi enthusiasts.
> - **Must-have features:** live RTA spectrum, fractional-octave smoothing, SPL/Leq meter with weighting & time constants, RT60, dual-channel transfer function + coherence, spectrogram/waterfall, mic calibration, measurement capture/compare/export, audio-interface selection.
> - **Tone/brand vibe:** warm boutique studio tool — premium, focused, tactile. **Not** a clinical neon-green lab meter.
> - **Avoid:** tech/neon green anywhere; inaccurate "pretty but wrong" meters; anything requiring a server round-trip to measure.

Infer sensible defaults for anything unstated, state assumptions briefly, then build.

---

## 0. HOW TO OPERATE (read first)

You are an expert full-stack audio/DSP product engineer and designer. Build RTAi to a production-quality bar using the stack, design system, DSP correctness rules, and phased process below.

**Core principles:**
1. **Plan, then build in phases.** Produce a short build plan, then implement phase by phase (Section 5), verifying the preview after each.
2. **Ship something runnable at every phase.** The analyzer should load and measure *something* as early as possible, then get richer.
3. **Correctness over prettiness (non-negotiable for DSP).** A spectrum that reads 3 dB high is worse than no meter. Get the math right first, style second.
4. **Local-first.** All measurement runs in-browser via the Web Audio API / AudioWorklet. No audio ever leaves the device; no server round-trip to measure. Works offline (PWA).
5. **Graceful degradation.** Handle denied mic permission, no input devices, and unsupported browsers with clear, friendly states — never a blank crash.
6. **Modular & extensible.** Keep pure DSP math separate from Web Audio I/O and from UI, so each is independently testable and replaceable.
7. **One install, one run.** Boots with the standard install/dev commands; ships demo/sample measurement data so it looks alive before the mic is even granted.

---

## 1. TECH STACK (use this exact, Lovable-native stack)

- **React + Vite + TypeScript** (Lovable's native runtime).
- **Tailwind CSS + shadcn/ui** for all UI.
- **Web Audio API + AudioWorklet** for real-time capture and block processing (off the main thread where possible).
- **Lovable Cloud (Supabase)** for accounts, saved measurements, calibration profiles, and exports — optional; the analyzer must fully work **without** an account (local-only mode), and sign-in just syncs/saves.
- **Lovable AI** as the built-in gateway for any AI features (e.g. "explain this room response"); always available, no external key.
- **TanStack Query** for data; **React Router** for routing.
- **Zod** for validating all settings/inputs and any imported data.
- **lucide-react** icons; render meters/charts with **canvas/WebGL** for real-time performance (Recharts only for non-realtime/report charts); **Framer Motion** for non-measurement UI motion.

**Rules:** type-safe end to end; **SSR-safe** (guard `window`, `navigator`, `AudioContext` so they never run at module scope); enable **RLS** on every Supabase table (owner-scoped) and never expose user data via the anon key; centralize config; no required third-party keys for the core experience.

---

## 2. DESIGN SYSTEM — "Warm Studio" (apply throughout)

Make RTAi feel like a **warm boutique studio tool** — violet-tinted dark, amber/rose accents, soft glow, subtle film grain. **The hard rule: NO tech/neon green anywhere.**

**Typography — sans-serif / Arial family (required):**
- Body/UI (`--font-sans`): `"Denali", "Inter", "Helvetica Neue", Arial, "Liberation Sans", system-ui, sans-serif` (load **Inter** via Google Fonts as the Arial-adjacent default; Denali first where available, Arial guaranteed fallback).
- Display/headings: same family, 600–800, tight tracking (`-0.02em`).
- **Numeric/measured readouts (`--font-mono`): a monospace face with _tabular figures_** so dB / Hz / RT60 / % values don't jitter as they update. This is required for every measured number.

**Color tokens (define once as HSL CSS vars + Tailwind theme; never ad-hoc hex in components):**

| Token | Hex | Use |
|-------|-----|-----|
| `ink` (background) | `#0C0A12` | app background — warm near-black, violet-tinted (never pure `#000`, never blue-gray) |
| `panel` (card/surface/nav) | `#16121C` | cards, meters, nav bar |
| `amber` (primary) | `#F6A623` | primary accent, key readouts, **primary CTAs** |
| `rose` (secondary) | `#FF6B8A` | secondary accent, peaks/alerts, gradient mid |
| `violet` (tertiary) | `#A855F7` | active state, gradient end, focus ring |
| `teal` | `#2DD4BF` | sparingly — coherence/"good/pass" state; **NOT** a green substitute |

- **Brand gradient** (`--gradient-brand`): **amber → rose → violet** — one shared token, reused everywhere.
- **Gradient text required** on the landing hero headline and key section titles via a reusable `GradientText` component + `.text-gradient` utility (animated background-position shift, disabled under `prefers-reduced-motion`).
- **Signature treatments:** subtle tiled **film-grain** noise overlay over `ink` (low opacity, non-interactive, behind content); **soft glows** on active meters/focused controls (low-opacity colored box-shadow in the accent hue — soft, not laser); low-contrast warm-gray gridlines on charts.

**The central rule — NO neon green.** Forbidden hex: `#00FF00`, `#39FF14`, `#00E676`, `#00FFAB`, `#00FF7F` (any case) and neon/lime greens generally. Forbidden Tailwind: `green-300/400/500/600` (and `bg-/text-/border-/ring-/from-/to-/via-` variants). For any "good / pass / healthy / high-coherence" state use **teal or amber**, never green.

**Theming & a11y:** dark by default (this is the studio look); WCAG 2.1 AA contrast for all text and numeric readouts against `ink`/`panel`; **never rely on color alone** for peak/clip/coherence — pair with a label or icon; visible violet/amber focus ring (never removed outline); honor **`prefers-reduced-motion`** (disable grain animation, glow pulses, and meter-transition motion).

---

## 3. BRANDING — logo, favicon, navicon (auto-generate)

Generate a consistent brand set for **RTAi**:
- **Logo:** an abstract mark evoking a spectrum/cascade — e.g. ascending bars or a stylized waveform — filled with the **amber→rose→violet** `--gradient-brand`, readable at 16px. Provide `logo-mark.svg`, `logo-full.svg` (mark + "RTAi" wordmark in the display font), and light/dark variants.
- **Favicon:** `favicon.svg` (gradient mark on transparent), `apple-touch-icon` (180×180), and a `site.webmanifest` (warm theme color `#0C0A12`, maskable 192/512 icons) — also enabling **PWA install**.
- **Navicon:** an in-app `<BrandMark />` (mark + wordmark) that collapses to mark-only on small screens / collapsed nav.
- **Wire-up:** favicon + manifest + `<meta name="theme-color" content="#0C0A12">` + Open Graph / Twitter card meta (gradient social-preview image).
- Store assets in `src/assets/brand/` and expose `brand.ts` (name, palette, gradient) so styling stays consistent and restyleable in one place.

---

## 4. CORE FEATURES (build all of these — this is what makes RTAi pro-level)

### 4.1 Live analyzer surface (the heart of the app)
A real-time, full-screen **Analyzer** view with switchable measurement modules, a persistent transport bar (Run / Pause / Hold / Capture), and the active device + calibration shown at all times. Mobile-first with a **bottom nav bar** for module switching; scale to a side/top layout on larger viewports.

### 4.2 Measurement modules (DSP must be correct — see Section 4.7)
- **RTA Spectrum:** live FFT magnitude, selectable FFT size (1024–32768), **Hann / Blackman-Harris** windowing, 50–75% overlap, averaging (exponential + linear/infinite), peak-hold, log-frequency axis.
- **Fractional-octave bands:** 1/1, 1/3, 1/6, 1/12, 1/24 octave, ANSI S1.11-style geometric bands anchored to 1 kHz; smooth **power** then convert to dB.
- **SPL / Leq meter:** large numeric readout with **A / C / Z weighting**, **Fast (125 ms) / Slow (1 s) / Impulse** time weighting, **Leq** over a selectable interval, plus L10/L50/L90 percentiles and a level history strip. Requires calibration (4.3).
- **RT60 / reverberation:** Schroeder backward-integration of the impulse response, IR noise-floor truncation (Lundeby), **T20 / T30 / EDT** fits per octave/third-octave band, with a per-band non-linearity/quality flag and the decay curve plotted.
- **Dual-channel transfer function:** `H = Sxy/Sxx` averaged over blocks, **magnitude (dB) + unwrapped phase**, **coherence** `γ²` with a coherence **gate** (default ≥ 0.9) that grays out untrusted bins; automatic inter-channel **delay finder** (cross-correlation) before computing H. (For systems with a reference/loopback input.)
- **Spectrogram / waterfall:** scrolling time-frequency view (canvas/WebGL), warm-palette intensity map (never green).

### 4.3 Calibration workflow
A guided **calibration** flow: capture a known reference (94 dB / 1 kHz pistonphone or a 1 kHz cal tone) to compute the **dBFS → dB SPL offset**; store per-device **calibration profiles** (mic sensitivity, interface gain). Never hardcode the offset. Show calibration status (calibrated / uncalibrated / stale) prominently; uncalibrated SPL is labeled "relative."

### 4.4 Device & input handling (measurement-grade)
- Enumerate inputs (`navigator.mediaDevices.enumerateDevices`) with a device picker (built-in mic, USB/class-compliant interfaces, multi-channel).
- `getUserMedia` with measurement-critical processing **DISABLED**: `autoGainControl:false`, `echoCancellation:false`, `noiseSuppression:false` (the browser "helpfully" gain-riding the mic is a measurement bug).
- Negotiate and display the actual **sample rate**; handle channel selection for dual-channel mode.
- Robust **permission-denied** and **empty-device-list** fallbacks with clear guidance. All `AudioContext`/`navigator` access SSR-guarded (never at module scope).

### 4.5 Capture, compare & library
- **Capture** a snapshot of the current measurement (spectrum/bands/SPL/RT60/TF) with metadata (device, calibration, room/notes, timestamp).
- **Overlay & A/B compare** multiple captures on one graph; show deltas.
- **Measurement library** (local IndexedDB by default; synced to Lovable Cloud when signed in) with search, tags, and projects/rooms.

### 4.6 Export & reporting
- Export data as **CSV** (raw bands/values), **PNG** (chart), and a polished **PDF report** (logo, room/system metadata, charts, key numbers).
- Optional **AI summary** (via Lovable AI gateway): plain-language interpretation of a room response / RT60 result with suggested next steps — clearly marked as guidance, gated behind a clean "not configured" state if unavailable.

### 4.7 DSP architecture & correctness rules (build to these)
Keep DSP as **pure, deterministic, headless-testable** functions in `src/lib/dsp/` — **no Web Audio globals inside the math**. Web Audio I/O lives in a separate capture layer; UI consumes typed results.
- Modules: `fft.ts`, `octave.ts`, `weighting.ts`, `spl.ts`, `rt60.ts`, `transfer.ts` — each with a `*.test.ts` pinning numeric ground truth (A-weighting at 1 kHz = 0 dB; a synthetic 1 kHz sine reads the expected SPL; a known exponential decay returns the expected RT60).
- Apply **window gain corrections** (coherent gain for tones, ENBW for broadband) — don't mix them up. One-sided spectrum doubles all bins except DC/Nyquist. Apply frequency weighting **before** Leq integration. Document every calibration offset and which standard (IEC 61672, ANSI S1.11) each routine implements.
- Run heavy processing in an **AudioWorklet/Web Worker** to keep the UI at 60fps.

### 4.8 App-wide pro features
- **Presets / scenes:** Live Sound, Studio/Room Tuning, Noise Survey, Hi-Fi — each sets sensible module defaults.
- **Command palette (⌘K)** and keyboard shortcuts for transport and module switching.
- **PWA / offline:** installable, fully functional without network (local DSP).
- **Settings:** theme/contrast, units, default FFT/averaging, coherence threshold, calibration profiles, data management/export.
- **Auth (optional):** Lovable Cloud email/password; signing in syncs the measurement library and calibration profiles across devices (RLS-protected). Local-only mode never requires an account.

---

## 5. THE BUILD PROCESS — phased & quality-gated

After each phase, confirm the preview compiles and runs before continuing.

1. **Plan.** Restate RTAi in 2–3 lines, list screens (Landing, Analyzer, Library, Calibration, Settings), data models, and the phase plan. State assumptions.
2. **Foundation.** Scaffold; install Warm-Studio Tailwind tokens + film-grain + glow utilities (Section 2), typography (mono tabular numerics), shadcn/ui, theme provider, `GradientText`, `BrandMark`, and the full brand/logo/favicon/PWA set (Section 3).
3. **Public surface.** Landing page (Section 6) — responsive, animated, accessible, with the CTAs in Section 7.
4. **DSP core.** Implement and **unit-test** the `src/lib/dsp/` modules headless (Section 4.7) before wiring any UI — correctness first.
5. **Capture layer.** Web Audio / AudioWorklet capture, device enumeration, measurement-grade `getUserMedia` constraints, permission/empty-device fallbacks (Section 4.4), SSR-safe.
6. **Analyzer UI.** Wire RTA spectrum → octave bands → SPL meter → spectrogram → RT60 → transfer function, each fully wired with loading/empty/error/permission states and live readouts.
7. **Calibration, library, export, presets, settings, optional auth** (Sections 4.3, 4.5, 4.6, 4.8).
8. **Polish pass.** Empty/loading/error/permission states everywhere; accessibility audit (WCAG 2.1 AA, reduced-motion, no color-only signaling); **palette audit (zero neon green)**; mobile thumb-first pass; demo/sample measurements seeded.

---

## 6. LANDING PAGE

A premium, conversion-focused landing page at `/`:
- **Sticky glass navbar:** `<BrandMark />`, anchor links (Features, Measurements, How it works), theme toggle, and the primary CTA.
- **Hero:** large **amber→rose→violet gradient-text** headline (e.g. "Measure your room like a pro — in your browser"), subhead emphasizing local/private + measurement-grade, dual CTAs, and an animated (reduced-motion-aware) live-spectrum mockup with soft glow + grain.
- **Trust strip:** "Runs 100% in your browser · No audio leaves your device · Works offline · No account required" pills.
- **Feature bento grid:** RTA Spectrum, Octave Bands, SPL/Leq, RT60, Transfer Function + Coherence, Spectrogram — icon + one-liner each.
- **How it works:** 3 steps — "Pick your input → Calibrate → Measure & compare" with gradient step numbers.
- **CTA band:** full-width amber→rose→violet gradient panel with the final call to action.
- **Footer:** brand, nav, `support@waterfalltechnologies.net`, license note, "Built local-first" badge. Include OG/social meta.

---

## 7. CTAs (use these exact, app-relevant calls to action)

**Primary (amber, prominent):**
- **"Launch Analyzer"** — hero + navbar + CTA band → opens the live Analyzer (requests mic on first use).
- **"Start Measuring"** — alternate hero CTA for the same action.

**Secondary / contextual (inside the app):**
- **"Calibrate Mic"** — opens the calibration flow (shown whenever SPL is uncalibrated).
- **"Capture Snapshot"** — saves the current measurement to the library.
- **"Compare / Overlay"** — add another capture to the graph.
- **"Measure RT60"** — start a reverberation measurement.
- **"Run Transfer Function"** — enter dual-channel mode.
- **"Connect Audio Interface"** — open the device picker.
- **"Export Report"** (PDF) / **"Export CSV"** / **"Save PNG"** — from any measurement or capture.
- **"Explain this result"** — optional AI summary (Lovable AI), shown only when available.

**Landing secondary:** **"See it live"** (scrolls to the animated demo) and **"Install app"** (PWA) when installable.

---

## 8. DATA MODELS (when signed in; local IndexedDB mirrors these offline)

- `User` (Lovable Cloud auth + `profiles`)
- `CalibrationProfile` (device id/label, dBFS→SPL offset, mic sensitivity, interface gain, created/updated)
- `Project` / `Room` (name, notes, optional dimensions)
- `Measurement` (type: spectrum | bands | spl | rt60 | transfer; settings snapshot; device + calibration ref; result payload; tags; timestamps)
- `Export` (optional record of generated reports)

Every table: **RLS enabled, owner-scoped**, `created_at`/`updated_at`, typed accessor, migration + **seed/sample measurements** so the library looks populated on first run. Local-only mode stores the same shapes in IndexedDB and never requires an account.

---

## 9. DEFINITION OF DONE

- ✅ Boots with standard install/dev commands; sample measurements seeded; **no account or external key required** to measure.
- ✅ All measurement modules work in real time and are **numerically correct** — DSP unit tests (A-weighting, SPL, RT60 anchors) pass.
- ✅ `getUserMedia` uses measurement-grade constraints (AGC/echo/noise **off**); device picker, permission-denied, and empty-device states all handled; SSR-safe.
- ✅ Warm-Studio design system applied: amber→rose→violet gradient + **gradient text**, film grain, soft glow, **monospace tabular numeric readouts**, mobile-first bottom nav.
- ✅ **Zero neon green** (no forbidden hex, no `green-300/400/500/600` utilities) — palette audit clean.
- ✅ Generated **RTAi logo set, favicon, navicon, PWA manifest, OG meta**, all wired; installable + offline.
- ✅ Arial-family / Denali-style sans-serif typography throughout.
- ✅ Calibration, capture/compare, library, and export (CSV/PNG/PDF) all functional; optional auth syncs library with RLS protection.
- ✅ WCAG 2.1 AA: labels, focus, contrast, keyboard, `prefers-reduced-motion`; no color-only signaling.
- ✅ DSP math is pure/headless/testable and separated from Web Audio I/O and UI; modular feature-folder structure ready to extend.

---

### Notes for Lovable
- **Correctness first** for anything that produces a number; style it only after the math is verified against a known anchor.
- Keep **pure DSP** out of the Web Audio layer and the Web Audio layer out of the UI — three clean seams.
- Prefer **HSL design tokens + semantic Tailwind classes**; define the warm palette and the amber→rose→violet gradient once and reuse.
- Run heavy DSP in an **AudioWorklet/Worker**; render real-time meters on canvas/WebGL for 60fps.
- When the brief is ambiguous, choose the conventional acoustics-tool solution, note the assumption, and keep moving.
- Support contact for user-facing help copy: `support@waterfalltechnologies.net`.
