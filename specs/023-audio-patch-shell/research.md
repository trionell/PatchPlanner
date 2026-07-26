# Research: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Feature**: `023-audio-patch-shell` | **Date**: 2026-07-26

Phase 0 record of the decisions this slice rests on. Three of them (R4, R5, R6)
were put to the user on 2026-07-26 and answered; the rest were resolved from the
code, from the approved mockup, and from precedent set by earlier slices.

---

## R1 — Sheet as the default view, Flow as a second toggle

**Decision**: The channel list is the landing view on both audio tabs; the
signal-flow canvas is one toggle away in the same content area. One toolbar
holds both.

**Rationale**: Three concepts were mocked and compared (the artifact
`https://claude.ai/code/artifact/bf85a648-3719-4aaf-a7b0-4a991d245aad`). The
measured problem was never the graph — it was that six sibling cards compete for
the top of the page with no hierarchy, ~140 always-live form controls sit in the
channel table alone (16 channels × 9 columns), and the graph starts roughly two
screens down inside a fixed 640px box. A patch sheet is also the artefact the
domain already prints and carries on stage, so making it the default view aligns
the screen with the paper.

**Alternatives considered**:

- *Patchbay-first* (the canvas as the whole tab, everything else in overlays):
  strongest visual identity, but the daily check "does every channel have a mic
  and a desk channel?" becomes a pan-and-hunt exercise, and 32-source events
  make it worse.
- *Console-strip layout* (vertical strips, one per channel): reads beautifully
  at 16 channels and collapses at 48; also the least like anything else in the
  app, so it would have carried its own interaction vocabulary.

---

## R2 — The console is a table, not more columns on `events`

**Decision**: `event_consoles`, one row per desk per event.

**Rationale**: Everything persisted about a console today is
`events.output_mixer_position_y` — a canvas coordinate. The desk has an
identity (name, role), a catalog item, capacity in four numbers, and positions
on two canvases; and the user chose to allow more than one per event (R4). That
is a row, not a widening of `events`. It also puts the console alongside
`stageboxes` and `stage_multis`, which is what it is: another event-scoped box
the signal passes through, with the same `inventory_item_id`-or-nothing rental
behaviour and the same per-event typed port counts.

**Alternatives considered**: Four more `events` columns plus a name — rejected
the moment multiple desks were on the table, and it would have left the desk
unable to hold positions for two graphs without four more columns still.

---

## R3 — `console_local` is a pass-through node kind, mirroring a stagebox

**Decision**: Add one port kind, `console_local`, to both cable graphs. It
behaves exactly as a stagebox does on each graph:

| Graph | In-side | Out-side |
|-------|---------|----------|
| Input | a real cable from a source/device lands on local **in** jack *n* | a **cableless** hop from that jack to a channel (the desk's own routing) |
| Output | a **cableless** hop from a mixer port (an output row) into local **out** jack *n* | a real cable onward to a destination device |

`isCablelessEdge(from, to)` gains `from_kind === 'console_local' && to_kind ===
'channel'`; `isCablelessToKind` gains `console_local`. Nothing existing is
redefined.

**Rationale**: This is the shape the graph already knows. A stagebox on the
input graph is exactly this — cable in, cableless hop to a channel — so the
talkback-straight-into-the-desk run becomes expressible with no new concepts,
no new cable semantics, and no changes to the rental rule (a cable into a local
jack is a real, billable cable; the hop from the jack to the channel is not, and
`cable_item_id IS NULL` already excludes it from every UNION arm structurally).

**Alternatives considered**:

- *Let a cable land directly on a `channel` from a `source`* (i.e. add `source →
  channel` to the valid kind pairs): fewer rows, but it discards the
  information that matters — *which* local jack the mic is plugged into, which is
  the entire point of writing it on a patch sheet.
- *Model local jacks as a hidden stagebox owned by the console*: keeps the graph
  untouched, but then the fake stagebox appears in the Rig drawer and on the
  rental order, which is precisely the fiction the user asked to remove.

---

## R4 — Several consoles per event *(user decision, 2026-07-26)*

**Decision**: An event may declare any number of consoles. `input_channels` and
`audio_patch_outputs` each gain a nullable `console_id`. The console column and
filter appear in the UI only when the event has more than one console.

**Rationale**: FOH plus monitors is an ordinary rider, and a broadcast split is
not rare. The single-desk case is a list of one, so the superset costs one
nullable column per table and no extra table. Presented to the user with its
cost (a desk column on the Outputs sheet, a picker per output row); they chose
it.

**Consequences**: Every capacity figure is per console, not per event. The
status rail names the console it is talking about — which is why it can say
`SD10 · 15 / 96 in` instead of a bare channel count.

**Alternatives considered**: Exactly one console per event, relaxable later
without a data migration. Rejected by the user; it would have removed the column
and the picker but made the second desk unrepresentable in the meantime.

---

## R5 — Port counts are typed per event, not inherited from the catalog *(user decision)*

**Decision**: `input_count`, `output_count`, `local_input_count`,
`local_output_count` are typed on the console row. The picked inventory item
contributes nothing but identity and price.

**Rationale**: Identical to how `stageboxes.input_count`/`output_count` and
`stage_multis.channels` already work, so the console needs no special case in
any form, validator or drawer. The alternative would put console-only columns on
`inventory_items`, which every catalog would then carry — including
hand-entered ones and generic-spreadsheet imports, whose whole point (Slice 22)
is that the six-column sheet is all a user has to fill in. It would also be
wrong in practice: a desk's usable channel count depends on the card fit and the
licence, not on the model name.

**Alternatives considered**: Prefill-on-pick then allow override. Rejected as
the worst of both — it still needs the catalog columns, and it adds a rule for
what happens when the catalog item's counts later change.

---

## R6 — An owned console counts on the rental order *(user decision)*

**Decision**: The new UNION arm is `SELECT COALESCE(inventory_item_id,
owned_item_id), 1, 0 FROM event_consoles WHERE event_id = ? AND
(inventory_item_id IS NOT NULL OR owned_item_id IS NOT NULL)`.

**Rationale**: The codebase currently disagrees with itself here —
`input_devices` counts either kind via `COALESCE`, while `stageboxes` and
`stage_multis` count only `inventory_item_id`. The user chose the
`input_devices` precedent: the order doubles as the day's packing list, so a
desk you own still has to appear on it. A console with neither item picked
contributes nothing, exactly as an unpicked stagebox does — which is also what
makes the backfill invisible to the rental baseline.

**Alternatives considered**: The `stageboxes` precedent (rented only). Rejected
by the user.

---

## R7 — Console role stays a validated Go slice, not a `reference_values` vocabulary

**Decision**: `domain.ConsoleRoles = []string{"foh", "monitor", "broadcast"}`,
validated at the API boundary, mirroring `ValidPortFromKinds`.

**Rationale**: Principle II requires *equipment types, connector types, channel
attributes and fixture definitions* to be data. Role is none of those: it is a
structural label on a node kind, the same class of thing as a port kind or a
cable direction, and the principle explicitly exempts new domain node kinds from
the data-only rule. It also fails the practical test for a vocabulary — nothing
in the app looks a role up, offers it as a filter, or renders it differently;
it exists so a user can tell two desks apart at a glance. A `reference_values`
row would add a lookup, a seeding migration and a settings surface for a
three-item list nobody will extend.

**Alternatives considered**: A `reference_values` vocabulary like
`preamp_connectors`. Revisit if a user ever asks for a fourth role — promoting
it later is an insert plus a dropdown source change, not a schema change.

---

## R8 — `events.output_mixer_position_y` is dropped, its value carried into the console row

**Decision**: Migration 042 copies `output_mixer_position_y` into the backfilled
console's `output_position_y`, then drops the column. `042.down.sql` re-adds it
and copies the value back.

**Rationale**: Two places storing where the desk sits would drift immediately.
`ALTER TABLE … DROP COLUMN` is already used in this project's migrations
(`031_input_graph_positions.down.sql`), so the SQLite build supports it and the
convention is established. The `PATCH /output-mixer-position` route is replaced
by the console's own `PATCH /consoles/{id}` carrying its positions, which is
where every other node's position already lives.

**Alternatives considered**: Leave the column in place, unused. Rejected —
`026_drop_output_chain_hops` and `033_drop_truss_sections` show this project
removes superseded schema rather than accumulating it.

---

## R9 — The chain cell is a render of existing walkers, not new traversal logic

**Decision**: A new pure module `lib/patchSheet.ts` converts an existing
`InputChannelFlow` / output flow into an ordered list of *segments*, each
carrying its label, its hop kind, whether it is missing, and the `PortRef` it
would repatch. The Sheet renders segments; the per-hop popover acts on the
`PortRef`.

**Rationale**: `buildInputChannelFlow` already walks `input_cables` backward
from a channel port to its origin source, and `buildOutputChannelFlow` already
walks forward from a mixer port; both are unit-tested (`inputSignalFlow.test.ts`,
`signalFlow.test.ts`) and both already feed the print sheets. The only thing
missing for the mockup is that a `FlowHop` is a display string with no identity,
so it cannot be clicked. Segments add that identity without touching the walk.

**Consequences**: The print sheets and the Sheet view can share one segment
list, which is how FR-017 (print and screen show the same thing) becomes true by
construction rather than by discipline.

**Alternatives considered**: Compute the chain server-side and return it on the
payload. Rejected — it would duplicate a client-side traversal that already
exists, add a round trip after every cable edit, and put presentation strings in
the API.

---

## R10 — The source rail keeps its shipped shape; the row gains information

**Decision**: Keep `SourcesNode` as one consolidated node of fixed-height rows
(the app already does this). Spend the row on: full-height derived colour edge,
name, picked model dimmed, phantom-power indicator, port flush right. A stereo
source occupies two port slots with `L` above `R`.

**Rationale**: A card per source does not survive a real input list — at 54px
each, a 32-source festival patch is ~1,700px of lane, and the graph stops being
readable exactly where it matters most. The shipped `InputGraphCanvas` is
already better than the first mockup drawn for this work, which showed separate
cards; the revision keeps the rail and spends the saved space on information it
currently lacks. Stereo-vertical follows the data model, where `sourcePorts`
genuinely returns two ports that can be cabled independently.

**Alternatives considered**: Cards with a collapse-all control (still 1,700px
when open, and the interesting state is "all of them"); a two-column rail
(halves the height, doubles the cable crossings).

---

## R11 — Colour means "this run reaches a channel"; dash pattern means "network"

**Decision**: Apply the existing `derivedPortColor` result along the whole run —
the source's colour edge, every cable stroke, every intermediate port dot, and
the channel row. Encode cable-versus-network purely as a dash pattern, never as
a hue. Phantom power is red (`#ef4444`) and bar-shaped.

**Rationale**: The rule already exists and is already the app's semantics:
`reachableChannels` walks forward and `derivedPortColor` returns a colour only
when the run lands on a channel and every reachable channel agrees. Painting the
whole path with it turns colour into the answer to "is this signal actually
getting to the desk?", which is the question a patch sheet exists to answer.
Previously network hops were drawn in a fixed cyan, which collided with a
cyan-coloured channel; splitting the two encodings (hue = which channel, dash =
what kind of link) makes both readable at once. Phantom power had to move off
amber because an amber dot is also a port; red is the desk convention and
differs in both hue and shape, so it is distinguished twice over.

**Watch item**: red is also the app's error colour (`#f87171` for "no source",
"not patched"). It reads cleanly here because errors are always text chips and
never bars, but a future red *shape* in the rail would collide.

**Alternatives considered**: Keep colour on the source row only (today's
behaviour — the rule exists but is nearly invisible); colour by zone instead of
by channel (pretty, says nothing).

---

## R12 — View mode persists in `localStorage`, per event and per tab

**Decision**: `usePatchView(eventId, 'inputs' | 'outputs')` reads and writes
`patchplanner.patchView.{eventId}.{tab}`; default `sheet`.

**Rationale**: The choice is a per-user viewing preference with no meaning to
any other user of a shared event, so it does not belong in `event_settings`
(which is per-event, snapshot-copied, and shared with contributors). Selection
and search term are per-visit and stay in React state — deliberately not
persisted, because a stale search filter on return would look like data loss.

**Alternatives considered**: `event_settings` (wrong scope, needs a migration
and an API round trip for a toggle); URL query parameter (survives reload and
sharing, but makes every toggle a history entry and puts UI state in a
shareable link).

---

## R13 — Drawers are right-side overlays, not collapsible sections

**Decision**: Rig and Buses are overlay panels anchored right, over the content,
dismissed by Escape or a close button, one at a time. Rig is wide (it lists four
kinds of equipment); Buses is narrow.

**Rationale**: The material in them is set up once at the start of a job and
then left alone; the point of the redesign is that it stops occupying the
default view. An overlay leaves the sheet's layout untouched when it opens,
which matters because the sheet is the thing the user is checking against.
Narrowing the window to tablet width must not squeeze the sheet — hence overlay
rather than a flex sibling.

**Alternatives considered**: Collapsible accordions in place (still six headers,
just shorter ones — the original problem); a modal dialog (blocks the sheet you
are cross-referencing, and modals here would nest, since editing a stagebox
already opens one).

---

## R14 — Search filters the Sheet and dims the Flow

**Decision**: One search term per tab. In Sheet it removes non-matching rows; in
Flow it lowers the opacity of non-matching nodes and leaves them in place.

**Rationale**: A filtered table is unambiguous. A filtered *graph* is a lie —
removing a node removes edges that exist, so a partially-hidden patch reads as
an unpatched one. Dimming keeps the topology honest while still pointing at the
match. Matching runs over the row's own text (number, name, notes) and its chain
string, so searching "Radial" finds every channel through the DI box.

---

## R15 — A capacity of 0 means "not declared", never "over capacity"

**Decision**: Any console count of `0` disables the corresponding check.

**Rationale**: Every event backfilled by migration 042 has a console with all
four counts at `0`, and none of them may start warning. It is also the honest
reading of the field: nobody books a desk with no inputs, so `0` can only mean
"not typed in yet". Over-capacity is reported only when a count is positive and
the assigned rows exceed it.

**Consequences**: The "over capacity" state of the status rail is unreachable
until a user types a count, which is correct — the tool should not invent a
capacity it was never told.
