## 1. Model and schema

- [ ] 1.1 `domain/desk_models.go`: add `AuxSockets` (`aux_sockets`) to `DeskModel`; `x32()` sets 6 when `localIn > 0`, else 0; test every model's count against the spec table
- [ ] 1.2 Migration `056_console_aux_positions` (up adds `aux_input_position_x/y REAL NULL`, down drops them)
- [ ] 1.3 `domain/audio.go`: add `console_aux` to both input cable kind lists; `Console` gains `AuxSocketCount` (`aux_socket_count`) and `AuxInputPositionX/Y`
- [ ] 1.4 `db/consoles.go`: scan the pair, resolve a NULL to below LOCAL (design D3) and fill `AuxSocketCount` from the model; `UpdateConsole` writes the pair; `DeleteConsole` clears `console_aux` cables; tests for the resolved default and for delete

## 2. API

- [ ] 2.1 `api/audio_patch.go`: `console_aux` in `inputNodeOutputPortCount` / `inputNodeInputPortCount`, bounded by the aux socket count; `isCablelessInputEdge` covers `console_aux → channel`; kind error messages list it
- [ ] 2.2 API tests: cable to Aux in 1 saved; Aux in 7 on an M32 refused; any port on X32 Core refused; the hop into an ordinary channel and into an aux strip saved with no cable item; a cable item on the hop refused; local usage unchanged

## 3. Model switch

- [ ] 3.1 `domain.LocalUse.Aux` and its query in `db/desk_switch.go`
- [ ] 3.2 `service/deskmap.go`: "Aux sockets" figure when either model has sockets; Left out line for aux use past the new count, including a switch to Generic
- [ ] 3.3 Tests: X32 → X32 Core with Aux in 1 and 3 patched (figure 2/6 → 2/0, both listed); X32 → X32 Rack shows no aux line

## 4. Printed graph

- [ ] 4.1 `service/audio_graph.go`: the aux node (title `<desk> aux`, badge AUX, rows, footer `N aux sockets - M used`) at the resolved position when the model has sockets
- [ ] 4.2 Test: an X32 desk with three patched sockets prints the node and footer, and a Core desk prints none

## 5. Export

- [ ] 5.1 `service/console_export.go`: `resolve` maps `console_aux` on the exported X32 · M32 desk to `DeskPort{Socket: "aux"}`
- [ ] 5.2 `consolefile/x32.go`: `inputCode` `aux` → 161+Index, `headampIndex` → −1; aux strip on an aux socket sets `/auxin/NN/config` source to 33+Index (and its stereo partner); otherwise keep the template source and the reworded Changed notice
- [ ] 5.3 Tests: stereo aux strip on Aux in 3–4 → sources 35/36; Aux in 3 → channel 20 is user-in 163; stagebox-fed aux strip keeps its source and the notice; no headamp written for an aux socket

## 6. Frontend graph logic

- [ ] 6.1 `types/index.ts`: `console_aux` in the input cable kind unions; `Console.aux_socket_count`, `aux_input_position_x/y`; `DeskModel.aux_sockets`
- [ ] 6.2 `lib/inputGraph.ts`: `consoleAuxPorts`, `auxJackCount`, the kind in `PortRef`, `resolvePortRef`, `nodeKindLabel` ("Aux socket"), `nodeName`, `isCablelessEdge`, `portsConnectable`
- [ ] 6.3 `lib/patchSheet.ts`, `lib/inputSignalFlow.ts`, `ChainLine.tsx`: the `<desk> aux in N` hop
- [ ] 6.4 Vitest for each of 6.2–6.3

## 7. Inputs canvas

- [ ] 7.1 `InputGraphCanvas.tsx`: the aux node in the layout at its served position, `AuxJackNode` (NodeShell titled with the desk's name, badge LOCAL AUX, SplitPortRow per socket, over past the count), drag writing `aux_input_position_x/y`, search on desk name or "aux"
- [ ] 7.2 `InputFlowInspector.tsx` / `AudioInputsTab.tsx`: the `console_aux` selection, inspector titled `<desk> · aux sockets`
- [ ] 7.3 Render tests: X32 desk draws the node with six rows and the LOCAL AUX badge; X32 Core draws none; a kept cable past the count draws over

## 8. Phone sheet

- [ ] 8.1 `lib/mobileChannelList.ts`: `ChannelRouting.panel`; `resolveChannelRouting` and `computeRoutingSave` for stagebox, local and aux alike
- [ ] 8.2 `MobileChannelEditSheet.tsx`: Into (stageboxes, then an optgroup per desk with its local in / aux in entries) + Jack (In N / Local N / Aux N)
- [ ] 8.3 Tests: existing stagebox and direct-source cases unchanged; local and aux resolve and save; render shows the grouped Into and opens a local-fed channel filled

## 9. Close out

- [ ] 9.1 Gates (backend and frontend) and golangci-lint from the scratchpad
- [ ] 9.2 Verify against a copy of the real DB in /tmp: migration applies, a console reads its aux count and resolved position
- [ ] 9.3 Independent review against the specs
- [ ] 9.4 ROADMAP.md: D9 marked ✅ with the Fixed note (decisions, unverified socket counts, the phone gap found and closed); drop it from What remains
