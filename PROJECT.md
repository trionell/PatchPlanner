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

PatchPlanner is built for **freelance and small-team AVL technicians** who plan and execute live events — concerts, corporate productions, theatre, festivals — and who regularly rent equipment. The tool was originally built around a specific Swedish supplier whose inventory is provided as an Excel price list (`LL.xlsx`), and still reproduces that file exactly on export. Since Slice 22 it is supplier-agnostic: a catalog can equally come from a generic spreadsheet or be typed in by hand, and every event can be exported as a PDF or plain spreadsheet order regardless of where its catalog came from.

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
- **The Overview tab states what the event amounts to** (Slice 28). Days to
  load-in, channels in and out, fixtures, cables picked and the rental total, at
  a glance; the audio patch and the lighting rig drawn as one-row ribbons of the
  same nodes the flow canvas uses; and a readiness verdict per area — audio,
  lighting, rental, equipment, plots — carrying the same words and tints the
  owning tab's own status strip carries, because they come from the same
  derivation. Every number and every verdict links to the tab that produced it.
- Editing the event's own fields happens in a drawer, so the tab itself holds no
  form control and a viewer sees the same screen minus one button.
- Every tab is addressable: `?tab=` selects it, so a link opens the event
  wherever you meant.
- **The event's own planning vocabularies** are one panel (Slice 29): the nine
  vocabularies as a rail, their values as a sheet, and — for the first time —
  how many plan rows use each value, counted by the same function that refuses
  to delete one that is in use. Renaming a label is always safe; the stored
  value saved plans point at can never change.

### 2.2 Inventory Catalog

An inventory is an owned catalog of rentable equipment. It can be populated three ways, and how it was populated is recorded on the inventory itself (`source_format`) because that is what decides which export formats it offers.

Both spreadsheet formats go through **one** import button and one route: the server detects which format a file is (a price list by its `Prislista LL` sheet, a generic list by its `Category`/`Name` headings) and dispatches accordingly, reporting what it decided. Classifying the file is not the user's job.

**Price-list import (`LL.xlsx`).** A single API call (or button click) parses the `"Prislista LL"` sheet and upserts all items. **308 items** across **27 categories**: microphones, line boxes, IEM systems, mixers, amplifiers, speakers, stageboxes, stage multicores, cables, lighting fixtures, dimmers, DMX equipment, smoke machines, truss, rigging hardware, power distribution, and more. Categories are classified by type (`audio`, `lighting`, `rigging`) via keyword matching on the Swedish category name. The uploaded file is retained so the rental order can be written back into it.

**Generic spreadsheet import (Slice 22).** A supplier-agnostic format: one flat sheet, one item per row, columns `Category | Type | Name | Description | Quantity | Price (ex VAT)`. Columns are located by heading text (with aliases) rather than by position, so users can reorder them and keep working columns of their own; unrecognised columns are ignored. A blank `Type` defaults to `audio`; an unrecognised one is an error. A file with any problem imports nothing and reports every offending sheet row at once. A blank template is generated on demand with a frozen header row, a `Type` drop-list, and a worked-example sheet the importer never reads — a round-trip test keeps the template and the parser from drifting apart.

**By hand (Slice 22).** Categories and items can be created, edited and deleted directly on any inventory, imported or not. Hand-entered items are flagged `is_manual` and are invisible to imports: they are excluded from both the discontinue sweep *and* the name-matching pool, so an import can neither retire them nor overwrite one that shares a name with a row in the file. Deleting an item referenced by any plan is refused with its reference count; deleting a non-empty category is refused.

Common to all three: the import is non-destructive — matched items keep their identity (and all plan references), items missing from the new list are flagged *discontinued* rather than deleted, and a failed import rolls back completely. Each item carries name, description, available quantity, and ex-VAT price. The inventory page browses all categories and items with type filtering.
- **Managed as a work surface** (Slice 29). One panel: the categories are a
  filter column beside the items, all of them visible at once; the items are a
  sheet with an editor that opens under the row; and a lighting item's DMX modes
  are edited there rather than in a dialog. Category management (rename, retype,
  delete, planning picker role) and importing a price list each have a drawer,
  so neither shifts the list while you are reading it.

### 2.3 The Rig: Consoles, Stageboxes, Stage Multis and Devices

Everything the signal passes through is a **named, reusable entity per event**,
declared once and shared by both audio tabs — never a free-text field on a patch
row. All of it lives in the **Rig drawer**, reachable from either tab's toolbar,
and every row in it that names a catalog or owned item is one line on the rental
order. Every section reads the same way (Slice 24): a heading with a count and
an add control, one card per declared item stating its name, the item it stands
for, its capacity and how much of that capacity the patch uses — and its fields
only once **Edit** is pressed. Nothing in the drawer is placed beside anything
else, so every field has the drawer's full width.

**Consoles** (Slice 23). The desk itself: a display name, a role (FOH, monitor,
broadcast), the catalog or owned item it was booked as, and how many networked
inputs and outputs plus local jacks it has. An event may hold several — FOH plus
monitors is an ordinary rider — and each input channel and each output names the
desk it belongs to. Counts are typed per event rather than read from the catalog
item, because a desk's usable channel count depends on its card fit and licence;
a count left at zero simply means undeclared and never warns. The desk's own
local jacks are patchable, so a talkback mic can go straight into its preamp
with no stagebox in the path.

Those local jacks are their own node on each graph (Slice 24), drawn as a
two-sided pass-through exactly as a stagebox is — signal arrives on the left and
leaves on the right — because that is what they are to the signal, and drawing
them the same way is what lets either be picked without learning a second idiom.
The panel is placed independently on each canvas, and no node is drawn for a desk
that has declared no local jacks.

**Stageboxes.** Name plus an optional inventory item; input and output counts
auto-parsed from the item's description ("32/16" → 32 in, 16 out) or typed;
connection type (analog, AES, Dante, MADI, EtherSound, AVB). Deleting one clears
the cables that referenced it rather than blocking.

**Stage multis.** Name plus an optional inventory item; channel count parsed or
typed; connector type and cable length. A multi's own body is the cable for its
entire run, so nothing leaving it is separately billable.

**Processing and destination devices.** DI boxes, splitters, amplifiers,
speakers, recorders — declared with a port count and connector type per side
(either side may be zero, which is what makes a device a pure source or a pure
destination) and counted once on the order however many cables reference it.

### 2.4 Audio Inputs

One surface with two views (Slice 23), in a single framed panel (Slice 25): a
toolbar across the top carrying the tab's name, the view toggle, a search box, the
Rig and Buses drawers, the canvas zoom in Flow, print and one add action — then the
content, then a status strip closing the panel. Switching view changes what is
inside the frame and nothing else.

The sheet is dense on purpose: mono uppercase micro-labels for headings on a ground
darker than the rows, one line per row, striping subtle enough to read as an aid,
tabular figures so digits align, and the tape colour as a short bar beside the name.
A hop through the desk's own socket is drawn in amber, because it is the one hop on
a chain that is not a billable cable.

**Sheet** — the view you land on. One line per channel:

| Column | Description |
|--------|-------------|
| Ch | Console channel number |
| Name | Label (e.g. "Kick In", "Lead Vox") |
| W | Mono or stereo — a stereo channel is one row with two ports |
| Chain | The whole signal path in order: mic → every hop → desk channel, each hop its own click target |
| 48 V | Red bar when a source feeding this channel has phantom power on |
| Buses | Mix-group and DCA chips, tinted by bus colour |
| Notes | Freeform |

Clicking a row opens an editor in place holding the channel's own fields only —
name, width, tape colour, buses, notes; routing is decided in Flow, reachable
from the editor itself via **Edit in Flow**, which selects the row's own source.
One row is open at a time, opening another saves and closes the first, `Esc`
discards and `⌘↵` saves and moves on. A missing link is named in place ("no source"), never
an empty cell, and a status rail under the list states the channel count, each
desk's used-against-declared capacity, per-box usage, cables picked, and any
gaps — plus an over-capacity warning when the patch has outgrown the booked desk.

**Flow** — the same data seen sideways, one toggle away. Three lanes follow the
signal (Stage, Rig, Console). The desk's channel rail sits in the Console lane;
its local jack panel sits in the Rig lane with the stageboxes, because that is
where signal passes through it. Sources are one consolidated scrollable rail of
20px rows carrying a derived colour tape, the source name, the picked mic, a red
48 V bar and the patchable port; a stereo source is two port slots tall with `L`
above `R`, each side cabled independently. Cables are drawn as bezier runs with
two independent encodings: **hue** is the channel the run reaches (only when
every reachable channel agrees), **dash pattern** is what kind of link it is.
Selecting a node opens an inspector rail on the right, holding a source's mic,
stand, connector, width and phantom power — each field beside its label — plus a
note stating what the source reaches and a legend drawing each line style rather
than describing it. Pressing **Edit in Flow** in the sheet opens the graph with that
row's own source already selected and its editor open; what is selected belongs to
the tab and survives switching view. Both graphs draw their boxes, ports and rows
from one shared set of components, and both draw the same inspector rail, so a box
on Inputs and a box on Outputs cannot drift apart: a pass-through is one row per
jack with its two ports on opposite edges, and every jack is drawn — a box that
hides eight of them is not a shorter box but an incomplete one. Every node on either
canvas can be dragged, including the one holding rows that belong to no desk — that
one keeps its position for the session only, since there is no row to store it on.

### 2.5 Audio Outputs

The mirror of Audio Inputs, reading outward from the desk instead of inward to
it, in the same shell with the same Rig drawer against the same equipment. The
Sheet's chain starts at the named desk output and runs out to the last
destination; the Desk column and filter appear only when the event has more than
one console. Outputs have no bus membership, so there is no Buses drawer here.

| Column | Description |
|--------|-------------|
| Out | Console output number |
| Name | Label (e.g. "FOH L/R", "Mon 1 · SR wedge") |
| Desk | Which console — shown only with more than one |
| Type | `foh`, `monitor`, `sub`, `aux`, `matrix`, `stereo`, `iem` |
| W | Mono or stereo |
| Chain | Desk output → every hop → destination, each hop clickable |
| Notes | Freeform |

**Flow** — the same three lanes mirrored (Console, Rig, Stage), and editable, not
only readable. Clicking an output row's label in a desk's bus list opens the same
inspector rail the Inputs canvas uses, holding every field the sheet's row editor
holds — number, name, type, width, tape colour, desk and notes — so an output can be
worked on in whichever view the routing is already visible in. Two gestures share a
row: the **label** opens the rail, the **port dot** still starts a cable. A stereo
output's two rows answer to one selection. The rail also states where the output
lands, read from the same chain model the sheet's Chain column renders, so the two
cannot disagree; and it offers Duplicate (the row's fields, not its cabling, at the
next free number) and Delete. Selecting a stagebox, stage multi, device or a desk's
local jack panel opens the rail on that box, pointing at the Rig drawer for its
fields. The desk box itself is not selectable — its fields live in the Rig drawer,
and its rows each have a rail.

### 2.6 Lighting Rig

Fixture-level lighting documentation covering hang position, power, and DMX,
built as the work panel the audio tabs use: a bar, a sheet that is read until a
row is clicked, an editor beneath the open row, and a strip stating whether the
rig's addressing holds (Slice 27).

- **The sheet**: nine read-only columns — console ID, fixture and its catalog
  model, mode, universe, address span, channel count, truss, power, notes.
  Ordered by rig position; searchable on every one of those.
- **Add fixtures** in the same editor used to edit one, with a quantity that
  defaults to 1: one form for a single haze machine and for twelve wash lights.
  Optionally a name stem numbering the batch, and optionally one shared address
  for all of them.
- **Truss assignment**: read-only, derived from the stage plot, with a hand-off
  to the tab where it is decided.
- **Power modeling**:
  - `grid` — fixture connects directly to mains power.
  - `chain` — fixture is daisy-chained from another fixture, naming the fixture
    it chains from.
  - Power connector type: Schuko, CEE16A, CEE32A, PowerCon, PowerCon TRUE1, IEC.
- **The DMX map** — derived, never stored, and the first opinion the application
  has ever had about a rig's addressing. Four conditions a universe can be in all
  at once:
  - **shared** — fixtures with identical spans, which is how a room wash or a
    dimmer channel is rigged. Counted, never warned about.
  - **clash** — spans that intersect without being identical. An error.
  - **out of bounds** — a span running past channel 512. An error.
  - **unaddressed** — no start address yet. Neither of those.
  None of them blocks a save: a rig legitimately passes through a broken state
  while it is being renumbered.
- **Inserting into an occupied address** asks rather than refusing: *make room*
  ripples the fixtures above up by just enough, *share address* appears when the
  span matches exactly, and *place anyway* is always available.
- **The Universes drawer**: per universe, its occupancy out of 512, its fixture
  count, its free channels, and its **largest free run** — the number that
  answers whether the next batch will fit, where the free total does not.
- **Two bulk operations**, both acting on groups rather than fixtures so what
  shared before still shares, both keeping every fixture in its own universe, and
  both leaving an over-full universe untouched rather than failing the whole rig:
  - **Auto-assign DMX** — repack each universe from address 1 in rig order.
  - **Optimise channels** — keep the order already set, and close the gaps.

### 2.7 Rental Order

Per-event rental summary, derived automatically from the planning data.

- Aggregates all inventory items referenced across the event's audio patch (mic/DI/IEM references, amplifiers, speakers, stagebox models, multicore cables) and lighting rig (fixture inventory items).
- Manual line items: any catalog item (spare cables, rigging, smoke machines, …) can be added to the order with its own audio/lighting quantities and a note; manual quantities merge with the derived ones.
- Stock validation: every line shows the renter's available stock; lines whose planned quantity exceeds it are flagged, with an order-level warning.
- Shows quantity split by audio vs. lighting use.
- Displays unit price (ex-VAT) and line subtotal for each item.
- Grand total ex-VAT for the entire event.
- The rental order tab updates in real-time as planning data changes — no manual assembly needed.
- **Read as a sheet, not filled in as a form** (Slice 28). Nine columns, nothing
  editable until a line is clicked, and the editor states which part of the
  quantity came from the plan — the only part anyone may change here is the
  manual one. A line's manual share is marked in place with a `+N` badge. Order
  totals, over-stock lines and discontinued items are stated by the strip that
  closes the panel, so they are visible without scrolling three hundred rows.
- **Three export formats** (Slice 22). The `LL.xlsx` export is offered only for inventories actually imported from that price list — hidden in the UI and refused by the API otherwise. Every inventory, however it was populated, additionally exports a **PDF order** (grouped by category with per-category subtotals, unit prices, a grand total ex-VAT, over-stock markers explained in a footnote, and repeating column headers across pages) and a **plain spreadsheet order**.

---

## 3. Planned / Not Yet Implemented

### 3.1 Excel Rental Order Export — ✅ implemented (2026-07-07)

Shipped as the `002-xlsx-rental-export` feature: the Rental Order tab exports a copy of `LL.xlsx` with quantities written into the `Antal Ljud` / `Antal Ljus` columns at each item's row. The writer locates the columns by header text, clears stale quantities left in the template, verifies the equipment name at every target row before writing, and reports unplaceable lines (discontinued items, drifted rows) instead of dropping them. The source file on disk is never modified, and re-importing an exported file leaves the catalog unchanged.

Extended 2026-07-09 (`006-rental-cables-stands`): cables and mic stands are now picked as concrete catalog items on patch rows (type + length encoded in the item, e.g. "Mikrofonkabel — 4m"), so they appear on the rental order and in the export like every other rented item. Pre-existing rows were conservatively migrated (only unambiguous XLR + length matches converted; everything else shows read-only legacy text until re-picked).

### 3.2 Rigging and Miscellaneous Equipment Tracking — ✅ implemented (2026-07-07)

Covered by two features: rented rigging/misc gear is ordered via manual rental lines on the Rental Order tab (001), and the per-event **Equipment** tab (003) shows the full extras picture — owned gear plus rented extras — in one place. Since Slice 28 that is literally one list: one sheet with a `Source` column, one editor whose first field switches which catalog the item picker reads, and a hand-off in both directions between a rented extra and the manual rental line it *is*.

### 3.3 Video Equipment

Video was listed in the original scope (cameras, screens, matrix switchers, cabling) but has not been started. Given the extensibility-by-design principle, a video section should largely reuse the same inventory-reference and rental-order patterns as audio and lighting.

### 3.4 Signal Flow Visualization — ✅ implemented (2026-07-08)

Shipped as part of the `005-print-signal-flow` feature: a read-only Signal Flow tab on the event page traces every input channel's chain (source → cable → stagebox port or multi channel → console channel) as a text/table view. Incomplete links (no source picked, routing half-assigned) are flagged and counted, while direct-to-console channels render without false gaps; the view is printable like the patch sheets. The graphical node diagram arrived separately, on the Audio Inputs and Outputs tabs (Slices 11–12, 26).

Since Slice 28 the chains are set in a fixed-pitch face, so the same hop in two rows occupies the same width and a column of them can be read down — which is the tab's whole job at load-in. Inputs and outputs share one panel and one scroll, divided by a labelled band rather than a view toggle, because a toggle would print half the document. It is the one sheet in the application with no row editor: everything on it is derived, so a row click opens the tab where the chain is actually built.

### 3.5 DMX Channel Modes as Inventory Data — ✅ implemented (2026-07-08)

Shipped as part of the `004-reference-data` feature: a `fixture_modes` table linked to inventory items stores each fixture model's DMX modes (name + channel count), editable from the Inventory page. Picking a mode on a rig fixture copies name and channel count onto the fixture (so later mode edits never rewrite existing rigs); manual entry remains available for models without defined modes. The same feature completed constitution Principle II across the board: all eight planning vocabularies (signal types, preamp connectors, signal/speaker cable types, output types, mic stands, power connectors, truss types) moved from code enums and CHECK constraints into an editable `reference_values` table with a Settings page, seeded with the previous values so existing plans are untouched.

### 3.6 Stock / Quantity Validation — ✅ implemented (2026-07-07)

Shipped as part of the `001-rental-order-correctness` feature: every rental line carries the renter's available stock, over-booked lines are flagged in the API and highlighted in the UI, and the order shows an overall warning. Since 2026-07-09 this covers cable and stand picks too (`006-rental-cables-stands`).

### 3.7 Print-Friendly / Shareable Patch Sheets — ✅ implemented (2026-07-08, print views)

Shipped as part of the `005-print-signal-flow` feature: the input patch, output patch, and lighting rig tabs each have a Print button that opens the browser print dialog on a dedicated paper-friendly sheet — event header, black-on-white static table (no form controls or app chrome), column headers repeating on every page. Save-as-PDF is covered by the same dialog. A shareable read-only web link for remote collaboration remains post-v1.

### 3.8 Production Binary (Frontend Embedded in Backend) — ✅ implemented (2026-07-21, Slice 18)

Shipped as part of `018-deployment`: `make build` compiles the frontend, copies its `dist/` output into `backend/cmd/dist`, and `go build` embeds that directory via `//go:embed dist`. The resulting single Go binary serves the API and the compiled frontend from one origin, with a catch-all SPA-fallback route for client-side routes. See `specs/018-deployment/quickstart.md` for the deployment runbook (nginx + Certbot reverse proxy, systemd process supervision, SQLite backups).

### 3.9 Owned / Non-Rental Equipment — ✅ implemented (2026-07-07)

Shipped as the `003-equipment-lists` feature: a separate owned-gear catalog (Inventory page → Owned gear) with per-event planning lines on the Equipment tab. Owned gear lives in its own tables, so it can never appear on the rental order or in the export — isolation is guaranteed by construction and locked in by tests. Over-planned lines (more than you own) are flagged.

### 3.10 Supplier-Agnostic Catalogs and PDF Orders — ✅ implemented (2026-07-25, Slice 22)

Shipped as `022-generic-inventory-formats`. The tool no longer depends on one supplier's price list: a catalog can come from a generic spreadsheet (with a downloadable template) or be typed in by hand, and every event exports as a category-grouped PDF and a plain spreadsheet in addition to the price-list file. The `LL.xlsx` export became conditional on provenance — an inventory earns it by having imported that file, and is refused it otherwise. See §2.2 and §2.7.

The one behavioural subtlety worth remembering: `UpsertInventory` presumes every item gone before reviving whatever the file contains. Hand-entered items are excluded from that sweep *and* from the name-matching pool; without the second exclusion an imported row would adopt a same-named hand-entered row and silently overwrite its price and quantity.

### 3.11 Multi-Event and Tour Planning

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
| `github.com/xuri/excelize/v2` | Excel reading and writing: both importers, the blank inventory template, the price-list export, and the generic spreadsheet order |
| `github.com/go-pdf/fpdf` | PDF rental order (Slice 22). Pure Go, no CGO. Uses built-in Helvetica with a cp1252 translator, so no font files are embedded — which means **every glyph drawn must be cp1252-representable** (`å ä ö é` yes; `▲`, en dash, `·` no). Adds six modules to `go.mod` but only one to the binary: the rest back optional barcode/template subpackages that are never imported |

**Why `modernc.org/sqlite` instead of `mattn/go-sqlite3`:** The mattn driver requires CGO, which complicates cross-compilation (especially to Windows from Linux) and adds a C toolchain requirement for anyone building the project. The modernc pure-Go implementation avoids this entirely at a negligible performance cost for this workload.

**Why SQLite:** The tool is designed as a locally-hosted, single-user application. There is no need for a networked database server, replication, or concurrent write access from multiple processes. SQLite gives full relational modeling, transactions, and foreign-key enforcement with zero operational overhead. The single `.db` file is trivially backed up and moved between machines.

### 4.2 Frontend: React + TypeScript + Vite

**Why React:** Mature ecosystem, excellent TypeScript support, and the component model maps naturally to the table-heavy, inline-editing UX that patch sheets require. The team (one person) already knows React.

**Why TypeScript:** The API surface is non-trivial — many closely-related domain objects with optional fields. TypeScript's structural typing catches mismatches between the Go JSON response shapes and the frontend code at compile time, before they become runtime bugs.

**Why Vite:** Faster dev-server startup and HMR than Webpack/CRA. Straightforward configuration. Its build output is what the backend's `go:embed` production deployment (§3.8) embeds.

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

**Authentication (roadmap Slice 14):** The tool originally ran locally (`localhost:7331`) with no auth, since a single-user local tool gets no security benefit from it. That changes ahead of deployment: Slice 14 adds Google OAuth 2.0 sign-in restricted to an allow-listed set of users, with DB-backed sessions (a SQLite table, not JWT) — see the constitution's Principle V and Technology Stack.

**Inline-edit UX (blur-to-save):** Patch sheets can have 40–80 rows with 12–15 columns each. A row-level "Save" button would create excessive friction. Saving on field blur keeps the experience close to working in a spreadsheet while ensuring data is persisted incrementally.

**Migration style:** Migrations 001–005 contain multiple statements per file and apply fully with the `modernc.org/sqlite`-backed golang-migrate driver (verified by the test suite, which builds every schema from these files). Migrations from 006 onward follow a one-statement-per-file convention anyway — smaller files are easier to review and to write correct `.down.sql` counterparts for.

**Inventory-filtered dropdowns:** Rather than allowing free text for equipment fields (mic model, amplifier, speaker, stagebox model), dropdowns are populated from the live inventory catalog and filtered by category type. This enforces that planned equipment is always traceable to a real rental item, which is a prerequisite for a correct rental order.
