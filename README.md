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
- **Configurable Reference Data** — Every planning vocabulary (signal types, preamp connectors, signal/speaker cable types, output types, mic stands, power connectors, truss types, channel colors) is stored data: add values for new gear, rename labels, delete unused ones (values in use by a plan are protected). Each event has its own independent vocabulary, editable on that event's Settings tab; every user also keeps a personal "My Defaults" template that seeds a new event's vocabulary at creation time — a one-time copy, never a live link back to the template or to any other event. Lighting fixture models carry DMX mode definitions (name + channel count) that auto-fill the channel count when patching
- **Inventories** — Each user owns their own independent equipment catalogs, imported from a price-list `.xlsx` file (e.g. 308 items across 27 categories: audio, lighting, rigging); duplicate an inventory to spin off a variant without re-importing, and pick which one an event uses when you create it — contributors get read access to it, only its owner can manage it
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
| `INVENTORY_PATH` | `../LL.xlsx` | One-time-only: read on first startup after upgrading to per-inventory ownership, to seed the legacy shared catalog's template into its new owner-less bootstrap inventory row. Not used by ongoing imports, which are per-inventory file uploads through the UI. |

Authentication (Google sign-in — see `specs/014-auth/quickstart.md` for the
first-time Google Cloud Console setup walkthrough):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PATCHPLANNER_GOOGLE_CLIENT_ID` | *(required)* | OAuth 2.0 client ID from Google Cloud Console |
| `PATCHPLANNER_GOOGLE_CLIENT_SECRET` | *(required)* | OAuth 2.0 client secret |
| `PATCHPLANNER_GOOGLE_REDIRECT_URL` | *(required)* | Must exactly match a redirect URI registered on the OAuth client |
| `PATCHPLANNER_FRONTEND_URL` | `http://localhost:5173` | Where the login/logout/error flow redirects back to |
| `PATCHPLANNER_ALLOWED_EMAILS` | *(required)* | Comma-separated, case-insensitive allow-list of Google emails permitted to sign in |
| `PATCHPLANNER_SESSION_TTL` | `720h` | Go duration string; how long a signed-in session lasts |

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
npm install       # first time only
npm run dev
```

The frontend opens on **http://localhost:5173**

### 4. Import an inventory

Every user gets their own independent inventories (equipment catalogs) — no
more one shared global catalog. Sign in, go to **Inventories** in the
sidebar, create an inventory (or use the one created for you automatically
on first sign-in), and upload a price-list `.xlsx` file (e.g. `LL.xlsx`)
through **"Import price list (.xlsx)"**. This is a real file upload
(multipart form), scoped to that one inventory — it no longer reads a fixed
server-side path.

Importing the sample `LL.xlsx` produces **308 items** across **27
categories** (speakers, microphones, mixers, stageboxes, lighting fixtures,
truss, cables, power distribution, and more).

> Re-running the import updates that inventory's catalog in place: matched
> items keep their identity (and every plan reference to them), prices and
> stock counts are refreshed, and items that disappeared from the price
> list are marked *discontinued* rather than deleted. Event data, and
> every other inventory, is never touched by an import.

---

## Usage Guide

### Creating an event

1. Go to **Events** in the sidebar
2. Click **New Event**
3. Fill in name, date, and venue
4. Pick which of your inventories this event uses (defaults automatically if you only have one)
5. Click **Create**

### Building an audio patch

Open an event and navigate to the **Audio Inputs** or **Audio Outputs** tab.

#### Audio Inputs

The input side separates the physical origin of a signal (a **Source** —
a mic on a stand, or a bare line/instrument output) from the **Channel**
it ends up on (the console strip — name, groups, DCA, color, notes). What
connects the two is entirely decided in the signal-flow graph below, via
cables — never a stored reference on either row, so the same Source can
feed more than one Channel at once (double-patching, e.g. a talkback mic
also monitored on a second strip).

**Sources table** — one row per physical origin:
| Column | Description |
|--------|-------------|
| Name | Source label (e.g. "Kick In", "Lead Vox", "Playback PC") |
| Kind | **Mic** (exposes Mic/Stand/48V) or **Line** (bare connector only — no mic, no phantom power) |
| Mic | Microphone model from the rental catalog (mic Sources only) |
| Stand | Mic stand from the rental catalog (mic Sources only) |
| 48V | Phantom power on/off (mic Sources only) |
| Connector | Physical connector at the source end (XLR, Jack TS/TRS, 3.5mm TRS mini-jack, RCA, …) |
| Width | Mono (default) or Stereo — a stereo Source contributes two independent ports to the graph (e.g. a laptop's single stereo mini-jack) |

A Source's row is tinted with whichever color it's currently feeding (see
Color inheritance below) instead of carrying a color of its own.

**Channels table** — one row per console strip:
| Column | Description |
|--------|-------------|
| Ch# | Mixer channel number |
| Name | Channel label |
| Width | Mono (default) or Stereo |
| Source (from graph) | Read-only summary of whatever currently feeds this channel, resolved from the graph below |
| Groups | Mix groups the channel routes to (LR is built-in and the default; remove it per channel if needed) |
| DCA | DCA membership (a channel can be in several) |
| Color | Console channel-strip color from the palette (this event's Settings tab → channel_colors) — the only place color is ever stored on the input side |
| Notes | Free-text notes |

Groups and DCAs are managed in the two cards above the tables: create,
rename, recolor, or delete them there. LR can be recolored but never
renamed or deleted; deleting an assigned group/DCA asks for confirmation
and then just clears those assignments.

**Stageboxes and stage multis** — declared in their own card, shared with
the Output side (a stagebox's or multi's *input*-side jacks and *output*-
side jacks are entirely independent cable sets, even though it's the same
physical unit).

**Devices** (DI boxes and anything else that sits between a Source and a
Channel) — declared in their own card: name, item (rental catalog or
owned-gear), and each side's port count + connector type. A stereo DI is
one 2-in/2-out device row, not two one-off mono ones.

#### Audio Outputs

**Output channel columns** (the mini-table above the graph — each row is one mixer output, contributing one or two ports to the graph below):
| Column | Description |
|--------|-------------|
| Out# | Output number |
| Name | Output label (e.g. "FOH L", "Monitor 1") |
| Type | Output type: FOH, monitor, sub, aux, matrix, stereo, IEM |
| Width | Mono (default) or Stereo — a stereo channel contributes two independent mixer ports (its own two separate physical connections), not one port that visually forks |
| Color | Console channel-strip color from the palette |
| Notes | Free-text notes |

#### Signal-flow graphs (both directions)

Both tabs' graph is a Sankey-style canvas where a line is a cable and a
box is a node. On **Audio Outputs** the console (all output channels'
ports together) and every stagebox are output-only, pinned to a left
rail; devices with only an input side (speakers, IEM packs) are pinned
to a right rail; devices with both sides, and stage multis, sit
free-floating in the middle. On **Audio Inputs** the graph runs the
other way: Sources are pinned to a left rail, Channels to a right rail
(each rail renders as one compact node listing every row, so the graph's
height never grows per Source/Channel), and Stageboxes/Stage-Multis/
Devices free-float in between, same as Outputs. Drag any free-floating
node anywhere.

Declare Devices in their own card above the graph: name, item (rental
catalog or owned-gear), and each side's port count + connector type (a
side with 0 ports has no connector; an amplifier with XLR in and Speakon
out just sets both sides independently — a stereo DI is one 2-in/2-out
device, not two one-off mono ones). Draw a cable by clicking a free
port, then a free port of the opposite direction — a catalog picker pops
up before the connection commits, *except* into a stage multi's or
stagebox's console-side jack, which commits immediately with no picker
(that hop is pure routing, never a separately rentable cable). A Source's
port stays clickable even once it already carries a cable, so the same
Source can feed more than one Channel at once (double-patching); when
connecting a stereo Source's second port right after its first already
got a cable item picked, the picker offers a one-click "same cable as the
other side" shortcut for the common splitter-cable case. A basic flat
table of every node and cable is available as an alternative to the
graph. Every other kind of port carries at most one cable; reducing a
device's port count below its number of attached cables is rejected
until those cables are removed; deleting a node removes every cable that
referenced it instead of being blocked.

**Color inheritance (Audio Inputs only)**: color is stored only on the
Channel. Every Source/Stagebox/Stage-Multi/Device port's displayed color
is derived by tracing the graph forward to whichever Channel(s) it
reaches — a single color when they all agree, neutral when none is
reached yet or they disagree (e.g. a Source double-patched into two
differently-colored Channels shows neutral). The Sources and Channels
tables reflect the same color as a tinted row background with a
left-edge accent bar.

Channel, group, and DCA colors show on the Audio Inputs/Outputs tabs, in
the Signal Flow view, and on the printed sheets (as a swatch next to the
channel number and tinted group/DCA names).

Rental counting has no width-based doubling logic on either side: every
node and cable counts once per row, full stop. A stereo Source or
Channel's two physical sides are two independent rows from the start —
wire each side to its own Device/Source to get "2"; wire both into one
shared Device to get "1", counted once no matter how many cables
reference it (the "one physical unit" rule). A stereo splitter cable
(one physical cable feeding both sides of a stereo pair) is entered as
two cables with only one side's `cable_item_id` set — the unset side
bills nothing, so the pair counts once, not twice.

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

## Deployment

In production, the Go backend serves the built frontend itself — `make
build` compiles the frontend, embeds it into the backend binary via
`go:embed`, and produces a single executable (`backend/patchplanner`)
plus the `backend/migrations/` directory as the only two deployment
artifacts. A reverse proxy (nginx + Certbot) terminates HTTPS in front
of it and a systemd unit keeps it running.

`PATCHPLANNER_ADDR` should bind to `127.0.0.1` in production (e.g.
`127.0.0.1:7331`), not a public interface — the Go process is only ever
reached through the reverse proxy, never directly.

See [`specs/018-deployment/quickstart.md`](specs/018-deployment/quickstart.md)
for the full runbook: server/domain prerequisites, building, configuring
the environment, setting up nginx + Certbot, the systemd service,
verifying the deployment, and setting up backups.

---

## API Reference

Base URL: `http://localhost:7331/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List events the caller owns or is a member of (each gains `yourRole`) |
| POST | `/events` | Create an event (caller becomes its owner) |
| GET | `/events/:id` | Get a single event — 404 if the caller has no role on it |
| PATCH | `/events/:id` | Update an event — owner/contributor only |
| DELETE | `/events/:id` | Delete an event — owner/contributor only |
| GET | `/events/:id/members` | List the owner + every invited collaborator |
| POST | `/events/:id/members` | Invite an existing known user (`{"userId", "role": "contributor" \| "viewer"}`) — owner/contributor only |
| PATCH | `/events/:id/members/:userId` | Change a collaborator's role — owner/contributor only, rejects targeting the owner |
| DELETE | `/events/:id/members/:userId` | Remove a collaborator — owner/contributor only, rejects targeting the owner |
| GET | `/users` | List everyone who has signed in at least once (invite picker) |
| GET | `/inventories` | List inventories the caller owns |
| POST | `/inventories` | Create a new, empty inventory owned by the caller (`{"name"}`) |
| GET/PATCH/DELETE | `/inventories/:id` | Get/rename/delete an inventory — owner-only; delete is `400` while any event still uses it |
| POST | `/inventories/:id/duplicate` | Deep-copy an inventory (categories, items, fixture modes, source file) into a new one, same owner |
| GET | `/inventories/:id/categories` | List inventory categories (incl. `picker_role`) |
| PATCH | `/inventories/:id/categories/:categoryId` | Set or clear a category's picker role (`{"picker_role": "cable" \| "stand" \| "truss" \| null}`) |
| GET | `/inventories/:id/items` | List inventory items (filters: `?category_type=lighting`, `?category_id=1`, `?role=cable`, `?include_discontinued=true`) |
| POST | `/inventories/:id/import-xlsx` | Import/re-import a price list from an uploaded `.xlsx` file (multipart; non-destructive upsert, picker roles survive) |
| GET | `/events/:id/inventory` | The event's bound inventory's public fields (name, source filename) — any role |
| GET | `/events/:id/inventory/categories` | The event's bound inventory's categories, read-only — any role |
| GET | `/events/:id/inventory/items` | The event's bound inventory's items, read-only — any role; this is what every planning picker reads from |
| GET | `/events/:id/audio-patch` | Full audio patch: stageboxes, stage multis, groups, DCAs, input sources, input channels, input devices, input cables, outputs, output devices, output cables |
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
| POST | `/events/:id/input-channels` | Add a Channel — console strip only (`channel_number`, `channel_name`, `width`, `mixer_behavior`, `group_ids`/`dca_ids`, `color`, `notes`); omit `group_ids` to route to LR by default. No source-related fields — what feeds it is decided entirely by `input-cables` |
| PATCH | `/events/:id/input-channels/:channelId` | Update a Channel (`group_ids`/`dca_ids` replace the sets wholesale) |
| DELETE | `/events/:id/input-channels/:channelId` | Delete a Channel and every cable feeding it |
| POST | `/events/:id/input-sources` | Add a Source — the physical origin (`name`, `kind` `mic`\|`line`, `connector_type`, `width`). `kind = mic` allows `mic_item_id`/`stand_item_id`/`phantom_power`; `kind = line` forbids all three (`400` otherwise) |
| PATCH | `/events/:id/input-sources/:sourceId` | Update a Source — switching `kind` from `mic` to `line` clears `mic_item_id`/`stand_item_id`/`phantom_power` server-side |
| DELETE | `/events/:id/input-sources/:sourceId` | Delete a Source and every cable attached to it |
| POST | `/events/:id/input-devices` | Declare an input-side device (DI box, etc.) — same shape as `output-devices` minus link ports |
| PATCH | `/events/:id/input-devices/:deviceId` | Update an input device — `409` with the affected cables if a port count would drop below its number of attached cables |
| DELETE | `/events/:id/input-devices/:deviceId` | Delete an input device — removes every cable attached to it instead of blocking |
| POST | `/events/:id/input-cables` | Connect two ports (`from_kind` ∈ `source`\|`stagebox`\|`stage_multi`\|`device`, `to_kind` ∈ `stagebox`\|`stage_multi`\|`device`\|`channel`, plus `from_id`/`from_port`/`to_id`/`to_port` and an optional `cable_item_id`). A Source's `from_port` is exempt from the one-cable-per-port rule (fan-out/double-patching); every other port is `409` if already in use. `400` on an out-of-bounds port or a `cable_item_id` sent when `from_kind` ∈ `stagebox`\|`stage_multi` and `to_kind = channel` (that hop is pure console routing, never a separate rentable cable) |
| PATCH | `/events/:id/input-cables/:cableId` | Re-pick `cable_item_id` — the only field this endpoint changes |
| DELETE | `/events/:id/input-cables/:cableId` | Remove a cable — both endpoints remain untouched |
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
| GET | `/events/:id/reference-data` | This event's own planning vocabularies with their values (drives every dropdown on that event) — any role |
| POST | `/events/:id/reference-data/:vocabulary/values` | Add a value to this event's vocabulary (409 on duplicates) — owner/contributor only |
| PATCH | `/events/:id/reference-data/:vocabulary/values/:valueId` | Rename a value's display label (the stored value is immutable) — owner/contributor only |
| DELETE | `/events/:id/reference-data/:vocabulary/values/:valueId` | Delete a value from this event's vocabulary (409 while any planning row in this event uses it) — owner/contributor only |
| GET | `/reference-templates` | The caller's own personal vocabulary template — seeds every new event they create |
| POST | `/reference-templates/:vocabulary/values` | Add a value to the caller's template (409 on duplicates) |
| PATCH | `/reference-templates/:vocabulary/values/:valueId` | Rename a template value's label |
| DELETE | `/reference-templates/:vocabulary/values/:valueId` | Delete a template value (never blocked — a template is never referenced by a plan) |
| GET | `/inventories/:id/items/:itemId/fixture-modes` | List a fixture model's DMX modes — owner-only |
| POST | `/inventories/:id/items/:itemId/fixture-modes` | Add a DMX mode (name + channel count) — owner-only |
| PATCH | `/inventories/:id/fixture-modes/:modeId` | Update a mode (patched fixtures keep their copied values) — owner-only |
| DELETE | `/inventories/:id/fixture-modes/:modeId` | Delete a mode — owner-only |

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
