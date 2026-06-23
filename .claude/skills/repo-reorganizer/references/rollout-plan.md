# Cross-repo Rollout Plan (cross_repo_sync_engine)

Sequencing for normalizing the Waterfall app fleet to the unified standard. The
OS home is the control plane (this work); each app is normalized **one PR at a
time**, only while in session scope.

## Scope reality

A session can read/write only the repos in its scope. This control-plane work
happens in `Waterfall-Claude-OS` (in scope). Each app below must be **added to
scope by the user** before it can be touched — the agent cannot add scope itself.

## App registry (slug ↔ repo ↔ stack)

| App | Repo | Slug | Stack / notes | Status |
|-----|------|------|---------------|--------|
| Cairo | `cairo-ai-pro` | `cairo` | TanStack/Vite, Lovable-synced | pending |
| Tech Command | `Waterfall-Tech-Command` | `tech-command` | TypeScript | pending |
| Nexus | `waterfall-nexus` | `nexus` | Lovable-Cloud, synced | pending |
| Sentry Insurance | `sentryinsurance` | `sentry-insurance` | insurance subset | pending |
| Sentry (variant) | `sentry-insurance` | `sentry-insurance` | older mirror — reconcile | pending |
| Sentry (variant) | `sentryinsurance-549065ef` | `sentry-insurance` | dup — reconcile/retire | pending |
| Verseful | `verseful` | `verseful` | TypeScript | pending |
| PhysIQ | `physiqai` | `physiq` | health subset, PHI care | pending |
| MedConnect | `health-link-engine` | `medconnect` | health subset, PHI care | pending |
| RecipeAI | `recipe-ai-26` | `recipe-ai` | TypeScript | pending |
| ResumAI | `resumaipro` | `resumai` | TypeScript | pending |
| ResumAI (old) | `ResumAI` | `resumai` | older mirror — reconcile | pending |
| Atlas AI | `atlasaipro` | `atlas-ai` | TypeScript | pending |
| Adventure AI | `adventureapp` | `adventure` | TypeScript | pending |
| Shopera | `shopera` | `shopera` | mockups — assess first | pending |
| Shopera Surface | `shoperamrkt` | `shopera-surface` | TypeScript | pending |
| RTA Insight Pro | `rtai` | `rta` | audio analyzer, warm-studio | pending |
| PixelPerfect AI | `pixelperfectaipro` | `pixelperfect` | TypeScript | pending |
| LightMA | `lightma-assistant` | `lightma` | TypeScript | pending |
| Waterfall Tech | `Waterfall-Technologies` | `waterfall-tech` | shell/UI creator | pending |
| Waterfall Tech (new) | `waterfall-technologies-5957dd83` | `waterfall-tech` | dup — reconcile | pending |
| Marketing | `waterfall-marketing` | `marketing` | HTML | pending |
| AnglerAI | `AnglerAI` | `angler` | mobile fishing app | pending |
| Bible Audio | `bible-audio-timestamps` | `bible-audio` | data repo — assess | pending |

(OS home `Waterfall-Claude-OS` is the control plane, not normalized as an app.)

## Recommended sequencing

**Wave 0 — control plane (done here):** author the standard, Skill Pack, app
CLAUDE.md template, this plan. ✅

**Wave 1 — reference implementation (1 repo):** pick the cleanest flagship —
recommend `cairo-ai-pro` (already carries OS-core skills) — and normalize it
end-to-end as the canonical example others copy.

**Wave 2 — reconcile duplicates:** resolve the obvious forks before normalizing
them twice — `sentryinsurance` vs `sentry-insurance` vs `sentryinsurance-549065ef`;
`resumaipro` vs `ResumAI`; `Waterfall-Technologies` vs `waterfall-technologies-5957dd83`.
Decide canonical, retire/redirect the rest (with confirmation).

**Wave 3 — active TS apps:** `waterfall-nexus`, `Waterfall-Tech-Command`,
`verseful`, `atlasaipro`, `recipe-ai-26`, `pixelperfectaipro`, `lightma-assistant`,
`shoperamrkt`, `adventureapp`.

**Wave 4 — domain apps (extra care):** `physiqai`, `health-link-engine`,
`sentryinsurance`, `rtai` — carry domain skill subsets + stricter handling
(PHI/PII, audio/design contract).

**Wave 5 — assess-then-decide:** `shopera` (mockups), `AnglerAI`,
`bible-audio-timestamps` (data), `waterfall-marketing` — may need a lighter
profile than a full app.

## Per-wave exit criteria

A wave is done when, for each repo in it: `check-architecture.sh` exits 0, the
app `CLAUDE.md` exists, the build is green, `superagent-conformance` +
`security-monitor` are clean, the PR is merged, and this table's Status is
updated.
