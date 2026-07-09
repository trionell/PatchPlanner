# Quickstart: Audio Output Signal-Flow Graph

Manual verification walkthrough after implementation. Prerequisite:
restart the backend so migrations `025`/`026` apply. Uses the real
reference event — the same one this feature's design was grounded in
(its "LR amplifier"/"LR splitter" shared devices, built through Slice
10's editor, must survive this migration).

## 1. Existing chains convert losslessly (once, right after restart)

1. Open the reference event's Audio Outputs graph.
2. The "LR" channel shows: the mixer's two independent stereo ports, each
   feeding into the migrated "LR splitter" device, feeding into "LR
   amplifier", feeding two speaker devices.
3. Check the migration report (or logs) for any dropped stagebox-terminal
   links or FR-013 cable-drops — cross-reference against what you
   remember planning; confirm nothing important silently vanished.
4. Rental summary and Excel export totals are byte-for-byte unchanged
   from before the restart, **except** for any specific FR-013 exception
   the report calls out (SC-004).

## 2. Build a rig from scratch (US1)

1. On a fresh output channel, add a device: "Controller" (1 in, 2 out,
   XLR both sides).
2. Add "Amplifier" (2 in XLR, 2 out Speakon) and two "Speaker" devices (1
   in Speakon each, 0 out).
3. Drag them into a left-to-right layout matching the mockup.
4. Draw a cable from the mixer's output port to the controller's input —
   confirm the picker opens immediately and the connection only commits
   once a catalog cable is chosen.
5. Wire controller → amplifier → both speakers.
6. Confirm the rental summary now includes every device and cable exactly
   once (SC-001).
7. Drag the amplifier to a new position — confirm its cables follow
   visually and the rental summary is unchanged (SC-002).

## 3. Stage multi independence (US2)

1. Place a stage multi on the canvas (or use an existing one).
2. Connect one of its channels from the mixer; connect a *different*
   channel from a stagebox.
3. Confirm no cable picker appears for either connection into the multi,
   and the rental summary doesn't gain a line for either.
4. Connect one of the multi's output channels onward to a device — confirm
   the picker *does* appear this time, and that cable is counted.
5. Confirm the two channels' onward destinations are independent (SC-003).

## 4. Signal flow & print sheet (US3)

1. Signal Flow tab: every output channel's full path renders hop by hop
   from the mixer to its final destination(s).
2. Remove a cable partway through a chain — confirm the now-unconnected
   port is flagged as a gap immediately.
3. Print the Output Patch sheet: confirm it matches the graph's actual
   topology, not the old flat destination/amplifier/speaker shape.

## 5. Guardrails

1. Attempt to connect two cables to the same port — rejected.
2. Attempt to reduce a device's port count below its number of attached
   cables — rejected, with the affected cables listed.
3. Delete a device with cables attached — the device and its cables are
   gone; the *other* ends of those cables (their devices) remain.
4. Compare rental totals before/after this feature ships on an event that
   never used Slice 10's chain editor at all (a fully empty/legacy event)
   — unaffected, zero output rows means zero migration work.

## Automated coverage (runs in CI)

- `backend/internal/db/output_graph_migration_test.go` — replays the
  conversion algorithm (research.md R5) against every hop shape: a plain
  linear device chain, a route-to-stagebox (terminal and mid-chain), a
  route-to-stage-multi (with and without an old cable pick, exercising
  the FR-013 drop), a shared device referenced from two different
  channels, and a stereo channel's independent side-A/side-B migration.
- `backend/internal/db/rental_test.go` / `backend/internal/api/*_test.go`
  — flat per-row counting (no doubling), stage-multi input exclusion,
  port-bounds/uniqueness/direction validation.
- Frontend Vitest — `outputGraph.ts` pure functions (derived port lists,
  gap detection, role classification), `signalFlow.test.ts`,
  `printSheets.test.tsx`.
