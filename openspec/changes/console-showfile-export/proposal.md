## Why

An event's audio plan leaves PatchPlanner only as a PDF, so the engineer re-types every name,
colour, link, group, DCA, send and patch into the desk before soundcheck. With Slice 47 a desk
has a model and with Slice 48 it has mixes, routes, Fed by and a recorder — everything a
console's own file holds. This slice writes that file.

## What Changes

- **Export to console** beside Export PDF on the audio tabs (and the phone's overflow), for every
  role including viewers. It exports the **selected desk** (B6).
- **The desk's model decides the file**: X32 · M32 models write a scene (`.scn`, firmware 4.0
  template); LV1 models write a session (`.emo`, LV1 17.3 template, schema 5.2). Generic exports
  nothing and says to pick a model in Rig. No format picker.
- **The dialog asks only for ports**: each stagebox the desk uses → X32 Local / AES50-A /
  AES50-B / Card, or an LV1 I/O slot plus device model (SG4000, SG1000, LV1 Classic, Other).
  Remembered per viewer per event × desk × engine in localStorage.
- **Written 1:1, nothing allocated**: channels and aux inputs (names, colours, stereo links),
  mains, subgroups/groups, monitors, FX sends, matrices, DCAs and mute groups in their Slice 48
  slots; routes become assigns and sends **on at 0 dB**; Fed by becomes each output's source;
  the input patch and 48 V; the recorder (X32 card per track; LV1 a generic 64/64 I/O device).
- **X32 · M32 always writes user in / user out**, so any patch exports as drawn; user out may
  carry any mix (user, 2026-10-18).
- **The preview states what the file cannot hold** before the download, in A3/B1's words: Left
  out (rows and mixes flagged over, routes the engine refuses, X32 direct-out Fed by), Changed
  (names past 12 characters on X32, colour merges, 48 V on an unknown LV1 device), No input,
  No port. Downloading is never blocked.
- File name `<event>-<desk>.<scn|emo>`.

## Capabilities

### New Capabilities

- `console-showfile-export`: what the export writes for each engine, the port mapping, the
  preview's lines, the entry points and roles, and the templates it is built from.

### Modified Capabilities

None.

## Impact

**Backend.** New package `internal/service/consolefile/` (neutral show model built from the
audio patch, an X32 scene writer over an embedded template, an LV1 session writer over an
embedded SQLite template with a per-schema mapping registry); `api/rental.go` (or a sibling)
gains `GET /events/{id}/console-export` and `/console-export/preview`. Templates embedded with
`go:embed` from `showfiles/m32_default.scn` and `showfiles/lv1_clean_17.3.50.135.emo`.

**Frontend.** An export button in `AudioPatchShell` and the phone overflow; a `ui/Dialog` (A1,
A2) with the desk statement, the port rows, the figures and the preview lines; download by
navigation like `audioExportPdfUrl`.

**`design/`.** None new: A1–A3/B1 (Slice 47) cover the dialog and the preview; B3 covers the
read-only desk statement.

**Depends on** Slices 47 and 48.

## Constitution Check — Principles I–V

**I. Domain-First Data Model.** Unchanged; the export reads the model Slices 47–48 built and stores
nothing but a per-viewer port memory in the browser.

**II. Extensibility by Design.** A new LV1 release is a new embedded template plus one registry
entry; the writer refuses a schema it has no mapping for. The X32 writer replaces owned lines in a
complete template, so unknown lines stay the factory's.

**III. Full-Stack Monorepo Architecture.** The writers are pure Go in `service/`; the API streams the
bytes; the frontend only links to it.

**IV. Inventory-Driven Rental Workflow.** Unaffected.

**V. Pragmatic Simplicity.** No format choice, no allocation, no levels beyond 0 dB, no import, no
OSC push. One LV1 version until another template ships.

### Declared deviation

The LV1 recorder device is written without a reference session (none exists yet); the user accepted
verifying it on LV1 once built (2026-10-18). Every other LV1 fact was read from a saved session.
