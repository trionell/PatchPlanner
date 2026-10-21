## Why

D9 (ROADMAP.md, *Known defects*): on an X32 or M32 desk the local panel on the Inputs graph draws
only the local mic inputs. The rear **aux in** sockets have no jacks, so a source plugged into them
cannot be patched, and the console export silently leaves every aux strip on its rear socket because
the graph has no way to say otherwise. Found by the user on 2026-10-18 while testing Slice 49's M32
export.

## What Changes

- **Each desk model declares its aux in sockets.** Every X32 · M32 model with local jacks (X32,
  Compact, Producer, Rack, M32, M32 Live, M32R, M32R Live) has 6. X32 Core, M32C, every LV1 and
  Generic have 0. The count is derived from the model and never typed. Aux strips 7–8 are fed by USB
  and get no socket.
- **A new input-graph port kind, `console_aux`**, kept apart from `console_local`. It is a
  pass-through like a local jack: a real, billable cable lands on *Aux in N*, and a cableless hop
  carries *Aux to desk N* to any channel, either an aux strip or an ordinary channel. Aux sockets never
  count against the local inputs. No migration is needed for the kind, because the cable tables
  constrain no kind.
- **The Inputs canvas** draws a separate node for the aux sockets beside the LOCAL node. It is titled
  with the desk's name and badged **LOCAL AUX**, has its own stored position, can be selected and
  searched, and is absent on a model without sockets.
- **The phone channel sheet** changes its routing pair from *Stagebox + In* to **Into + Jack**. Into
  offers stageboxes, then each desk's local inputs and aux sockets, grouped under the desk. This
  also fixes a gap the mockup found: the phone could not pick a local jack at all.
- **The audio PDF** prints the aux node beside the local node (title *<desk> aux*, badge AUX).
- **The model switch** keeps aux cables a new model lacks, flags them over, and lists them under
  Left out, as it already does for local jacks.
- **The X32 · M32 export** writes an aux strip on socket *k* as `/auxin/NN/config` source *Aux k*,
  and an ordinary channel on socket *k* as user-in code 160 + *k*. An aux strip fed from anything
  other than an aux socket keeps today's notice.
- **Migration** `056_console_aux_positions`: two nullable position columns for the aux node on the
  Inputs canvas.

## Capabilities

### New Capabilities

- `console-aux-sockets`: what an aux socket is, which models have them, how it is patched on the
  Inputs canvas, the phone sheet and the printed graph, and how it is counted.

### Modified Capabilities

- `console-desk-model`: the profile table gains the aux socket count; the switch preview and the
  kept-past-count rule cover aux sockets.
- `console-showfile-export`: the file holds the aux socket patch, and the "aux input patched to a
  stagebox" notice narrows to aux strips fed from anything but an aux socket.

## Impact

**Backend.** `domain/desk_models.go` (`AuxSockets`), `domain/audio.go` (the kind in both valid-kind
lists, `Console.AuxSocketCount` and the aux position pair), `db/consoles.go` (scan, update, delete
cascade, derived default position), `db/desk_switch.go` and `service/deskmap.go` (aux socket use in
the switch), `api/audio_patch.go` (port counts and the cableless rule for the new kind),
`service/audio_graph.go` (the printed node), `service/console_export.go` and
`service/consolefile/x32.go` (the patch). Migration `056_console_aux_positions`.

**Frontend.** `types/index.ts`; `lib/inputGraph.ts` (`consoleAuxPorts`, kind label and name,
resolve, cableless, connectable, jack count); `lib/patchSheet.ts`, `lib/inputSignalFlow.ts`,
`components/event/ChainLine.tsx` (the *<desk> aux in N* hop); `InputGraphCanvas.tsx` (the node, its
layout, drag and search); `InputFlowInspector.tsx` and `AudioInputsTab.tsx` (selection);
`lib/mobileChannelList.ts` and `components/mobile/MobileChannelEditSheet.tsx` (Into + Jack).

**`design/`.** Untouched: the mockup's option (b) uses only existing rules (node, split row, dashed
hop, grouped select, side-by-side pair). Design approved by the user 2026-10-21, with the canvas badge
changed to LOCAL AUX.

**Constitution Check.** No principle is deviated from. The kind is code-validated, as every cable
kind already is. The schema change is a migration file. The phone change keeps tap targets and
`useIsMobile()`. Tests are Go `testing` and Vitest `renderToStaticMarkup`.
