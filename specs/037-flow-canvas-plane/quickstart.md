# Quickstart — verifying the plane

Automated gates prove the arithmetic. **Nothing in this harness can see a gesture, a
scroll offset, or a pixel** (`renderToStaticMarkup`, no DOM), so everything below has to
be done by hand. §C is the one that would be embarrassing to skip.

## Gates (run these first)

```bash
cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build
cd ../backend && go vet ./... && go test ./...
```

## Scope assertions

```bash
# No layout value derives from the panel any more (SC-006). Expect **two comment lines**
# in AudioOutputsTab explaining what the term used to be, and no code.
grep -n "canvasWidth" frontend/src/components/event/InputGraphCanvas.tsx \
                      frontend/src/components/event/AudioOutputsTab.tsx

# The clamp, the pins and the bands are gone. Expect nothing.
grep -rn "clampProcessingX\|zoneProcessingBounds\|zoneChannelsX\|zoneDestinationsX\|LaneBands" frontend/src/

# A reach check is never a permission (P9, §7g) — carried forward from Slice 36 and
# still covering the `spatial` alias. **Expect 1**, down from Slice 36's 2: the second
# was the `'y-only'` drag mode's call site, deleted here. The survivor is
# `AudioOutputsTab`'s `dragHandle`, which has Slice 36's written answer beside it (the
# call site already passed `undefined` for a read-only role) and a cross-reference from
# `InputGraphCanvas`. A grep tuned until it prints 0 has stopped testing anything.
grep -rn "!isMobile &&\|isMobile &&\|!spatial &&\|spatial &&" frontend/src/components/event/ | wc -l
```

## A · The report, reproduced and fixed *(the whole point)*

On a phone, open an event whose outboard is spread across the middle of the graph.

1. **Every node is where the desk put it**, with the same gaps and the same neighbours.
2. **Nothing overlaps that did not overlap on the desk.** Before this slice, event 1's
   16-jack desk panel sat on top of all three DI boxes.
3. Compare against the desk side by side if you can. For every pair of nodes, the
   left-right order must agree.

## B · Panning and zooming

4. One finger pans in both axes, with momentum and rubber-banding.
5. Pinch zooms about the midpoint of the two contacts, and the graph does not slide out
   from under them.
6. The bar's `−` / `+` step ×1.4; tapping the readout returns to *fit* and frames the
   whole graph, however far you had panned.
7. A tap on a node opens the sheet. **A press that moves does not.**

## C · The origin, which is the new arithmetic

8. On a **desk**, drag a node left past the leftmost node, and keep going past the
   window's left edge. **The rest of the graph must not lurch sideways.** This is
   `originShift`; the pure delta is tested, the DOM half is not.
9. Keep dragging up, past the top. Same requirement on the other axis.
10. Release. The node stays. Reload: it is still there, at a negative coordinate.
11. Drag it back. The plane shrinks again and the view stays put.

## D · The remembered view

12. On a desk, zoom to ~70 % and pan to the desks. Leave the tab, come back: same place.
13. Reload the page: same place.
14. On a **phone**, the same event opens at *fit* the first time (its own device, its own
    memory), and thereafter where the phone left it. **Confirm the desk did not move.**
15. As a **viewer** (read-only), pan and zoom are remembered too — it is this device's
    view, not the event's.

## E · The desk cost, and whether fit pays for it

16. The Channels / Destinations rail no longer hugs the window's right edge. Opening at
    *fit* is what is supposed to make that a non-event. **Judge whether it does.** If it
    does not, the lever is `fitFloor` in the two tabs.
17. A 32-source rail is now ~700 px tall with no internal scroll. Check it reads as a
    node on a plane rather than as something that overflowed.

## F · The migration

Never against `backend/patchplanner.db`. Rehearse on a copy:

```bash
cp backend/patchplanner.db /tmp/mig.db
sqlite3 /tmp/mig.db < backend/migrations/047_flow_plane_positions.up.sql
sqlite3 -header /tmp/mig.db "select id,name,position_x,input_position_x from event_consoles"
sqlite3 -header /tmp/mig.db "select name,input_port_count,output_port_count,position_x from output_devices"
```

Expect: rails at 24 and 1400, destinations at 1400, **processing devices unchanged**
(event 1's LR Amplifier stays at 743, the DIs at 335/350/342).
