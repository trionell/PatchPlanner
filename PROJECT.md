# PatchPlanner — Project Description

---

## 1. What Is PatchPlanner?

### The Problem Space

Live event production in the AVL (Audio, Video, Lighting) industry is documentation-heavy work. Before a single cable gets plugged in on show day, a technician must plan and communicate dozens of interdependent decisions:

- Which microphone goes on which mixer channel, through which stagebox port, over which multicore channel?
- Which speaker is driven by which amplifier? What cable run connects them?
- Which lighting fixture hangs where, what power connector does it need, is it daisy-chained or direct-to-grid, and what is its DMX start address?
- What equipment needs to be rented, and in exactly what quantities, so the rental order can be sent off well in advance?

Today, most working technicians solve this with a combination of spreadsheets, hand-drawn signal flow diagrams, and memory. The spreadsheet approach works up to a point, but it has no awareness of how things connect — a channel number in one tab has no relationship to the stagebox port in another, and the rental order is assembled manually by counting references across sheets.

### Who It Is For

PatchPlanner is built for **freelance and small-team AVL technicians** who plan and execute live events — concerts, corporate productions, theatre, festivals — and who regularly rent equipment from the same supplier. The initial target is a single technician who rents from a specific Swedish supplier whose inventory is provided as an Excel price list (`LL.xlsx`).

### The Core Value Proposition

PatchPlanner replaces isolated spreadsheets with a **connected, structured planning environment** where:

- Every channel, fixture, and cable run references real inventory items, so what you plan is what gets ordered.
- Routing is modeled as relationships (mic → cable → stagebox port → multicore channel → mixer channel), not as free-text fields.
- The rental order is **derived automatically** from what you have planned — no manual counting.
- The tool stays close to real-world AVL terminology and workflows, so it feels natural to a working technician rather than a generic project management tool adapted for AV.

---

## 2. Currently Implemented Features

### 2.1 Events

The top-level organizing unit. Each event represents a single production (gig, show, conference, etc.).

- Create, edit, and delete events with name, date, venue, and freeform notes.
- All other planning data (patch lists, lighting rigs, rental orders) is scoped to an event.
- Events listing on the dashboard shows upcoming and recent events.

### 2.2 Inventory Catalog

The equipment catalog is sourced directly from the renter's `LL.xlsx` price list.

- **Import**: A single API call (or button click) parses the `"Prislista LL"` sheet and upserts all items into the local database. The import is non-destructive: matched items keep their identity (and all plan references), items missing from the new list are flagged *discontinued* rather than deleted, and a failed import rolls back completely.
- **308 items** across **27 categories** are imported: microphones, line boxes, IEM systems, mixers, amplifiers, speakers, stageboxes, stage multicores, cables, lighting fixtures, dimmers, DMX equipment, smoke machines, truss, rigging hardware, power distribution, and more.
- Categories are classified by type (`audio`, `lighting`, `rigging`) using keyword matching on the category name.
- Each item carries: name, description, available quantity, and ex-VAT price.
- The inventory page allows browsing all categories and items with type filtering.

### 2.3 Stagebox and Stage Multi Management

Stageboxes and stage multicores are modeled as **named, reusable entities per event** (not free-text fields in patch rows), so the channel constraint is enforced and the rental reference is maintained.

**Stageboxes:**
- Add a stagebox by name and optionally link it to an inventory item (e.g. a Behringer S32 from the catalog).
- Input and output channel counts are auto-parsed from the inventory item's description (e.g. "32/16" → 32 inputs, 16 outputs) or entered manually.
- Connection type (analog, AES, Dante, MADI, EtherSound, AVB) is selectable.
- Inline editing of existing stageboxes; delete with referential integrity enforcement.

**Stage Multis:**
- Add a multicore cable by name and optionally link it to an inventory item.
- Channel count is auto-parsed from description or entered manually.
- Connector type (XLR, CAT5e/6/6a, BNC, optical) and cable length are stored.

### 2.4 Audio Inputs Patch

A full input patch list for a mixer show, with every column a working FOH engineer would need on a patch sheet.

| Field | Description |
|-------|-------------|
| Channel # | Mixer channel number |
| Channel name | Label (e.g. "Kick In", "Lead Vox") |
| Signal type | `mic`, `line`, `DI`, `return`, or `aux` |
| Preamp connector | XLR, Jack TS/TRS, RCA, Combo, USB |
| Stagebox | Named stagebox (from event's stagebox list) |
| Stagebox channel | Channel on that stagebox (dropdown constrained to input count) |
| Stage multi | Named multicore (from event's multi list) |
| Multi channel | Channel on that multicore (dropdown constrained to channel count) |
| Mic/DI model | Inventory-filtered by signal type: mics for `mic`, line boxes for `DI`, IEM for `return` |
| Cable type | XLR, Jack TS/TRS, RCA, or Combo |
| Cable length (m) | Numeric |
| Mic stand | `straight`, `boom`, `low`, `desk`, `clip`, or `none` |
| 48V phantom power | Toggle |
| DCA / Group | Free-text assignment label |
| Notes | Freeform |

- All rows are inline-editable; changes persist on field blur (no Save button needed).
- Dropdowns for `mic_model`, `stagebox`, `stage_multi` are populated from live event data and filtered inventory — no free text for things that exist in the catalog.

### 2.5 Audio Outputs Patch

Output routing with full destination modeling.

| Field | Description |
|-------|-------------|
| Output # | Mixer output number |
| Output name | Label (e.g. "FOH L", "Monitor 3") |
| Output type | `foh`, `monitor`, `sub`, `aux`, `matrix`, `stereo`, `iem` |
| Destination type | `local`, `stagebox`, `stage-multi` |
| Stagebox / channel | If destination is stagebox (constrained dropdown) |
| Stage multi / channel | If destination is stage-multi (constrained dropdown) |
| Amplifier | Inventory-filtered to amplifier/crossover category |
| Speaker | Inventory-filtered to speaker categories |
| Cable type | XLR, NL4, NL8, or Jack TS (speaker cable types) |
| Cable length (m) | Numeric |
| Notes | Freeform |

### 2.6 Lighting Rig

Fixture-level lighting documentation covering hang position, power, and DMX.

- **Add fixtures** via a dialog: pick from the lighting inventory or enter a custom name; set the DMX channel mode and channel count.
- **Truss assignment**: optional, free-text truss section name and position index along the truss.
- **Power modeling**:
  - `grid` — fixture connects directly to mains power.
  - `chain` — fixture is daisy-chained from another fixture (indicated visually with a link icon).
  - Power connector type: Schuko, CEE16A, CEE32A, PowerCon, PowerCon TRUE1, IEC.
- **DMX patch**:
  - Universe, start address, channel mode label, channel count.
  - DMX chain parent (for modeling the physical DMX daisy-chain topology).
  - Formatted address display (e.g. `U1 / 001–016`).
- **Auto-assign DMX**: one-click sequential address assignment per universe, ordered by fixture position index, starting at address 1.

### 2.7 Rental Order

Per-event rental summary, derived automatically from the planning data.

- Aggregates all inventory items referenced across the event's audio patch (mic/DI/IEM references, amplifiers, speakers, stagebox models, multicore cables) and lighting rig (fixture inventory items).
- Manual line items: any catalog item (spare cables, rigging, smoke machines, …) can be added to the order with its own audio/lighting quantities and a note; manual quantities merge with the derived ones.
- Stock validation: every line shows the renter's available stock; lines whose planned quantity exceeds it are flagged, with an order-level warning.
- Shows quantity split by audio vs. lighting use.
- Displays unit price (ex-VAT) and line subtotal for each item.
- Grand total ex-VAT for the entire event.
- The rental order tab updates in real-time as planning data changes — no manual assembly needed.

---

## 3. Planned / Not Yet Implemented

### 3.1 Excel Rental Order Export — ✅ implemented (2026-07-07)

Shipped as the `002-xlsx-rental-export` feature: the Rental Order tab exports a copy of `LL.xlsx` with quantities written into the `Antal Ljud` / `Antal Ljus` columns at each item's row. The writer locates the columns by header text, clears stale quantities left in the template, verifies the equipment name at every target row before writing, and reports unplaceable lines (discontinued items, drifted rows) instead of dropping them. The source file on disk is never modified, and re-importing an exported file leaves the catalog unchanged.

### 3.2 Rigging and Miscellaneous Equipment Tracking

The original brief explicitly includes tracking rigging hardware (shackles, slings, motors, truss bolts, safety cables, etc.) and generic miscellaneous items. The inventory already classifies these items as type `rigging`, but there is no dedicated planning view or rental-order integration for them. A generic "equipment list" section per event would cover this.

### 3.3 Video Equipment

Video was listed in the original scope (cameras, screens, matrix switchers, cabling) but has not been started. Given the extensibility-by-design principle, a video section should largely reuse the same inventory-reference and rental-order patterns as audio and lighting.

### 3.4 Signal Flow Visualization

The data model already captures the full input signal chain (mic → cable → stagebox port → multicore channel → mixer channel). A read-only visual signal flow diagram — even a simple text-based one — would make it much faster to catch patching errors before load-in. Not yet implemented.

### 3.5 DMX Channel Modes as Inventory Data

Currently, DMX channel modes (e.g. "Basic 3ch", "Extended 16ch") are free-text strings. The constitution calls for them to be stored as configurable records per fixture model — so that selecting a mode auto-fills the channel count, and a dropdown can be offered instead of free text. This requires a `fixture_modes` table linked to inventory items.

### 3.6 Stock / Quantity Validation — ✅ implemented (2026-07-07)

Shipped as part of the `001-rental-order-correctness` feature: every rental line carries the renter's available stock, over-booked lines are flagged in the API and highlighted in the UI, and the order shows an overall warning.

### 3.7 Print-Friendly / Shareable Patch Sheets

A common workflow is to print the input patch list and distribute it to the stage crew and FOH engineer, or export it as a PDF. No print view or export-to-PDF functionality exists yet. Similarly, a sharable read-only link to a patch sheet would be useful for remote collaboration.

### 3.8 Production Binary (Frontend Embedded in Backend)

The constitution requires the final production deployment to be a **single Go binary** that serves the compiled frontend as embedded static files. Currently the frontend must be served separately (Vite dev server in development, or a separate static file server). Embedding the Vite build output using Go's `embed` package is planned but not implemented.

### 3.9 Owned / Non-Rental Equipment

The constitution distinguishes between rented inventory items (from the supplier catalog) and owned or generic equipment. There is currently no mechanism to add gear that is not in the rental catalog to a plan without it appearing incorrectly on the rental order. A separate "owned gear" catalog would resolve this.

### 3.10 Multi-Event and Tour Planning

For recurring productions or multi-day tours using the same rig, there is no way to clone an event's planning data or create a template. This would reduce repetitive data entry significantly.

---

## 4. Technology Stack

### 4.1 Backend: Go

**Why Go:** Go compiles to a single self-contained binary with no runtime dependency, which aligns directly with the goal of a single deployable artifact. The standard library provides everything needed for an HTTP server; the third-party ecosystem is small and stable. Go's strict typing catches integration errors early without needing a separate schema-validation layer. For a solo developer running a local-first tool, Go's fast compile times and easy cross-compilation are practical advantages.

**Key dependencies:**

| Package | Role |
|---------|------|
| `github.com/go-chi/chi/v5` | HTTP router — lightweight, idiomatic, supports URL parameters and middleware cleanly |
| `github.com/go-chi/cors` | CORS middleware for allowing the Vite dev server origin during development |
| `modernc.org/sqlite` | Pure-Go SQLite driver — **no CGO required**, simplifying builds on all platforms |
| `github.com/golang-migrate/migrate/v4` | Versioned database migrations applied automatically on startup |
| `github.com/xuri/excelize/v2` | Excel file parsing for reading `LL.xlsx` and (future) writing the rental order export |

**Why `modernc.org/sqlite` instead of `mattn/go-sqlite3`:** The mattn driver requires CGO, which complicates cross-compilation (especially to Windows from Linux) and adds a C toolchain requirement for anyone building the project. The modernc pure-Go implementation avoids this entirely at a negligible performance cost for this workload.

**Why SQLite:** The tool is designed as a locally-hosted, single-user application. There is no need for a networked database server, replication, or concurrent write access from multiple processes. SQLite gives full relational modeling, transactions, and foreign-key enforcement with zero operational overhead. The single `.db` file is trivially backed up and moved between machines.

### 4.2 Frontend: React + TypeScript + Vite

**Why React:** Mature ecosystem, excellent TypeScript support, and the component model maps naturally to the table-heavy, inline-editing UX that patch sheets require. The team (one person) already knows React.

**Why TypeScript:** The API surface is non-trivial — many closely-related domain objects with optional fields. TypeScript's structural typing catches mismatches between the Go JSON response shapes and the frontend code at compile time, before they become runtime bugs.

**Why Vite:** Faster dev-server startup and HMR than Webpack/CRA. Straightforward configuration. Compatible with the planned `go:embed` production deployment.

**Key dependencies:**

| Package | Role |
|---------|------|
| `@tanstack/react-query` | Server state management — caching, invalidation, loading/error states without boilerplate |
| `react-router-dom` | Client-side routing (Events list, Event detail page, Inventory page) |
| `tailwindcss` | Utility-first CSS — rapid iteration on a dark, amber-accented UI without writing custom stylesheets |
| `lucide-react` | Consistent icon set used throughout the UI |
| `react-hook-form` + `zod` | Form state and validation for the event creation dialog |
| `clsx` + `tailwind-merge` | Conditional class composition for UI components |

### 4.3 Architecture Decisions

**REST over GraphQL:** The data access patterns are simple and resource-oriented. REST with JSON is sufficient and keeps the backend easy to reason about. Every frontend query maps to exactly one API call.

**No authentication (v1):** The tool runs locally (`localhost:7331`). Adding auth would add complexity with no security benefit for a single-user local tool. Explicitly noted in the constitution as out of scope for v1.

**Inline-edit UX (blur-to-save):** Patch sheets can have 40–80 rows with 12–15 columns each. A row-level "Save" button would create excessive friction. Saving on field blur keeps the experience close to working in a spreadsheet while ensuring data is persisted incrementally.

**Migration style:** Migrations 001–005 contain multiple statements per file and apply fully with the `modernc.org/sqlite`-backed golang-migrate driver (verified by the test suite, which builds every schema from these files). Migrations from 006 onward follow a one-statement-per-file convention anyway — smaller files are easier to review and to write correct `.down.sql` counterparts for.

**Inventory-filtered dropdowns:** Rather than allowing free text for equipment fields (mic model, amplifier, speaker, stagebox model), dropdowns are populated from the live inventory catalog and filtered by category type. This enforces that planned equipment is always traceable to a real rental item, which is a prerequisite for a correct rental order.
