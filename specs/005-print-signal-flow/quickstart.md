# Quickstart: Print & Signal Flow

Manual verification steps (print CSS cannot be asserted in jsdom — this checklist is the
acceptance pass for the print half of the slice).

## Setup

```bash
# Terminal 1 — backend
cd backend && go run .

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173, pick (or create) an event with a few planned input channels,
outputs, and lighting fixtures.

## 1. Input patch sheet (US1)

1. Open the event → **Audio Inputs** tab → click **Print**.
2. In the print preview verify:
   - [ ] Header shows sheet title + event name, venue, date.
   - [ ] One row per planned channel; all fields match the screen (incl. any
         legacy/custom vocabulary values).
   - [ ] Dark text on white; no sidebar, page header, tab bar, buttons, or inputs.
   - [ ] With ~50 channels: column headers repeat on page 2+; no row is cut in half.
3. Cancel the dialog, press **Ctrl+P** instead — the same sheet shows.
4. An event with zero inputs prints the header + "Nothing planned on this sheet."

## 2. Output patch & lighting rig sheets (US2)

1. **Audio Outputs** tab → **Print**: all output rows with destination (`local` /
   stagebox / multi + channel), amp, speaker, cable. No input or lighting content.
2. **Lighting Rig** tab → **Print**: all fixtures with truss, universe, DMX address,
   mode, channel count, power (grid connector or chain parent). No audio content.

## 3. Signal flow (US3)

1. Open the **Signal Flow** tab.
2. Verify for a fully routed channel: `Source → Cable → SB/Multi + channel → Console ch`
   reads on one row.
3. Break one channel on the Audio Inputs tab (clear its stagebox/multi channel number),
   return to Signal Flow:
   - [ ] The hop is flagged (⚠), the channel is counted in the "N channel(s) have gaps"
         summary.
4. A channel with neither stagebox nor multi shows "Direct to console" **without** a
   gap flag.
5. The view has no editable controls; DB rows are unchanged afterwards.
6. Click **Print** on the tab — the flow list prints paper-friendly like the sheets.

## Automated gates

```bash
cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
cd backend && go vet ./... && go test ./...   # must stay green (no backend changes)
```

Vitest must include the `signalFlow` suite: complete chain, missing source,
direct-to-console (unflagged), stagebox without channel (flagged), multi routing, legacy
`mic_label` source.
