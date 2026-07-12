# Quickstart: Audio Input Signal-Flow Graph

Manual verification walkthrough after implementation. Prerequisite:
restart the backend so migrations `029`/`030` apply. Use a real event
that already has Audio Input rows built through today's flat table
(mic channels, at least one stagebox/stage-multi-routed channel, and — if
the reference event has one — a DI/stereo-DI channel, to exercise the
richest legacy-conversion path available).

## 1. Existing channels convert losslessly (once, right after restart)

1. Open the reference event's Audio Inputs tab.
2. Every previously-configured channel shows up in the Channels table
   with its name/groups/DCA/color/notes intact, and in the graph with a
   migrated Source (correct mic/stand/phantom or line+connector) wired
   through to it — via a Stagebox/Stage-Multi jack if the old row was
   routed that way, or directly if not.
3. Any old `di` channel shows a migrated one-off DI device between its
   Source and the rest of its chain.
4. Check the migration report for any dropped legacy free-text
   (`mic_label`/`cable_type`/`mic_stand`) — cross-reference against what
   you remember the event actually having; confirm nothing important
   silently vanished (research.md R7 point 6).
5. Rental summary and Excel export totals are byte-for-byte unchanged
   from before the restart (SC-005).

## 2. Patch a rig from scratch (US1)

1. Add a mic Source ("Lead Vox", mic + stand + 48V), a Stagebox, and a
   Channel, all unwired.
2. Draw a cable from the Source's port to a free Stagebox jack, then from
   that jack's paired console-side port to the Channel — confirm the
   picker only appears for the first (real) cable, not the second
   (cableless, research.md R5).
3. Add a second Channel and connect the same Source's port to it directly
   (bypassing the Stagebox) — confirm both Channels now show that Source
   as feeding them, and the rental summary still counts the Source's mic
   once (SC-002).
4. Attempt to connect a second Source into either Channel's already-fed
   port — confirm it's rejected (`409`).

## 3. Source vs Channel independence (US2/US3)

1. Create a Channel with a name/groups/DCA/color/notes and no Source
   wired yet — confirm it saves and displays with no source-related
   field present.
2. Create a line Source (e.g. "Bass Direct Out") — confirm no mic/stand/
   phantom-power field is shown, only a connector type.
3. Switch an existing mic Source to `kind = line` — confirm its
   mic/stand/phantom fields clear immediately.

## 4. Color inheritance (US4)

1. Set a color on a Channel fed by a Source through a Stagebox — confirm
   the Source's port, the Stagebox's matching port pair, and every cable
   segment between them pick up that color, in both the graph and the
   Sources/Channels tables' row tinting.
2. Double-patch that Source into a second Channel with a different
   color — confirm the Source itself now shows neutral, while each
   outgoing cable still shows its own destination Channel's color.

## 5. Stereo splitter cabling (US5)

1. Create a stereo Source ("Playback PC", `mini_jack_3_5mm` connector)
   and a stereo `input_devices` row (2 in / 2 out).
2. Connect the Source's L port to the device's In-L with a catalog cable
   pick; connect R to In-R leaving the pick unset (the "splitter"
   convenience, research.md R6).
3. Confirm the rental summary counts that cable item once, not twice
   (SC-004).

## 6. Guardrails

1. Attempt to reduce an `input_devices` row's port count below its
   attached-cable count — rejected, cables listed.
2. Delete a Source with cables attached — confirm the Source and its
   cables are gone; the Channel(s) it fed revert to an unfed gap.
3. Delete a Stagebox used by both the Input and Output graphs — confirm
   both graphs' cables referencing it are cleared, and neither graph's
   unrelated cabling is otherwise affected.

## Automated coverage (runs in CI)

- `backend/internal/db/input_signal_graph_migration_test.go` — replays
  the conversion algorithm (research.md R7) against every legacy row
  shape: mic direct-to-channel, mic via stagebox, mic via stage multi,
  line/DI via a one-off device, stereo with `two_cables`, stereo with
  `splitter`, and a row with only legacy free-text fallback fields set.
- `backend/internal/db/rental_test.go` / `backend/internal/api/*_test.go`
  — flat per-row counting (no doubling), R5's cableless-edge exclusion,
  port-bounds/uniqueness/direction validation, the Source fan-out
  exemption.
- Frontend Vitest — `inputGraph.ts` pure functions (derived port lists,
  color-inheritance tracing, role classification), `inputSignalFlow.
  test.ts`, `printSheets.test.tsx`.
