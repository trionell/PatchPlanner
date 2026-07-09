# Quickstart: Output signal chains

Manual verification walkthrough after implementation. Prerequisite:
restart the backend so migration 023 applies. Uses the real reference
event's existing output rows (whatever local/stagebox/stage_multi outputs
it already has planned).

## 1. Existing data migrates losslessly (once, right after restart)

1. Open the reference event's Audio Outputs tab.
2. Every existing output row now shows an equivalent chain instead of the
   old destination/amplifier/speaker fields: a local row with an amp and
   speaker shows a 2-hop chain (amp, then speaker); a stagebox/stage-multi
   row shows a single route hop with the same channel.
3. Rental summary and Excel export totals are byte-for-byte unchanged from
   before the restart (SC-005) — including any row that used both an
   amplifier and a speaker.

## 2. Build a full multi-hop chain (US1)

1. On an output channel, add hops in order: route hop → stagebox channel
   X, cable picked; device hop → an amplifier item, cable picked; device
   hop → a sub speaker item, no cable (daisy-chained); device hop →
   another sub speaker item, cable picked; device hop → a top speaker
   item, cable picked.
2. Rental summary now includes every device and cable in that 5-hop chain
   exactly once each (except stereo doubling, tested in step 4) — this is
   the exact gap this slice closes (SC-003).
3. Reorder the two sub hops, then delete the middle sub hop — the
   remaining hops keep their order and the rental order drops that sub's
   count immediately.
4. Confirm the trivial case still works with no extra steps: a fresh
   output row with a single device hop (amplifier or speaker, whichever
   is picked first) behaves exactly like today's simplest "local out"
   case.

## 3. Declare and reuse a shared device (US2)

1. Open the (new) Output Devices manager and declare a multichannel
   headphone amplifier, picked from the rental catalog.
2. On three different IEM-type output channels, add a device hop that
   references that same declared device (instead of picking the
   inventory item directly).
3. Rental summary shows that headphone amp exactly once, at quantity 1 —
   not three times (SC-002).
4. Delete the declared device — all three chains' hops revert to "device
   not yet picked" (visibly flagged) rather than the deletion being
   blocked; the rental summary drops it to zero immediately.

## 4. Stereo output chain (US1 + Slice 9 reuse)

1. Mark an output channel **stereo**. Give its route hop independently
   patched sides (side A to one stagebox channel, side B to a different
   stagebox — or the same one, tech's choice).
2. Add a plain (non-shared) device hop with a speaker item and a cable.
3. Rental summary counts that hop's speaker and cable **×2**; the route
   hop's cable also counts **×2**.
4. Add a device hop referencing a *shared* device (e.g. a stereo
   amplifier declared once for this channel) — rental summary counts it
   **×1**, unaffected by the channel's width.

## 5. Signal flow & print sheet (US3)

1. Signal Flow tab: the 5-hop chain from step 2 renders all five hops in
   order between "Console" and the final destination.
2. Remove one hop's cable pick — Signal Flow flags that hop as a gap
   immediately, the same way a missing input cable is already flagged.
3. Print the Output Patch sheet: every channel's full chain prints
   (not just a single destination line); the stereo channel from step 4
   shows both its route hop's sides.

## 6. Guardrails

1. Compare the rental summary and Excel export before/after this feature
   on an event with only simple (pre-existing) output rows — byte-for-byte
   identical (SC-005).
2. Attempt to save a hop with two device sources set at once (e.g. both an
   inventory item and a shared-device reference) — rejected with a
   validation error, previous chain untouched.
3. Delete a stagebox referenced by a route hop's side — that hop's side
   clears (matching existing stagebox-delete behavior) rather than the
   deletion being blocked or the chain silently breaking.

## Automated coverage (runs in CI)

- `backend/internal/db/output_chains_migration_test.go` — scratch DB
  stepped to migration 22, seeded with local/stagebox/stage_multi output
  rows (including one with both amplifier and speaker), stepped to 23:
  asserts every row's hops reproduce its old shape and its rental
  contribution is unchanged.
- `backend/internal/db/rental_test.go` — extended: non-shared device hop
  ×2 on stereo, shared device ×1 regardless of hop count/width, hop cable
  ×2 on stereo, owned-gear hops excluded entirely.
- `backend/internal/api/audio_patch_test.go` — chain validation (mutually
  exclusive device fields → 400, foreign-event refs → 400, wholesale
  replace semantics, position assignment), full round-trip.
- `backend/internal/api/output_devices_test.go` — shared-device CRUD,
  delete-clears-references behavior.
- Frontend Vitest — `signalFlow.test.ts` (hop-by-hop chain rendering, gap
  flagging), `printSheets.test.tsx` (full chain per channel, stereo
  route sides).
