---
name: gui-animation
description: >-
  Choose and implement GUI animation for fintech/insurance web apps — Motion
  (Framer Motion) for React UI transitions, GSAP for complex/performance-
  critical timelines and scroll, Lottie for micro-interactions and loading
  states, with trust-building motion principles and accessibility
  (prefers-reduced-motion). Use when adding animation, micro-interactions, loading
  states, or transitions, or when picking an animation library for a dashboard,
  quote wizard, or claims flow.
---

# GUI Animation

A shared Waterfall Claude OS skill for motion in trust-sensitive products. In
insurance/fintech, animation is UX infrastructure, not decoration: it confirms
the system heard you, communicates status, and signals reliability on
high-stakes actions. Subtle motion correlates with measurable lift (Adobe 2024:
~12% CTR uplift), and micro-interactions are becoming table stakes (Gartner:
~75% of customer-facing apps by end of 2025). The job is the right library for
the job — and never at the cost of accessibility or performance.

## Library selection (pick by job, not by hype)

| Job | Use | Why |
|-----|-----|-----|
| React component transitions, layout/exit animations, gestures (hover/tap/drag), claim & quote step transitions | **Motion (Framer Motion)** | Declarative React API, `AnimatePresence`, `layout`; the default for UI-level motion |
| Complex timelines, scroll-triggered sequences, SVG morphing, 50+ concurrently animated elements | **GSAP** | Best performance under heavy/precise sequencing (~78KB); ScrollTrigger |
| Micro-interactions, loading/empty states, animated icons, success checkmarks | **Lottie (dotLottie)** | Reusable, ~600% lighter than GIF; designer-authored in After Effects |
| Natural physics-y motion (pull-to-refresh, springy lists) | **React Spring** | Physics-based; avoid for definitive end-states like a payment-confirmed tick (animations approach asymptotically) |

**Industry-standard hybrid:** Motion for component-level transitions + GSAP for
complex timelines. Don't add a second engine until a real timeline/scroll need
appears — bundle cost is real on a dashboard.

## Motion principles for insurance trust

1. **Confirm, don't decorate.** Every state-changing action (quote saved,
   payment sent, claim filed) gets immediate, unmistakable feedback.
2. **Communicate system status.** Loading, processing, success, and error each
   have a distinct, honest motion — never fake progress.
3. **Restraint on money screens.** Precise, short, definitive motion for
   transactions; save character-driven/playful motion for education content.
4. **Performance budget.** Animate `transform`/`opacity` (GPU-friendly), not
   layout properties; lazy-load Lottie JSON; cap concurrent animations on
   dashboards; prefer dotLottie and strip unused layers/masks.

## Run the audit

```bash
bash .claude/skills/gui-animation/motion-audit.sh
```

Static, git-root-relative, no-ops cleanly without `src/`. It reports which
animation libraries are in `package.json`, flags a **missing
`prefers-reduced-motion`/`useReducedMotion` guard** (accessibility — exits
non-zero), warns on heavy `.gif` assets that should be Lottie, and on layout-
property CSS transitions that should be `transform`.

## Checklist

- [ ] Library matches the job (Motion = UI, GSAP = timelines/scroll, Lottie = micro/loaders)
- [ ] One UI animation engine unless a real timeline/scroll need justifies GSAP
- [ ] State changes have immediate, honest feedback; no fake progress
- [ ] Animate transform/opacity; Lottie lazy-loaded; concurrent count capped
- [ ] `prefers-reduced-motion` honored everywhere (WCAG 2.3.3 — see `insurance-accessibility`)
- [ ] Heavy GIFs replaced with Lottie/dotLottie

## Platform contract

Any AI-driven or generated motion content still follows the platform rules — no
hardcoded model strings in app code; AI calls route through the Super Agent.
See `waterfall-os`.
