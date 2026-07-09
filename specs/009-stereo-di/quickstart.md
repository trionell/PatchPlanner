# Quickstart: Mono/Stereo Channels & DI Cabling

Manual verification walkthrough after implementation. Prerequisite:
restart the backend so migration 022 applies. Uses the real reference
event's piano channel (already rigged through a Radial PRO-D2
dual-channel DI) and its Kick/Snare/OH mic channels.

## 1. Existing data is untouched (once, right after restart)

1. Open the event with the piano/bass/guitar DI channels → Audio Inputs
   tab.
2. Every channel shows **mono** width, no side-B routing, no source
   cable — identical to before the restart.
3. Rental summary and Excel export totals are byte-for-byte unchanged
   from before the restart (SC-005).

## 2. Stereo input, both mixer behaviors (US1)

1. Take an existing mono mic channel with a mic, cable, and stand picked
   (e.g. the OH pair, planned today as two separate mono rows — pick
   one). Switch its width to **stereo**.
2. Side B defaults to the same stagebox, next channel number; the
   rental summary now counts that mic, cable, and stand **×2** for this
   row.
3. Set mixer behavior to **linked channels** at channel 5 → the row
   displays "5–6"; adding a new row suggests channel 7 (not 6).
4. Switch mixer behavior to **stereo channel** → the row displays "5"
   alone; a new row now suggests 6. Side-B routing is unaffected by the
   mixer-behavior change.
5. Repatch side B to a **different** stage multi (simulating a crowd-mic
   pair on opposite sides of the stage) → tabs, print sheet, and signal
   flow each show side A's and side B's routes independently.
6. Switch the row back to **mono** → side B disappears from every
   display and the doubled counts return to single.

## 3. Stereo output (US1)

1. On the Audio Outputs tab, mark the main L/R output row **stereo**
   with a speaker cable and speaker picked.
2. Rental summary counts the cable and speaker **×2**; the amplifier (if
   picked) stays **×1**.

## 4. DI source cabling (US2)

1. On the bass or guitar DI channel (XLR already picked), pick a
   "Linekabel Tele-tele" as the **source cable**.
2. Rental summary now includes that line cable — previously invisible
   to the rental order (SC-003).
3. Take the piano channel: set width **stereo**, signal type **DI**,
   pick the same DI item, and choose **splitter** cabling with a
   TRS→2×TS-style cable as the source cable.
4. Rental summary shows exactly 1 DI, 2 XLR cables (doubled DI→preamp
   cable), and 1 splitter cable for that channel (SC-002).
5. Switch that same channel's cabling choice to **two individual
   cables** → the source cable count changes to 2, DI stays 1.
6. Change the piano channel's signal type away from DI → the source
   cable disappears from the row and from the rental count. Switch back
   to DI → the previously picked source cable reappears.

## 5. Signal flow & print sheets (US3)

1. Signal Flow tab: the stereo channel from step 2 shows both physical
   paths; the piano DI channel shows the two-hop chain (source → source
   cable → DI → XLR → console).
2. Remove the piano channel's source cable → Signal Flow flags it as a
   gap immediately (matching how a missing DI→preamp cable is already
   flagged).
3. Print the Input Patch sheet: the linked-channels row from step 2
   shows "5–6" with both physical connections; the DI rows show both
   cables; a mono row with no source cable looks exactly like before
   this feature.
4. Print the Output Patch sheet: the stereo output row shows both
   destinations.

## 6. Guardrails

1. Compare the rental summary and Excel export before/after this
   feature on an event with no stereo/DI changes — byte-for-byte
   identical (SC-005).
2. Toggle a channel stereo → mono → stereo again: side-B routing and
   source-cable pick, if not explicitly cleared, reappear rather than
   being re-entered (state-transition reversibility, data-model.md).

## Automated coverage (runs in CI)

- `backend/internal/db/stereo_migration_test.go` — scratch DB stepped to
  migration 21, seeded with pre-existing rows, stepped to 22: asserts
  every row defaults to `mono`/`stereo_channel`/`two_cables` with null
  side-B and source-cable columns, and that old rows' rental counts are
  unchanged.
- `backend/internal/db/rental_test.go` / `backend/internal/api/rental_test.go`
  — extended with a doubling matrix: stereo mic/cable/stand ×2, stereo DI
  item ×1, stereo amplifier ×1, DI source cable ×1 (mono or splitter) vs
  ×2 (stereo + two_cables).
- `backend/internal/api/audio_patch_test.go` — width/mixer_behavior/
  source_cabling enum validation (400 on bad value), side-B foreign-event
  ref 400, source-cable foreign-item 400, full round-trip.
- Frontend Vitest — `signalFlow.test.ts` (sourceCable + pathB hops, gap
  flagging), `printSheets.test.tsx` (pair numbering, both connections,
  both cables).
