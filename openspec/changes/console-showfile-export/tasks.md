## 1. Templates and research gaps

- [ ] 1.1 Copy `showfiles/m32_default.scn` and `showfiles/lv1_clean_17.3.50.135.emo` into `backend/internal/service/consolefile/templates/` and embed them (`go:embed`); leave `showfiles/` untracked
- [ ] 1.2 Confirm the X32 user-routing tokens and source indices (`/config/routing/IN|OUT|AES50A|AES50B|CARD|PLAY` user blocks, `/config/userrout/in|out` source values for inputs, buses, matrices, mains, aux) against Maillot's protocol PDF; record them in design.md D3
- [ ] 1.3 Confirm the X32 send, bus-assign, matrix-send and `/bus/NN/grp` line shapes in the template; record them in design.md

## 2. The show model

- [ ] 2.1 `consolefile/show.go`: `Show` (strips, mixes, routes, output sources, input patch, recorder) and `BuildShow(data, consoleID, ports)` from the audio patch and Slice 48 data
- [ ] 2.2 Port map parsing and resolution: stagebox → desk input via the cable chain (`inputSourcesByChannel`), 48 V from the source
- [ ] 2.3 Preview figures and lines (Left out / Changed / No input / No port) from the same pass; name cutting at the engine's length; nearest-colour mapping with merge detection
- [ ] 2.4 Table tests per engine: over rows and mixes left out, refused routes left out, X32 direct-out Fed by left out, names cut, colours merged, unknown LV1 device 48 V, no input, no port

## 3. The X32 · M32 writer

- [ ] 3.1 `x32.go`: parse the template into ordered lines, replace owned lines by path, emit `\n`; line count equals the template's
- [ ] 3.2 Channels and aux (`config`, links, `grp`), mains, buses, matrices, DCAs and mute groups (names, colours, links)
- [ ] 3.3 Routes: LR/M/C assigns, bus sends on at 0 dB, bus → LR/M/C, matrix sends at 0 dB, DCA/mute bitmaps
- [ ] 3.4 Input patch through user in; outputs through user out from Fed by; headamp 48 V per mapped port
- [ ] 3.5 Recorder: card tracks via user out; soundcheck playback via `PLAY`
- [ ] 3.6 Golden test from a fixture event; parse the output back and assert the owned lines read from the file (not recomputed); break one rule and see it fail

## 4. The LV1 writer

- [ ] 4.1 `lv1.go`: copy the embedded template to a temp file, open with `modernc.org/sqlite`, check the schema against the registry (5.2 only), one transaction, `VACUUM INTO`, return the bytes, remove both files
- [ ] 4.2 Names, colours (param 592, default 13 absent), stereo (num_inputs, plug 4cc, presets)
- [ ] 4.3 Assignments: mains, groups (to higher groups only), DCAs, mute groups, group/Mon → matrix; Mon and FX sends at 0 dB
- [ ] 4.4 Devices per mapped slot (SG4000, SG1000, LV1 Classic; Other without 48 V), device YAML with phantom on patched inputs only; input and output routes
- [ ] 4.5 Recorder as a generic 64/64 I/O device with its routes (unverified — flagged for the user's LV1 test)
- [ ] 4.6 Tests: reopen, `PRAGMA integrity_check` ok, read names/colours/assignments/routes/phantom back, colour survives beside every other write, unknown schema refused

## 5. API

- [ ] 5.1 `GET /events/{id}/console-export` and `/console-export/preview` (console, ports); Generic → 409 with the dialog's sentence; unknown console 404
- [ ] 5.2 Tests: content type, file name `<event>-<desk>.<ext>`, viewer allowed, stranger 403, preview shape
- [ ] 5.3 Backend gates

## 6. Frontend

- [ ] 6.1 Export to console button beside Export PDF in `AudioPatchShell`; phone overflow row
- [ ] 6.2 The dialog (`ui/Dialog` with footer): desk statement (name · model, file · version, "1 of 2" note), Generic state with Open Rig / viewer sentence
- [ ] 6.3 Port rows per engine; remembered per viewer per event × desk × engine (localStorage, try/catch)
- [ ] 6.4 Figures and preview lines from the server (A3/B1 box), Checking … while in flight, inline error disables the primary
- [ ] 6.5 Download by navigation; primary "Download scene" / "Download session"
- [ ] 6.6 Phone: the same dialog at 44 px targets
- [ ] 6.7 Render tests: Generic state per role, port rows per engine, preview lines; frontend gates

## 7. Close-out

- [ ] 7.1 Real data on a `/tmp` copy: export the wedding's M32R scene and an LV1 session
- [ ] 7.2 `reviewer` against specs and mockup; fix findings
- [ ] 7.3 The user loads a generated `.scn` in M32-Edit and an `.emo` in LV1 17.3 (including the recorder device) before the slice is closed
- [ ] 7.4 ROADMAP Slice 49 record; archive before any merge (merge is the user's call)
