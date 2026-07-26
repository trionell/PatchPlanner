# Data Model: Audio patch shell, second pass

**Feature**: `024-patch-shell-fixes` | **Date**: 2026-07-26

One table changes. Everything else in this slice is behaviour or presentation
over data Slice 23 already created.

---

## `event_consoles` — four new columns

Migration `043_console_local_positions`.

| Column | Type | Default | Meaning |
|---|---|---|---|
| `local_position_x` | `REAL NOT NULL` | `260` | The socket panel's x on the **output** canvas |
| `local_position_y` | `REAL NOT NULL` | `320` | The socket panel's y on the **output** canvas |
| `local_input_position_x` | `REAL NOT NULL` | `260` | The socket panel's x on the **input** canvas |
| `local_input_position_y` | `REAL NOT NULL` | `320` | The socket panel's y on the **input** canvas |

The existing `position_x` / `position_y` and `input_position_x` /
`input_position_y` keep their meaning: where the desk's own node sits. Those
nodes are pinned to their lane, so only their `y` is ever read or written; the
two `x` columns stay unused rather than being quietly repurposed
(research.md R7).

### Up

```sql
ALTER TABLE event_consoles ADD COLUMN local_position_x REAL NOT NULL DEFAULT 260;
ALTER TABLE event_consoles ADD COLUMN local_position_y REAL NOT NULL DEFAULT 320;
ALTER TABLE event_consoles ADD COLUMN local_input_position_x REAL NOT NULL DEFAULT 260;
ALTER TABLE event_consoles ADD COLUMN local_input_position_y REAL NOT NULL DEFAULT 320;
```

No backfill statement is needed: the defaults apply to existing rows as the
column is added, and they are the values a new desk wants too.

### Down

```sql
ALTER TABLE event_consoles DROP COLUMN local_input_position_y;
ALTER TABLE event_consoles DROP COLUMN local_input_position_x;
ALTER TABLE event_consoles DROP COLUMN local_position_y;
ALTER TABLE event_consoles DROP COLUMN local_position_x;
```

Dropped in reverse order of addition. SQLite supports `DROP COLUMN` from 3.35;
migration 042 already relies on it (it drops `events.output_mixer_position_y`).

### Domain

`domain.Console` gains, alongside the existing four position fields:

```go
LocalPositionX      float64 `json:"local_position_x"`
LocalPositionY      float64 `json:"local_position_y"`
LocalInputPositionX float64 `json:"local_input_position_x"`
LocalInputPositionY float64 `json:"local_input_position_y"`
```

`consoleColumns`, both scanners, `CreateConsole` and `UpdateConsole` extend to
carry them, in the order above.

---

## Graph nodes — a second node per desk

No stored change; this is what the canvases derive.

Before this slice each desk produced **one** node per graph, carrying both its
strips and its local jacks as one-sided ports. After it, each desk produces up
to **two**:

| Graph | Node | Lane | Ports | Position from |
|---|---|---|---|---|
| Input | the desk | Channels (pinned x) | one `channel` port per assigned channel (2 when stereo), input side | `input_position_y` |
| Input | its sockets | Processing (free) | `local_input_count` × `console_local` in **and** out | `local_input_position_x/y` |
| Output | the desk | Sources (pinned x) | one `mixer` port per assigned output (2 when stereo), output side | `position_y` |
| Output | its sockets | Processing (free) | `local_output_count` × `console_local` in **and** out | `local_position_x/y` |

The sockets node is omitted entirely when the relevant count is `0` (FR-014).

### Layout node identity

The canvases key layout entries and in-memory position overrides by
`"{kind}:{id}"`. That string now has to distinguish two nodes per desk, so:

| Graph | Node | Layout key |
|---|---|---|
| Input | the desk | `channel:{consoleID}` |
| Input | rows with no desk | `channel:0` |
| Input | its sockets | `console_local:{consoleID}` |
| Output | the desk | `mixer:{consoleID}` |
| Output | rows with no desk | `mixer:0` |
| Output | its sockets | `console_local:{consoleID}` |

A desk node is keyed by the kind of port it carries, which is honest — the input
desk node *is* that desk's channel rail. Console ids start at 1, so neither
`channel:0` nor `mixer:0` can collide with a desk. `console_local:{id}` now names
the sockets node, which is what its ports were always called.

### Zones

`nodeZone` changes on both graphs for one kind:

| Graph | Kind | Before | After |
|---|---|---|---|
| Input | `console_local` | `channels` | `processing` |
| Output | `console_local` | `sources` | `processing` |

### Port labels

`consoleLocalPorts` gains distinct labels per side, so a hop reads the way a
stage box's does:

| Graph | In side | Out side |
|---|---|---|
| Input (`local_input_count`) | `Local in 1` … | `To desk 1` … |
| Output (`local_output_count`) | `From desk 1` … | `Local out 1` … |

The label on the side the planner cables to keeps the "local in"/"local out"
wording the sheet and the printed sheets already use; the desk-routing side says
which direction the desk's own routing goes, so the two columns cannot be
mistaken for each other.

`patchSheet.ts` resolves a `console_local` hop's text from the desk's name and
the port index and does not read these labels, so the chain cell and the print
sheets are unaffected (`{desk} local in {n}` / `{desk} local out {n}`).

---

## Derived values

| Value | Rule | Changed? |
|---|---|---|
| Which hop is a physical cable | `isCablelessEdge` / `isCablelessToKind`, unchanged from Slice 23 | no |
| A desk's capacity warning | `input_count`/`output_count` > 0 and usage above it | no |
| A cable's colour on the output graph | `derivedCableColor`, backward walk to the mixer port through same-index pass-throughs | no — `console_local` already pairs same-index |
| An output chain's continuation past a node | `walkFromPort` | **yes** — gains a `console_local` branch (research.md R9) |
| A channel chain's continuation past a node | `upstreamPort` | no — already same-index for every non-device kind |
| A row's desk on save | falls back to the event's only desk when nil | **yes** — update now matches create |

---

## Guards

Unchanged from Slice 23, restated because two of them now have a second node to
be true about:

- Reducing `local_input_count` or `local_output_count` below the highest patched
  jack index is refused with `409` and the conflicting jacks named (FR-024).
- Deleting a desk clears every `input_cables` and `output_cables` row naming its
  `console_local` ports in one transaction and reports the count; `console_id` on
  channels and outputs nulls out via `ON DELETE SET NULL` (FR-023).
- A cable endpoint naming `console_local` is validated against the desk's
  declared jack count for that graph's side.
