# PatchPlanner

An AVL (Audio, Video, Lighting) event planning tool for live productions. Plan patch lists, lighting rigs, DMX assignments, and generate rental orders — all in one place.

---

## Features

- **Events** — Create and manage events with date, venue, and notes
- **Audio Patch (Inputs)** — Build full input patch lists: channel number, name, signal type, preamp connector, stagebox routing, stage multicore, microphone model, cable and mic stand picked straight from the rental catalog (concrete items with lengths, e.g. "Mikrofonkabel — 4m"), 48V phantom power, mix-group routing (per-event groups with a built-in LR main, the default for new channels), DCA membership picked from per-event DCAs, and a console channel-strip color per channel — groups and DCAs carry colors too, all from a configurable palette
- **Mono/Stereo Channels** — Any input or output can be marked stereo: a second, independently-patched physical connection (its own stagebox/multicore route — not required to be the neighboring channel or even the same box, e.g. a crowd-mic pair on opposite sides of the stage), with per-input mixer behavior (one console channel strip vs. two linked strips) and doubled rental counts for per-side equipment; two-channel devices (a DI box, an amplifier) stay single-counted
- **DI Cabling** — DI-type channels pick a source cable (source → DI) alongside the existing DI → preamp cable, closing a rental-order gap; a stereo DI channel chooses between two individual source cables or one 3.5 mm TRS → 2×TS splitter, which changes whether that cable counts once or twice
- **Audio Output Signal-Flow Graph** — An interactive Sankey-style canvas replaces the flat destination/amplifier/speaker shape: the console's output channels and every stagebox are output-only nodes pinned to a left rail, input-only devices (speakers, IEMs) are pinned to a right rail, and devices with both an input and an output side (amplifiers, controllers, distros) sit free-floating in the middle, dragged into whatever layout matches the real rig. Cables are drawn port-to-port with a live catalog picker, modeling real multi-hop and fan-out rigs (mixer → controller → amplifier → sub + sub → top) as well as the trivial local-out-to-speaker case; a basic flat table of every device and cable stays available alongside the graph
- **Shared Output Devices** — Declare a device once per event (a multichannel headphone amp feeding several IEM mixes, a distro rack) with its own port counts and connector types per side, then wire it into the graph — it lands on the rental order exactly once no matter how many cables reference it
- **Stage Multis as Real Pass-Throughs** — A stage multi's channels each connect independently in the graph — different sources, different destinations per channel — and its own built-in wiring never prompts for a cable pick or adds a rental line; only a channel's genuine onward run does
- **Lighting Rig** — Add fixtures (one by one or in bulk batches with shared settings, auto-incrementing console fixture IDs, and sequential DMX addresses), assign them to truss sections, configure power connections (grid or daisy-chain), set DMX universe/address and channel mode (catalog-defined modes are offered right in the add dialog), give every fixture its GrandMA fixture ID (duplicates flagged), auto-assign DMX addresses in sequence
- **Rental Order** — Per-event summary of all rented equipment, derived automatically from the plan (mics, DI/IEM, stageboxes, multicores, amplifiers, speakers, cables, mic stands, fixtures) plus manual line items for anything else; flags lines that exceed the renter's stock. Which catalog categories feed the cable/stand pickers is itself data: each category on the Inventory page carries an editable picker role
- **Excel Export** — One click produces a copy of LL.xlsx with the order quantities filled into the *Antal Ljud* / *Antal Ljus* columns at the right rows, ready to send to the renter unmodified; lines that can't be placed are reported, never silently dropped
- **Owned Gear & Equipment Lists** — A personal catalog of equipment you own (never on the rental order), plannable per event with quantities and notes; the Equipment tab shows everything beyond the patch and rig: owned gear plus rented extras
- **Configurable Reference Data** — Every planning vocabulary (signal types, preamp connectors, signal/speaker cable types, output types, mic stands, power connectors, truss types) is stored data, editable on the Settings page: add values for new gear, rename labels, delete unused ones (values in use by a plan are protected). Lighting fixture models carry DMX mode definitions (name + channel count) that auto-fill the channel count when patching
- **Inventory** — Full catalog imported directly from the LL.xlsx price list (308 items across 27 categories: audio, lighting, rigging)
- **Print Sheets** — Every planning tab (input patch, output patch, lighting rig) has a Print button that produces a clean paper/PDF sheet via the browser print dialog: event header, black-on-white table, repeating column headers, no UI chrome
- **Signal Flow** — A read-only per-channel trace on its own event tab: inputs read source → cable → stagebox/multi channel → console; outputs read console → cable → node → cable → node → … → destination, walking the same graph the canvas edits, branching when a device fans out to more than one destination. Incomplete routing is flagged so patching errors are caught before load-in, and the view prints like the sheets

---

## Requirements

| Tool | Version |
|------|---------|
| Go   | 1.22+   |
| Node | 18+     |
| npm  | 9+      |

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd patcherPlanner
```

### 2. Start the backend

```bash
cd backend
go run ./cmd/main.go
```

The backend:
- Starts on **http://localhost:7331**
- Creates `backend/patchplanner.db` (SQLite) on first run
- Runs all database migrations automatically

Configuration (all optional, via environment variables):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PATCHPLANNER_ADDR` | `:7331` | HTTP listen address |
| `PATCHPLANNER_DB` | `./patchplanner.db` | SQLite database file |
| `PATCHPLANNER_MIGRATIONS` | `./migrations` | Migrations directory |
| `PATCHPLANNER_CORS_ORIGIN` | `http://localhost:5173` | Allowed dev-server origin |
| `INVENTORY_PATH` | `../LL.xlsx` | Price list used by the import endpoint |

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
npm install       # first time only
npm run dev
```

The frontend opens on **http://localhost:5173**

### 4. Import the inventory

Once the backend is running, import the equipment catalog from `LL.xlsx`:

```bash
curl -X POST http://localhost:7331/api/v1/inventory/import-xlsx
```

Or click **"Import from LL.xlsx"** on the Inventory page in the UI.

This imports **308 items** across **27 categories** (speakers, microphones, mixers, stageboxes, lighting fixtures, truss, cables, power distribution, and more).

> Re-running the import updates the catalog in place: matched items keep their identity (and every plan reference to them), prices and stock counts are refreshed, and items that disappeared from the price list are marked *discontinued* rather than deleted. Event data is never touched by an import.

---

## Usage Guide

### Creating an event

1. Go to **Events** in the sidebar
2. Click **New Event**
3. Fill in name, date, and venue
4. Click **Create**

### Building an audio patch

Open an event and navigate to the **Audio Inputs** or **Audio Outputs** tab.

- Click **Add Input / Add Output** to append a new row
- Each row is inline-editable — click any cell to edit
- Changes save automatically when you leave the field (on blur)
- Click the trash icon on a row to delete it

**Input columns:**
| Column | Description |
|--------|-------------|
| Ch# | Mixer channel number (auto-increments) |
| Name | Channel label (e.g. "Kick In", "Lead Vox") |
| Type | Signal type: mic, line, DI, return, aux |
| Connector | Preamp input connector type (XLR, Jack TS/TRS, RCA) |
| Stagebox | Which stagebox this connects to |
| SB Ch | Stagebox channel number |
| Multi | Which stage multicore cable |
| Multi Ch | Multicore channel number |
| Mic Model | Microphone model (e.g. "SM58") |
| Cable | Cable from the rental catalog (item + length, e.g. "Mikrofonkabel — 4m"); pre-upgrade type/length values show as read-only legacy text until re-picked |
| Source Cable | DI channels only: the source → DI cable, picked from the same cable catalog; on a stereo DI channel a second select chooses "two cables" (counted ×2) or "splitter" (one TRS→2×TS cable, counted ×1) |
| Stand | Mic stand from the rental catalog; legacy stand-type values show as read-only text until re-picked |
| 48V | Phantom power on/off |
| Width | Mono (default) or Stereo; a stereo input shows a second Mixer Behavior select — **Stereo channel** (one console number) or **Linked channels** (occupies its number and the next, e.g. "5–6") |
| Side B | Stereo channels only: the second physical connection's own stagebox/multicore routing, independent of side A — flipping to stereo defaults it to side A's route at the next channel as a one-time convenience, but it can be repatched anywhere (e.g. a crowd-mic pair through separate multicores) |
| Groups | Mix groups the channel routes to, picked from the event's groups (LR is built-in and the default; remove it per channel if needed) |
| DCA | DCA membership, picked from the event's DCAs (a channel can be in several) |
| Color | Console channel-strip color from the palette (Settings → channel_colors) |
| Notes | Free-text notes |

Groups and DCAs are managed in the two cards above the inputs table:
create, rename, recolor, or delete them there. LR can be recolored but
never renamed or deleted; deleting an assigned group/DCA asks for
confirmation and then just clears those assignments. Pre-upgrade free-text
DCA values were converted automatically into per-event DCAs.

**Output channel columns** (the mini-table above the graph — each row is one mixer output, contributing one or two ports to the graph below):
| Column | Description |
|--------|-------------|
| Out# | Output number |
| Name | Output label (e.g. "FOH L", "Monitor 1") |
| Type | Output type: FOH, monitor, sub, aux, matrix, stereo, IEM |
| Width | Mono (default) or Stereo — a stereo channel contributes two independent mixer ports (its own two separate physical connections), not one port that visually forks |
| Color | Console channel-strip color from the palette |
| Notes | Free-text notes |

**The signal-flow graph** (below the channel table): a Sankey-style
canvas where a line is a cable and a box is a device. The console (all
output channels' ports together) and every stagebox are output-only,
pinned to a left rail; devices with only an input side (speakers, IEM
packs) are pinned to a right rail; devices with both an input and output
side, and stage multis, sit free-floating in the middle — drag them
anywhere. Declare devices in their own card above the graph: name, item
(rental catalog or owned-gear), and each side's port count + connector
type (a side with 0 ports has no connector; an amplifier with XLR in and
Speakon out just sets both sides independently). Draw a cable by clicking
a free port, then a free port of the opposite direction — a catalog
picker pops up before the connection commits, *except* into a stage
multi's input side, which commits immediately with no picker (its own
built-in wiring is never a separately rentable cable). A basic flat table
of every device and cable is available as an alternative to the graph. A
port carries at most one cable; reducing a device's port count below its
number of attached cables is rejected until those cables are removed;
deleting a device or a stagebox/stage-multi removes every cable that
referenced it instead of being blocked.

Channel, group, and DCA colors show on the Audio Inputs/Outputs tabs, in
the Signal Flow view, and on the printed sheets (as a swatch next to the
channel number and tinted group/DCA names).

A stereo *input* channel doubles the rental count of everything picked
per side — microphone/source item, cable, stand — while a two-channel
device (a DI box) counts once regardless of width. A DI channel's source
cable is counted once, or twice on a stereo DI channel using two
individual cables (a splitter counts once either way). Output-side
rental counting has no doubling logic at all: a stereo channel's two
physical sides are two real, separate device/cable rows from the start
(wire each side to its own device to get "2"; wire both into one shared
device to get "1", counted once no matter how many cables reference it —
the same "one physical unit" rule as before, now falling directly out of
the graph instead of a width check).

### Building a lighting rig

Open an event and go to the **Lighting Rig** tab.

1. Click **Add Fixture**
2. In the dialog, select a fixture from the lighting inventory (or type a custom name)
3. Set the DMX channel mode and channel count
4. Click **Add**

For each fixture in the table you can set:
- **Fixture ID (FID)** — the console (GrandMA) patch number; optional, duplicates are flagged in the table but never blocked
- **Truss section** — which truss or position the fixture hangs on
- **Position** — index along the truss (for ordering)
- **Power** — `grid` (direct mains) or `chain` (daisy-chained from another fixture)
- **Power connector** — Schuko, CEE16, CEE32, PowerCon, PowerCon TRUE1, IEC
- **DMX universe** and **start address**
- **Channel mode** — the fixture's DMX personality (e.g. "Extended 16ch"); when the fixture's catalog model has defined modes (managed from the Inventory page), picking one auto-fills the channel count — mode edits later never rewrite already-patched rigs
- **DMX chain** — parent fixture in the DMX daisy-chain
- **Notes**

#### Auto-assigning DMX addresses

Click **Auto-assign DMX** to automatically fill in sequential addresses for all fixtures in the rig. Fixtures are assigned per universe, ordered by position index, starting at address 1. Each fixture takes up the number of channels defined by its channel count.

### Viewing the rental order

The **Rental Order** tab shows a summary of all inventory items referenced across the event (from both the audio patch and lighting rig — including every picked cable and mic stand), with quantities split by audio and lighting use, pricing per unit, and a total.

---

## Project Structure

```
patcherPlanner/
├── backend/
│   ├── cmd/main.go                  # Entry point — starts server on :7331
│   ├── internal/
│   │   ├── api/                     # HTTP handlers (one file per resource)
│   │   ├── db/                      # SQLite query functions
│   │   ├── domain/                  # Pure Go structs (no DB tags)
│   │   └── service/                 # Business logic (inventory import)
│   ├── migrations/                  # Versioned SQL migration files
│   ├── go.mod
│   └── patchplanner.db            # Created at runtime (gitignored)
│
├── frontend/
│   ├── src/
│   │   ├── api/                     # Typed fetch wrappers per resource
│   │   ├── components/
│   │   │   └── ui/                  # Button, Card, Table, Dialog, Tabs, etc.
│   │   ├── pages/                   # Dashboard, Events, EventDetail, Inventory
│   │   ├── hooks/                   # Custom React hooks
│   │   └── types/                   # TypeScript interfaces (mirrors backend domain)
│   ├── package.json
│   └── vite.config.ts
│
├── LL.xlsx                          # Renter's inventory price list (source of truth)
└── README.md
```

---

## API Reference

Base URL: `http://localhost:7331/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List all events |
| POST | `/events` | Create an event |
| GET | `/events/:id` | Get a single event |
| PATCH | `/events/:id` | Update an event |
| DELETE | `/events/:id` | Delete an event |
| GET | `/inventory/categories` | List inventory categories (incl. `picker_role`) |
| PATCH | `/inventory/categories/:id` | Set or clear a category's picker role (`{"picker_role": "cable" \| "stand" \| null}`) |
| GET | `/inventory/items` | List inventory items (filters: `?category_type=lighting`, `?category_id=1`, `?role=cable`, `?include_discontinued=true`) |
| POST | `/inventory/import-xlsx` | Re-import catalog from LL.xlsx (non-destructive upsert; picker roles survive) |
| GET | `/events/:id/audio-patch` | Full audio patch: stageboxes, stage multis, groups, DCAs, inputs, outputs, output devices, output cables |
| POST | `/events/:id/groups` | Add a mix group (`{"name", "color"?}`; 409 on duplicate name) |
| PATCH | `/events/:id/groups/:groupId` | Rename/recolor a group (LR: recolor only) |
| DELETE | `/events/:id/groups/:groupId` | Delete a group and its channel assignments (LR protected) |
| POST | `/events/:id/dcas` | Add a DCA (`{"name", "color"?}`) |
| PATCH | `/events/:id/dcas/:dcaId` | Rename/recolor a DCA |
| DELETE | `/events/:id/dcas/:dcaId` | Delete a DCA and its channel assignments |
| POST | `/events/:id/stageboxes` | Add a stagebox |
| PATCH | `/events/:id/stageboxes/:sbId` | Update a stagebox |
| DELETE | `/events/:id/stageboxes/:sbId` | Delete a stagebox |
| POST | `/events/:id/stage-multis` | Add a stage multicore |
| PATCH | `/events/:id/stage-multis/:smId` | Update a stage multicore |
| DELETE | `/events/:id/stage-multis/:smId` | Delete a stage multicore |
| POST | `/events/:id/audio-inputs` | Add an input row (omit `group_ids` to route to LR by default; the legacy `dca_groups` text field is gone — use `dca_ids`). `width` (`mono`/`stereo`), `mixer_behavior` (`stereo_channel`/`linked_channels`), `source_cabling` (`two_cables`/`splitter`) default when omitted; `stagebox_id_b`/`stagebox_channel_b`/`stage_multi_id_b`/`stage_multi_channel_b` are the stereo channel's independently-patched second side, and `source_cable_item_id` is a DI channel's source→DI cable pick — both validated the same way as their side-A/`cable_item_id` counterparts |
| PATCH | `/events/:id/audio-inputs/:inputId` | Update an input row (`group_ids`/`dca_ids` replace the sets wholesale) |
| DELETE | `/events/:id/audio-inputs/:inputId` | Delete an input row |
| POST | `/events/:id/audio-outputs` | Add an output row (`width` defaults to `mono`) — contributes 1 (mono) or 2 (stereo, independent) mixer ports to the graph |
| PATCH | `/events/:id/audio-outputs/:outputId` | Update an output row |
| DELETE | `/events/:id/audio-outputs/:outputId` | Delete an output row and every cable attached to its mixer ports |
| POST | `/events/:id/output-devices` | Declare a device (name, exactly one of `inventory_item_id`/`owned_item_id`, `input_port_count`/`output_port_count` with a matching `*_connector_type` set exactly when that side's count is `> 0`, `position_x`/`position_y`) |
| PATCH | `/events/:id/output-devices/:deviceId` | Update a device — `409` with the affected cables if a port count would drop below its number of attached cables |
| DELETE | `/events/:id/output-devices/:deviceId` | Delete a device — removes every cable attached to it instead of blocking |
| POST | `/events/:id/output-cables` | Connect two ports (`from_kind` ∈ `mixer`\|`stagebox`\|`stage_multi`\|`device`, `to_kind` ∈ `stage_multi`\|`device`, plus `from_id`/`from_port`/`to_id`/`to_port` and an optional `cable_item_id`). `409` if either port is already in use; `400` on an out-of-bounds port or a `cable_item_id` sent against a `stage_multi` `to_kind` (its own wiring is never a separate rentable cable) |
| PATCH | `/events/:id/output-cables/:cableId` | Re-pick `cable_item_id` — the only field this endpoint changes; moving a cable to different ports is delete + create |
| DELETE | `/events/:id/output-cables/:cableId` | Remove a cable — both endpoint devices remain untouched |
| GET | `/events/:id/lighting-rigs` | Get the rig with truss sections and fixtures |
| POST | `/events/:id/lighting-rigs/:rigId/fixtures` | Add a fixture |
| POST | `/events/:id/lighting-rigs/:rigId/fixtures/bulk` | Bulk-add N identical fixtures (shared settings, incrementing fixture IDs, appended DMX addresses; all-or-nothing) |
| PATCH | `/events/:id/lighting-rigs/:rigId/fixtures/:fixtureId` | Update a fixture |
| DELETE | `/events/:id/lighting-rigs/:rigId/fixtures/:fixtureId` | Delete a fixture |
| POST | `/events/:id/lighting-rigs/:rigId/fixtures/auto-assign-dmx` | Auto-assign DMX addresses |
| GET | `/events/:id/rentals` | Rental order summary (with stock validation flags) |
| PUT | `/events/:id/rentals/manual/:itemId` | Create/update a manual rental line |
| DELETE | `/events/:id/rentals/manual/:itemId` | Remove a manual rental line |
| GET | `/events/:id/rental-export` | Download the order as a filled-in copy of LL.xlsx |
| GET | `/events/:id/rental-export/report` | Export dry-run: filename + lines that cannot be placed |
| GET | `/owned-items` | List the owned-gear catalog |
| POST | `/owned-items` | Add an owned item |
| PATCH | `/owned-items/:itemId` | Update an owned item |
| DELETE | `/owned-items/:itemId` | Delete an owned item (removes it from all event plans) |
| GET | `/events/:id/owned-equipment` | List the event's owned-gear lines |
| PUT | `/events/:id/owned-equipment/:itemId` | Create/update an owned-gear line (quantity 0 removes) |
| DELETE | `/events/:id/owned-equipment/:itemId` | Remove an owned-gear line |
| GET | `/reference-data` | All planning vocabularies with their values (drives every dropdown) |
| POST | `/reference-data/:vocabulary/values` | Add a vocabulary value (409 on duplicates) |
| PATCH | `/reference-data/:vocabulary/values/:valueId` | Rename a value's display label (the stored value is immutable) |
| DELETE | `/reference-data/:vocabulary/values/:valueId` | Delete a value (409 while any planning row uses it) |
| GET | `/inventory/items/:itemId/fixture-modes` | List a fixture model's DMX modes |
| POST | `/inventory/items/:itemId/fixture-modes` | Add a DMX mode (name + channel count) |
| PATCH | `/fixture-modes/:modeId` | Update a mode (patched fixtures keep their copied values) |
| DELETE | `/fixture-modes/:modeId` | Delete a mode |

Health check: `GET http://localhost:7331/health` (outside `/api/v1`).

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22+ |
| HTTP router | chi v5 |
| Database | SQLite (`modernc.org/sqlite` — pure Go, no CGO) |
| Migrations | golang-migrate v4 |
| Excel parsing | excelize v2 |
| Frontend | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v3 |
| Data fetching | TanStack Query v5 |
| Routing | React Router v6 |
| Icons | Lucide React |
