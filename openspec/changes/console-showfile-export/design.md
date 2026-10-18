# Design — console showfile export

> The approved mockup is `mockup.html` revision 4 (https://claude.ai/artifact/5U53CN6PgAEJfFYogwfzHx,
> approved 2026-10-18). Depends on Slice 47 `desk-models` and Slice 48 `desk-routing`.

## Context

Export one console of an event as a file the desk loads: an `.scn` scene for the
Behringer X32 / Midas M32 family, or an `.emo` session for Waves eMotion LV1. Both
writers start from a template shipped in the binary and replace only what PatchPlanner
owns, so everything else in the file is the console's factory default.

Templates and the reference sessions they were learned from live in `showfiles/` (user
supplied, 2026-10-17):

| File | What it is |
|---|---|
| `m32_default.scn` | X32/M32 factory scene, firmware 4.0, 2,118 lines — the X32 template |
| `lv1_clean_17.3.50.135.emo` | blank LV1 17.3 session (schema 5.2), no devices — the LV1 template |
| `lv1_colors_17.3.50.135.emo` | strip N carries palette index N, named after its colour |
| `lv1-colors.webp` | the 32-swatch palette, row-major |
| `lv1_diff_17.emo` | clean + names, colour, stereo, group/DCA/mute/main assigns, Mon send, SG4000 + 48V |
| `lv1_outdiff_17.emo` | clean + SG4000 + SG1000, output patch from Mon/Group/Main/Matrix/direct |
| `lv1_outdiff__with_classic_17.emo` | the above + an LV1 Classic local I/O |
| `lv1_groups_17.emo` | clean + Group 1→2, Group 3 off Main, Group 4/Mon 1→Matrix, ch 1→FX 1 |
| `PP_probe_v17.emo`, `screenshots/` | the first hand-built probe and what LV1 showed for it |

Every LV1 fact below was read from those files by `sqldiff` against the clean template,
not taken from documentation — there is none.

## X32 / M32 scene (`.scn`)

Source: P.-G. Maillot, *Unofficial X32/M32 OSC Remote Protocol* v4.09, appendix
pp. 131–138, confirmed against `m32_default.scn`. ASCII, `\n`, one OSC path per line,
header `#4.0# "<name>" "" %000000000 1`. Same node table on every X32 and M32 model:
32 ch, 8 aux in, 16 bus, 6 mtx, 8 DCA, 6 mute groups. A partial scene is not known to
load, so the writer always emits the full template with owned lines replaced; the
output has the template's line count.

| Owned line | Value domain |
|---|---|
| `/ch/NN/config "<name>" <icon> <colour> <src>` | name ≤ 12 chars; colour `OFF RD GN YE BL MG CY WH` (+`i` inverted); src 0 off, 1–32 In, 33–38 Aux… |
| `/config/chlink` | 16 × ON/OFF, pairs 1-2 … 31-32 — odd–even only |
| `/config/buslink`, `/config/mtxlink` | 8 / 3 pairs, odd–even only |
| `/ch/NN/grp %<8 DCA bits> %<6 mute bits>` | group 1 is the rightmost bit |
| `/dca/N/config "<name>" <icon> <colour>` | |
| `/bus/NN/config`, `/mtx/NN/config`, `/main/st/config`, `/main/m/config` | name, icon, colour |
| `/ch/NN/mix ON <fader> <st> <pan> <mono> <mlevel>` | LR / mono assign |
| `/ch/NN/mix/MM ON <level> …` | bus send on/off |
| `/auxin/NN/config "<name>" <icon> <colour> <src>` | aux in 1–8 (7–8 are USB L/R in the template); same shape as `/ch/NN/config` |
| `/config/auxlink` | 4 pairs, odd–even only |
| `/config/routing/IN` | 4 input blocks of 8 + AUX: `AN1-8…`, `A1-8…A41-48`, `B…`, `CARD…`, or user in (block token not yet verified against Maillot) |
| `/config/userrout/in` | 32 slots, one source per channel — used when a block is set to user in |
| `/config/userrout/out` | 48 slots, one source per output — used when an output block is set to user out |
| `/config/routing/AES50A|AES50B|CARD|OUT` | output blocks; OUT is 4 × 4 |
| `/outputs/main/NN <src> <tap> <inv>` | src 0…76: Main L/R, M/C, Bus 1–16, Mtx 1–6, direct outs … |
| `/headamp/NNN <gain> ON|OFF` | 000–031 local, 032–079 AES50-A 1–48, 080–127 AES50-B 1–48 |

Colour: nearest of the 8 desk colours by hex distance from `channel_colors`.

## LV1 session (`.emo`)

Plain SQLite. Version in `info.schema_version_major/minor` (16.5 → 5.1, 17.3 → 5.2) and
`file_properties` "Application Version". The writer refuses any schema it has no
mapping for. A registry `map[schemaVersion]lv1Mapping` carries the ids below, so a new
LV1 release is a new template plus a new entry. Shipped: 5.2 only.

Write path: copy the embedded template to a temp file, open with `modernc.org/sqlite`,
one transaction, `VACUUM INTO` a second temp file, return its bytes, delete both.

**Strips.** `object(id, obj_type, obj_index)`, `cluster_type`: 0 Input (80), 1 Group (16),
2 Fx aux (8), 3 Main, 6 Matrix (8), 10 Inputs (I/O side), 11 Outputs (I/O side),
12 DCA (16, default name "Link N"), 13 MuteGroups (8), 25 Mon (24, new in 5.2).
The template has only snapshot −1 (Active).

| Fact | Where (schema 5.2) |
|---|---|
| Name | `snapshot_chainer.name` for (chainer = strip object, snapshot −1). Mute groups have no row. |
| Colour | `snapshot_chainer_params` (strip, −1, **592**, palette index). Index 13 (teal) is the default and is stored as no row. |
| Stereo input | `chainer.num_inputs = 2`, **and** the strip's three `plug` rows go `CFLM/CDYM/MQ4M` → `CFLS/CDYS/MQ4S`, **and** their `snapshot_plugin.preset_id` move to the stereo default presets (the ones stereo strips already use — ids 4/5/6 in the template). Triggers keep `plugin_preset.ref_count`. |
| Main / group assign | `snapshot_assignment` (snap −1, src = strip, src_section_type 7, src_control_id 2, src_asgn_type 1, dst = Main/Group object, dst_asgn_type 0, rest −1/0). The template has one row per input → Main; deleting it turns L/R off. |
| DCA / mute assign | `snapshot_assignment` (src = strip, all src fields −1, dst = DCA/MuteGroup object, dst_asgn_type 2). |
| Group → group | same row as Main/group assign with dst = the later group. Feed-forward only: group N may route to groups N+1…last (user-confirmed in LV1 17.3). |
| Group / Mon → matrix | `snapshot_assignment` (src = strip, src_section_type 7, src_control_id **0**, src_asgn_type 1, dst = Matrix object, dst_section_type 0, dst_section_index 0, dst_asgn_type 0). From `lv1_groups_17.emo`. |
| FX send | params `PARAM_AUX_SEND_ONOFF_<n>` / `PARAM_AUX_SEND_GAIN_<n>`, n = FX aux 0–7. Gain is the fader value in **dB** (the user set +0.5 dB by hand; the Mon send was 0.0 dB). Sends are written at 0.0 dB. |
| Mon send | params `PARAM_AUX_SEND_ONOFF_<8+n>` = 1, `PARAM_AUX_SEND_GAIN_<8+n>` = 0 dB (FX aux 1–8 take 0–7). |
| Input patch | `routes` src (10, io_bank·8+slot, −1, −1, device port, −1, −1) → dst (0, strip, 0, A=0/B=1, L=0/R=1, −1, 0), status A 0 / B 1. |
| Output patch | `routes` src (strip cluster 25/1/3/6/0, strip index, −1, −1, L/R, −1, −1) → dst (11, io_bank·8+slot, 0, −1, device port, −1, 0), status 0. Cluster 0 is a channel direct out. |
| I/O device | `device` (mac, io_bank, assign = slot, in/out counts), `device_iobox` (device_id = model, vendor_id), `device_name` (`00:00:00:00:00:0N#0`, "<Model>-N"), `iom_chunks` (YAML), `snapshot_iom` (snap −1, bank, slot → chunk). LV1 does **not** create a device for a patched empty slot; the writer must. |
| 48V | inside the device's YAML chunk, one entry per preamp. Set only on a device input that is patched to a channel (LV1 won't enable it otherwise). |

**Known device models** (vendor_id, device_id, in/out, 48V key):

| Model | vendor | device | in / out | 48V map |
|---|---|---|---|---|
| SG4000 | 19 | 0 | 40 / 28 | `SG4000.mic_phantom_map`, 32 preamps |
| SG1000 | 19 | 1 | 10 / 10 | `SG1000.mic_phantom_map`, 8 preamps |
| LV1 Classic | 21 | 4 | 18 / 18 | `liverack.line_in_phantom_map` |

The chunk text is copied verbatim from the reference sessions with only the phantom
values changed.

**Palette** (index → hex, sampled from `lv1-colors.webp`):
0 `#5d99a0` 1 `#448aff` 2 `#66a038` 3 `#1a8d68` 4 `#91c2c9` 5 `#5e6f82` 6 `#f7bb42`
7 `#ee0175` 8 `#2a62fc` 9 `#39c9ff` 10 `#8ff7ff` 11 `#146981` 12 `#87a4d1` 13 `#0fa1ab`
14 `#01e777` 15 `#77f5b6` 16 `#8b52c0` 17 `#ee9a99` 18 `#f3fa1b` 19 `#fe4f4f`
20 `#e9e6ea` 21 `#a40000` 22 `#8dff00` 23 `#a0a0a0` 24 `#fb7a14` 25 `#ff00ff`
26 `#ce92db` 27 `#f16192` 28 `#857617` 29 `#946b7b` 30 `#a04282` 31 `#7d4dff`

**Trap.** A param id LV1 does not accept on a strip makes it drop *every* param on that
strip. The probe's ch 1–2 lost their colour that way. Write only the param ids listed
here, and test the colour survives next to every other write.

**Block vs user routing.** X32/M32 routes inputs and outputs in blocks of 8. A
stagebox port lands on a channel only if its whole block of 8 lines up. User in/out
(`/config/userrout/in|out`) lifts that: each block set to user in/out takes one source
per slot from the user table. Raised by the user 2026-10-18 ("Perhaps it's just simplest
to always pick user in/out?"). Leaning: always write user in/out, so any patch the event
draws exports as drawn; to be settled in this change's proposal. The template's
`/config/routing/CARD` (recording feed, also blocks of 8) and `PLAY` lines belong to
device-to-device routing — see ROADMAP.

## Pairing rules

- X32 · M32: stereo channels, buses and matrices are odd–even only.
- LV1: a stereo input is one strip; a stereo Mon or Matrix takes two consecutive free
  slots of either parity.

## Decisions

### D1. One neutral show model, two writers

`service/consolefile/show.go`: `BuildShow(data, consoleID, ports)` reads the audio patch
(channels, sources, cables, Slice 48 mixes, routes, Fed by, recorder tracks) for one desk and
produces slot-numbered, engine-ready records: strips (pool, number, width, name, colour), mixes
(kind, slot, width, name, colour), routes as (source, destination) pairs, output sources, input
patch (desk port → strip, 48 V) and recorder tracks. The preview lines and figures come from the
same pass, so what the dialog says is what the writer does (P6). `x32.go` and `lv1.go` take a
`Show` and return bytes. *Alternative:* each writer reading the database — two derivations of one
plan.

### D2. Ports

`ports` is the dialog's map, sent as a query parameter: per stagebox id, X32 `local|a|b|card` plus a
start offset, or LV1 `bank.slot` plus a device model; absent means not connected. The input patch is
resolved by following each channel's cable chain to a stagebox port (reusing
`inputSourcesByChannel` in `audio_pdf_sections.go`), then through the map to a desk input.

### D3. X32 · M32

Always user in / user out (user, 2026-10-18): `/config/routing/IN` blocks select the user-in blocks
and `/config/userrout/in` holds one source per channel (32 slots); output, AES50 and card blocks
select user-out blocks and `/config/userrout/out` holds one source per slot (48), which may be any
mix, matrix or main (user: "Yes, any mix"). The token and source values are confirmed against
Maillot's protocol PDF before the writer is coded, and a golden file pins them. Routes: channel →
LR/M/C on `/ch/NN/mix`; channel → bus as `/ch/NN/mix/MM ON +0.0` (0 dB, user 2026-10-18); bus →
LR/M/C on `/bus/NN/mix`; bus/LR/M/C → matrix sends at 0 dB; DCA and mute bitmaps on `/ch/NN/grp` and
`/bus/NN/grp`. Aux inputs on `/auxin/NN/config` and `/config/auxlink`. Recorder: record tracks through
user-out slots on the card block; soundcheck playback through the `PLAY` routing.

### D4. LV1

The schema 5.2 mapping above, plus Slice 48's kinds: mains, groups (group → higher group only), Mon
and FX aux sends (`PARAM_AUX_SEND_ONOFF/GAIN_n` at 0 dB), matrix sources. The recorder is a **generic
64/64 I/O device** in a free bank slot, routed from its record sources and to its playback channels
(B input for soundcheck); unverified — checked on LV1 with the user once built (2026-10-18).

### D5. API and download

`GET /events/{id}/console-export?console=<id>&ports=…` streams the file with
`contentDisposition`; `GET …/console-export/preview` with the same parameters returns
`{figures, lines}`. Viewer and up (`RequireEventAccess`), like every export. The dialog re-requests
the preview when a port changes and downloads by navigation.

### D6. Templates

`showfiles/m32_default.scn` and `showfiles/lv1_clean_17.3.50.135.emo` are copied into
`service/consolefile/templates/` and embedded; `showfiles/` itself stays untracked.

## Risks / Trade-offs

- [X32 user-routing token values come from a document, not a saved scene] → golden test plus the
  user loading a generated scene in M32-Edit before close-out.
- [LV1 recorder device is inferred] → verified with the user on LV1; isolated in one function.
- [An unknown LV1 param id drops a strip's params] → write only registry ids; a test reopens the
  session and checks colour survives next to every other write.
