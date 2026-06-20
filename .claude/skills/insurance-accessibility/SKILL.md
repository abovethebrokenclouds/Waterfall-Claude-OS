---
name: insurance-accessibility
description: >-
  Make insurance web/app flows WCAG 2.1 AA conformant — the regulatory bar for
  insurance (HHS rule; thousands of accessibility lawsuits filed in 2024).
  Covers form labels, focus order, color contrast, alt text, language
  declaration, keyboard operability, and prefers-reduced-motion, with a static
  scanner. Use when building or reviewing any quote/claims/policy flow, before a
  release, or whenever asked to check accessibility / a11y / WCAG / ADA
  compliance.
---

# Insurance Accessibility (WCAG 2.1 AA)

A shared Waterfall Claude OS skill. For insurance, accessibility is not polish —
it's regulatory. The HHS web accessibility rule mandates **WCAG 2.1 AA** for
covered web content and mobile apps (compliance deadlines through 2026–2027),
and 4,000+ web accessibility lawsuits were filed in 2024. Build conformance in
at the wireframe stage; retrofitting after launch is where the risk and cost
live.

## The four WCAG pillars (POUR)

- **Perceivable** — text alternatives for images, sufficient color contrast,
  content not conveyed by color alone, captions for video.
- **Operable** — everything reachable and usable by keyboard; visible focus;
  no keyboard traps; respect `prefers-reduced-motion`.
- **Understandable** — labeled inputs, plain language, predictable navigation,
  inline errors that say how to fix the problem.
- **Robust** — valid semantic HTML / ARIA so assistive tech can parse it; a
  declared page `lang`.

## Run the scanner

```bash
bash .claude/skills/insurance-accessibility/a11y-scan.sh
```

Static, git-root-relative, no-ops cleanly without `src/`. It flags the
machine-detectable WCAG failures — they're the floor, not the ceiling:

| Check | WCAG | Why it matters in insurance |
|-------|------|------------------------------|
| `<img>` without `alt` | 1.1.1 | Policy docs, ID cards, claim photos must have text alternatives |
| Inputs without an associated `<label>`/`aria-label` | 1.3.1 / 4.1.2 | Quote & claims forms are the core of the product |
| `<html>` without `lang` | 3.1.1 | Screen readers need the language to pronounce policy terms |
| Click handler on a non-interactive element with no keyboard handler/role | 2.1.1 | Keyboard users must operate every control |
| Animation without a `prefers-reduced-motion` guard | 2.3.3 | Motion can trigger vestibular issues; pairs with `gui-animation` |
| Positive `tabindex` | 2.4.3 | Breaks natural focus order in multi-step flows |

## What the scanner can't see (manual follow-ups)

- **Color contrast ratios** — verify 4.5:1 (text) / 3:1 (large text & UI) with a
  contrast tool or axe DevTools; hardcoded hex can't be judged statically.
- **Focus order & visible focus** — tab through each quote/claims step.
- **Screen-reader pass** — VoiceOver/NVDA on the critical funnels.
- **Error recovery** — confirm inline errors name the field and how to fix it.
- Run an automated engine (axe-core / Lighthouse) in CI alongside this.

## Checklist

- [ ] Every input has a programmatic label; errors are announced + descriptive
- [ ] Contrast ≥ 4.5:1 text / 3:1 large text & UI components
- [ ] Full keyboard operability; logical focus order; visible focus ring
- [ ] All meaningful images have `alt`; decorative images `alt=""`
- [ ] `<html lang>` set; semantic landmarks/headings
- [ ] `prefers-reduced-motion` honored for all animation (see `gui-animation`)
- [ ] Automated a11y check (axe/Lighthouse) wired into CI

This skill is the accessibility gate referenced by `insurance-quote-flow` and
`insurance-claims-ux`.
