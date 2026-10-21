## Context

D9's brief (ROADMAP.md) left two questions open. The user answered both on 2026-10-21. Aux sockets
are stored as **their own port kind**, and a socket **may feed any channel**. The design was
approved from `mockup.html` (option (b): a separate node), with one change: the canvas badge reads
**LOCAL AUX**, not AUX. The printed badge stays AUX.

Three findings changed the brief's premises:

- The input and output cable tables constrain no kind (migrations 029 onwards; no CHECK, no
  trigger). A new kind is code only. The only migration is for the new node's position.
- The X32's aux strips take their source from `/auxin/NN/config` field 4 (template default `32 + NN`
  for 1–6, i.e. *Aux NN*; 39/40 for USB L/R on 7–8). The enum is {OFF, In01…32, Aux 1…6, USB L, USB
  R, FX…, Bus…}, so socket *k* is source value `32 + k`. User-in codes 161–166 are Aux In 1–6
  (Maillot, *Unofficial X32/M32 OSC Remote Protocol* v4.06). The family addresses at most 6 sockets.
- The phone cannot pick a local jack today. `resolveChannelRouting` returns `{}` for a
  `console_local` feed, so the sheet opens blank. The roadmap's statement that the phone "draws the
  same panel" was wrong.

The socket counts (6, or 0 on Core and M32C) come from retailer spec sheets for the X32 Rack, Compact
and M32R, and from an input total for the Producer. They have not been checked against the
manufacturer's manuals. Every X32 · M32 routing table stops at Aux 6, which bounds them.

## Goals / Non-Goals

**Goals:** patch a source into an aux socket on the canvas and the phone, from that socket to any
channel; print it; export it; keep it through a model switch.

**Non-Goals:** no jacks for USB-fed aux strips 7–8. No change to the Outputs graph (aux *outs*). No
typed aux socket count on Generic. No aux line on the console card or in the Rig summary. Exporting a
stagebox-fed aux strip (it would need the `/config/routing/IN` AUX block or a shared user-in slot) is
left as it is today: noticed, not written. No same-desk check on the hop into a channel, matching
local jacks, which have never had one; the export resolves only the exported desk's own sockets.

## Decisions

**D1 · The kind is `console_aux`, input graph only.** It is added to `ValidInputCableFromKinds` and
`ValidInputCableToKinds` and to the frontend input `PortRef['kind']` union. It is not added to the
output lists. The port index is 0-based, socket N = port N−1. `console_aux → channel` is cableless,
as `console_local → channel` is. *Alternative:* `console_local` ports at a fixed offset. The user chose a kind of its own. Every count and range query on `console_local` (usage, shrink conflicts, switch use) would
have had to learn to skip the range, and a missed one would miscount without any error.

**D2 · The socket count is derived, not stored.** `DeskModel.AuxSockets` (JSON `aux_sockets`), set
by `x32()` to 6 when `localIn > 0`, else 0. `domain.Console.AuxSocketCount` (JSON
`aux_socket_count`) is filled when a console is read, from its model. It is never written, so it
cannot disagree with the model. The API bounds an aux port by it. The canvas draws
`max(aux_socket_count, highest patched port + 1)` sockets, so a cable kept past a switch is still
drawn and flagged over, the same rule `localJackCount` applies.

**D3 · The node's position is a nullable pair.** Migration `056_console_aux_positions` adds
`aux_input_position_x` and `aux_input_position_y`, both `REAL NULL`. A NULL means never placed. On
read, the server resolves a NULL to LOCAL's input position plus LOCAL's drawn height plus 24 px. If
the desk has no local inputs, it resolves to LOCAL's default position. LOCAL's drawn height is
`NODE_HEADER + NODE_BODY padding + 18 px × local jack count`, a Go constant that mirrors
`graph/tokens.ts`. The canvas and the PDF read the one resolved value (`patterns.md` §8a). A drag
writes both columns. Any console update writes back the resolved value it was served, which pins the
node where it is drawn. That is accepted: the node does not jump. *Alternative:* resolve on the
client and again in the PDF. Rejected, because that is two derivations of one position.

**D4 · Labels.** Cable side *Aux in N*, desk side *Aux to desk N*, chain hop *<desk> aux in N*,
inspector title *<desk> · aux sockets*, kind label *Aux socket*, canvas badge LOCAL AUX, printed
title *<desk> aux* with badge AUX and footer *N aux sockets - M used*.

**D5 · The phone's routing becomes a panel reference.** `ChannelRouting` changes from
`{stageboxId, port, sourceId}` to `{panel?: {kind: 'stagebox' | 'console_local' | 'console_aux', id},
port?, sourceId?}`. `resolveChannelRouting` and `computeRoutingSave` treat the three panels alike:
the same two edges, and the same "vacated jack loses its feed" cleanup. Into is a `<select>` with the
stageboxes ungrouped first, then one `<optgroup>` per desk that has local inputs or aux sockets.
Slice 47's grouped model select is the precedent. Option values are encoded `kind:id`. Jack sizes
from the panel: `input_count`, `localJackCount`, or the aux count.

**D6 · Export.** In `console_export.go`, `resolve` maps `console_aux` on the exported desk to
`DeskPort{Socket: "aux", Index: port}` on X32 · M32. Other desks and engines return nil. In
`x32.go`, `inputCode` maps `aux` to `161 + Index`, and `headampIndex` returns −1 for it. An aux strip
whose input is on the `aux` socket sets `/auxin/NN/config` field 4 to `33 + Index`, and its stereo
partner sets it from `InputR`. An aux strip with any other input keeps the template source and the
Changed notice, reworded to "aux inputs not on an aux socket keep their own rear socket". On LV1 an
aux socket cannot exist, because the model has none and the API refuses the port.

**D7 · The switch.** `domain.LocalUse` gains `Aux []JackUse`, filled by the same query shape for
`console_aux` (input side only). `switchFigures` adds an "Aux sockets" figure when either model has
sockets. `switchLines` checks aux use against `to.Model.AuxSockets`, including a switch to Generic,
which has 0. The local-jack loop skips Generic; the aux check does not.

**D8 · Delete.** `DeleteConsole` clears `console_aux` cables alongside `console_local` cables.

## Risks / Trade-offs

- [Socket counts are retailer figures] → recorded as unverified in ROADMAP's Fixed note. Correcting
  one is a one-line model change.
- [The resolved default position freezes on any console update] → accepted. The node stays where it
  was drawn, which is what the user saw.
- [The phone sheet's routing logic is rewritten] → the existing stagebox and direct-source tests stay
  and must pass unchanged, and local and aux cases are added beside them.

## Migration Plan

`056_console_aux_positions.up.sql` adds the two nullable columns. The down migration drops them.
Existing consoles get NULL and resolve to below LOCAL. The down migration does not delete
`console_aux` cables. Rolling back the binary leaves them in the table, where the old code does not
draw them as a panel.
