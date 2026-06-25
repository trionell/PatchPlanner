# PatcherPlanner

An AVL (Audio, Video, Lighting) event planning tool for live productions. Plan patch lists, lighting rigs, DMX assignments, and generate rental orders — all in one place.

---

## Features

- **Events** — Create and manage events with date, venue, and notes
- **Audio Patch (Inputs)** — Build full input patch lists: channel number, name, signal type, preamp connector, stagebox routing, stage multicore, microphone model, cable type/length, mic stand, 48V phantom power, and DCA/group assignments
- **Audio Patch (Outputs)** — Map outputs to destinations (local, stagebox, stage-multi), assign amplifiers and speakers, document cable runs
- **Lighting Rig** — Add fixtures, assign them to truss sections, configure power connections (grid or daisy-chain), set DMX universe/address and channel mode, auto-assign DMX addresses in sequence
- **Rental Order** — Per-event summary of all rented equipment with quantities and pricing, ready to submit to your renter
- **Inventory** — Full catalog imported directly from the LL.xlsx price list (299 items across 26 categories: audio, lighting, rigging)

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
- Creates `backend/patcherplanner.db` (SQLite) on first run
- Runs all database migrations automatically

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

This imports **299 items** across **26 categories** (speakers, microphones, mixers, stageboxes, lighting fixtures, truss, cables, power distribution, and more).

> Re-running the import replaces the catalog — existing event data is not affected.

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
| Cable | Cable type (XLR, Jack, etc.) |
| Length | Cable length in metres |
| Stand | Mic stand type (straight, boom, low, desk, clip, none) |
| 48V | Phantom power on/off |
| DCA | DCA or group assignments |
| Notes | Free-text notes |

**Output columns:**
| Column | Description |
|--------|-------------|
| Out# | Output number |
| Name | Output label (e.g. "FOH L", "Monitor 1") |
| Type | Output type: FOH, monitor, sub, aux, matrix, stereo, IEM |
| Destination | Where the signal goes: local, stagebox, stage multicore |
| SB / SB Ch | Stagebox and channel (if destination = stagebox) |
| Multi / Multi Ch | Multicore and channel (if destination = stage-multi) |
| Amplifier | Amplifier from inventory |
| Speaker | Speaker from inventory |
| Cable | Cable type |
| Length | Cable length in metres |
| Notes | Free-text notes |

### Building a lighting rig

Open an event and go to the **Lighting Rig** tab.

1. Click **Add Fixture**
2. In the dialog, select a fixture from the lighting inventory (or type a custom name)
3. Set the DMX channel mode and channel count
4. Click **Add**

For each fixture in the table you can set:
- **Truss section** — which truss or position the fixture hangs on
- **Position** — index along the truss (for ordering)
- **Power** — `grid` (direct mains) or `chain` (daisy-chained from another fixture)
- **Power connector** — Schuko, CEE16, CEE32, PowerCon, PowerCon TRUE1, IEC
- **DMX universe** and **start address**
- **Channel mode** — the fixture's DMX personality (e.g. "Extended 16ch")
- **DMX chain** — parent fixture in the DMX daisy-chain
- **Notes**

#### Auto-assigning DMX addresses

Click **Auto-assign DMX** to automatically fill in sequential addresses for all fixtures in the rig. Fixtures are assigned per universe, ordered by position index, starting at address 1. Each fixture takes up the number of channels defined by its channel count.

### Viewing the rental order

The **Rental Order** tab shows a summary of all inventory items referenced across the event (from both the audio patch and lighting rig), with quantities split by audio and lighting use, pricing per unit, and a total.

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
│   └── patcherplanner.db            # Created at runtime (gitignored)
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
| PUT | `/events/:id` | Update an event |
| DELETE | `/events/:id` | Delete an event |
| GET | `/inventory/categories` | List inventory categories |
| GET | `/inventory/items` | List inventory items (filter: `?category_type=lighting`) |
| POST | `/inventory/import-xlsx` | Re-import catalog from LL.xlsx |
| GET | `/events/:id/audio-patch/inputs` | Get audio input patch |
| POST | `/events/:id/audio-patch/inputs` | Add an input |
| PATCH | `/events/:id/audio-patch/inputs/:inputId` | Update an input |
| DELETE | `/events/:id/audio-patch/inputs/:inputId` | Delete an input |
| GET | `/events/:id/audio-patch/outputs` | Get audio output patch |
| POST | `/events/:id/audio-patch/outputs` | Add an output |
| PATCH | `/events/:id/audio-patch/outputs/:outputId` | Update an output |
| DELETE | `/events/:id/audio-patch/outputs/:outputId` | Delete an output |
| GET | `/events/:id/lighting-rigs/:rigId/fixtures` | List fixtures in a rig |
| POST | `/events/:id/lighting-rigs/:rigId/fixtures` | Add a fixture |
| PATCH | `/events/:id/lighting-rigs/:rigId/fixtures/:fixtureId` | Update a fixture |
| DELETE | `/events/:id/lighting-rigs/:rigId/fixtures/:fixtureId` | Delete a fixture |
| POST | `/events/:id/lighting-rigs/:rigId/fixtures/auto-assign-dmx` | Auto-assign DMX addresses |
| GET | `/events/:id/rental-order` | Get rental order summary |
| GET | `/health` | Health check |

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
