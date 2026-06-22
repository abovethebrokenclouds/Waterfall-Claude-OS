# Privacy & Data

RTA Insight Pro is **local-first**. Audio is analyzed in your browser, on your
device, and is **not uploaded by default**. Measurement sessions live in your
browser's `localStorage`. Nothing leaves the device unless you explicitly export
or sync. This document explains exactly what is stored, how audio and
measurement data are handled, and the control you have over export and deletion.

---

## What is stored, and where

| Data | Where it lives | When |
|------|----------------|------|
| **Live audio samples** | In memory only, during a measurement | Discarded continuously; never written to disk by the app |
| **Measurement results** (spectrum, SPL, transfer, RT60) | In memory while active; in `localStorage` if you **save a session** | Only on explicit capture/save |
| **Session snapshots** (mode, result, capture settings, your notes) | Browser `localStorage`, on your device | When you tap save |
| **App settings** (smoothing, FFT size, weighting, calibration offset, Performance Mode) | Browser `localStorage` | As you change them |
| **Permission state** | Managed by the browser, not the app | When you grant/deny mic access |

There is **no account and no server** in the default experience. Clearing your
browser's site data for RTA Insight Pro removes everything above.

---

## How audio is handled

- **Captured in-browser.** Audio reaches the app through the browser's
  `MediaDevices` / Web Audio APIs, with the browser's voice-call processing
  (AGC/echo/noise suppression) **disabled** for measurement accuracy — see
  [integration-audio-interfaces.md](integration-audio-interfaces.md).
- **Analyzed, not recorded.** The app consumes audio frame-by-frame to compute
  spectra and levels. It does **not** record or store the raw audio stream. The
  samples exist in memory only for the moment they're analyzed, then are
  overwritten by the next frame.
- **Not uploaded by default.** No audio — raw or processed — is sent off the
  device in the default, offline path. The analyzer runs with no network
  connection after the app loads.
- **What a saved session contains.** A snapshot stores the **computed result**
  (e.g. a spectrum array, an SPL reading, a transfer-function table, an RT60
  figure) and the settings that produced it — **not** an audio recording.

---

## Microphone permission

- Measurement requires microphone access, which the **browser** grants — the app
  cannot capture audio without your explicit permission.
- Permission requires a **secure context** (`https://` or `localhost`).
- You can revoke microphone access at any time through your browser's site
  settings; the app handles a denied/revoked state with a recovery prompt rather
  than failing silently.

---

## Optional network features (opt-in only)

Two features touch the network, and **only** when you explicitly invoke them:

- **PDF report generation.** Sends a session snapshot (the computed result and
  settings — not audio) to the optional backend, which renders a PDF and returns
  it.
- **Cross-device session sync** *(roadmap)*. If enabled, stores named session
  snapshots so they appear on your other devices.

If the optional backend is not deployed, neither feature is available and the app
remains fully local. Any AI used anywhere in this app routes through the
platform's shared Super Agent — never a raw model call from app code.

> **Assumption.** Account-based sync is a roadmap item; the present release is
> local-only with manual export. When sync ships, it will be explicitly opt-in
> and documented here with its data-handling terms.

---

## Your control over data

- **Export.** From the `SessionList`, export any session as **JSON** (full
  fidelity), **CSV** (for spreadsheets/plots), or — via the optional backend — a
  **PDF report**. Exports go where you direct them (a download); the app does not
  send them anywhere on its own. Schemas are in [api.md](api.md).
- **Delete.** Delete individual sessions from the `SessionList`. Because sessions
  live in `localStorage`, clearing the site's browser data removes **all**
  sessions and settings at once.
- **No background transmission.** The app does not phone home, beacon usage, or
  upload measurements in the background. The default data flow stays on-device.
- **Synced data** *(when sync ships)*. If you opt into sync, deleting a synced
  session removes it from the backend (`DELETE /sessions/:id`); until sync
  exists, there is nothing stored server-side to delete.

---

## Scope and disclaimers

- RTA Insight Pro is an **audio analysis and measurement** tool. It stores
  measurement data and settings, not personal or account data, in the default
  experience.
- SPL and other figures are **measurements** presented for engineering use. The
  app provides **no** hearing-health, exposure, medical, or safety guidance.
- RTA Insight Pro is **not certified** to any IEC or ISO standard. Alignment with
  the relevant measurement standards is a stated roadmap goal, not a present
  claim — see the README roadmap.

Questions about data handling: `support@waterfalltechnologies.net`.
