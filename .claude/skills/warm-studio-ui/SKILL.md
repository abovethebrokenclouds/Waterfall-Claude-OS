---
name: warm-studio-ui
description: >-
  Define and enforce the "warm studio" design system for RTAI — a warm
  violet-tinted dark palette (ink #0C0A12, panel #16121C, amber #F6A623, rose
  #FF6B8A, violet #A855F7, teal #2DD4BF), gradient hero text (amber→rose→violet),
  subtle film grain, soft glows, monospace numeric readouts, a mobile-first
  bottom-nav layout, and accessibility (prefers-reduced-motion, sufficient
  contrast). The central rule it enforces: NO tech/neon green — the analyzer must
  read as a warm boutique studio tool, never a clinical neon-green meter. Use when
  building or reviewing UI, theming, the Tailwind config, color tokens, charts/
  meters, the spectrum/SPL readouts, or layout for the audio analyzer, or whenever
  a green hex or `green-400`-style utility creeps into the frontend. Ships a
  `scan-palette.sh` scanner that greps the frontend for forbidden neon-green hex
  codes and `green-(300|400|500|600)` Tailwind classes, printing offenders and
  exiting non-zero.
---

# Warm Studio UI

The visual identity of RTAI. It should feel like a **warm boutique
studio tool** — violet-tinted dark, amber/rose accents, soft glow, film grain —
not a clinical lab instrument. The single hard rule: **no tech/neon green.**

## How to run

```bash
bash .claude/skills/warm-studio-ui/scan-palette.sh
```

It greps `audio-analyzer/frontend/src` and `audio-analyzer/frontend/tailwind.config.ts`
(if present) for forbidden neon-green hex codes and `green-(300|400|500|600)`
Tailwind utilities, prints any offenders, and exits non-zero on a hit (safe as a
CI gate). It no-ops cleanly (exit 0) when the frontend dir is absent.

## The palette (tokens)

| Token | Hex | Use |
|-------|-----|-----|
| ink | `#0C0A12` | app background (warm near-black, violet-tinted) |
| panel | `#16121C` | cards, surfaces, the nav bar |
| amber | `#F6A623` | primary accent, key readouts, CTAs |
| rose | `#FF6B8A` | secondary accent, alerts/peaks, gradient mid |
| violet | `#A855F7` | tertiary accent, gradient end, active state |
| teal | `#2DD4BF` | sparingly — coherence/"good" state, NOT a green substitute |

- **Backgrounds** stay warm and dark; never pure `#000` and never cool/blue-gray.
- **Accents** come from amber/rose/violet; teal is the only cool color and is
  used deliberately and sparingly (e.g. high-coherence indication).

## Signature treatments

- **Gradient hero text:** headline runs **amber → rose → violet**
  (`background-clip: text`); reuse one shared gradient token, don't re-tune it
  per component.
- **Film grain:** a subtle tiled-noise overlay at low opacity over `ink` for
  warmth/texture — keep it under the content and non-interactive.
- **Soft glows:** accent elements (active meter, focused control) get a low-
  opacity colored box-shadow/blur in their accent hue — soft, not laser.
- **Mono numeric readouts:** all measured numbers (dB, Hz, RT60, %, coherence)
  render in a **monospace** face with tabular figures so they don't jitter as
  values change.

## Layout

- **Mobile-first**, with a **bottom nav bar** (panel surface) as the primary
  navigation on small screens — thumb-reachable. Scale up to a side/top layout on
  larger viewports, but design the small screen first.
- Charts/meters sit on `panel` over the `ink`/grain background; gridlines are
  low-contrast warm gray, accents in palette hues.

## The central rule: NO neon green

The analyzer must never read as a clinical neon-green meter. Forbidden:

- **Hex:** `#00FF00`, `#39FF14`, `#00E676`, `#00FFAB`, `#00FF7F` (and any case
  variant) — and neon/lime greens generally.
- **Tailwind:** `green-300`, `green-400`, `green-500`, `green-600` utility
  classes (and `bg-/text-/border-/ring-/from-/to-/via-green-*` of those shades).
- For a "good/pass/healthy" state, use **teal `#2DD4BF`** or amber — never green.

The scanner enforces exactly these. If you need a positive-state color, reach for
teal or amber from the palette, never a green token.

## Accessibility

- Honor **`prefers-reduced-motion`**: disable grain animation, glow pulses, and
  meter-transition motion when set.
- **Contrast:** body text and numeric readouts must meet WCAG AA against `ink`/
  `panel`; amber/rose on dark generally pass, but verify small text. Don't rely on
  color alone to convey peak/clip/coherence state — pair with a label or icon.
- Focus states use a visible violet/amber ring, not a removed outline.

## Quality bar
- Palette tokens are defined once (Tailwind theme / CSS vars) and reused; no
  ad-hoc hex in components.
- Zero neon-green hex and zero `green-(300|400|500|600)` utilities — the scanner
  must pass.
- All measured numbers are monospace; the layout works thumb-first on mobile.
- `prefers-reduced-motion` and AA contrast are respected.
