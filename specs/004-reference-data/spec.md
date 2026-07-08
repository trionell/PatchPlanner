# Feature Specification: Configurable Reference Data

**Feature Branch**: `004-reference-data`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Configurable reference data: the connector, cable, signal, output, mic-stand, power-connector, and truss vocabularies used across planning become editable data with sensible defaults, and lighting fixture models get selectable DMX modes that auto-fill channel counts." (ROADMAP.md Slice 4; PROJECT.md §3.5; Constitution Principle II — equipment types, connector types, and fixture definitions defined as data, not hard-coded logic.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Planning dropdowns driven by stored vocabularies (Priority: P1)

Every choice list a technician uses while planning — signal types, preamp connectors, signal and speaker cable types, output types, mic stands, power connectors, truss types — comes from stored, named vocabularies instead of lists baked into the application. On day one the vocabularies contain exactly today's values, so every existing plan and every planning workflow looks and behaves identically; the difference is that the values now live in one editable place.

**Why this priority**: This is the foundation everything else stands on — vocabularies must exist as data before anyone can edit them, and it discharges the project's standing rule that equipment and connector types are data, not code. It also removes the current triple bookkeeping (application rules, stored checks, and interface lists) that can drift apart.

**Independent Test**: Upgrade an existing database with saved events; open every planning tab and confirm each dropdown offers the same choices as before, existing rows display their stored values, and saving a row with each vocabulary value still works.

**Acceptance Scenarios**:

1. **Given** an existing database with saved patch rows and fixtures, **When** the application starts after the upgrade, **Then** all vocabularies are present with today's values and every previously saved row still displays and edits correctly.
2. **Given** any planning dropdown (signal type, preamp connector, cable type, output type, mic stand, power connector, truss type), **When** it is opened, **Then** its choices come from the stored vocabulary — the same list a settings page would show.
3. **Given** a vocabulary value stored on a planning row, **When** the row is saved again unchanged, **Then** it is accepted (no value that was valid before the upgrade becomes invalid).

---

### User Story 2 - Manage vocabulary values in a settings page (Priority: P2)

A technician encounters gear the vocabularies don't cover — a DMX 5-pin cable, a Cat6/etherCON run, a mini boom stand. On a settings page they pick the vocabulary, add a value with a display label, and it appears in the matching planning dropdowns immediately. They can also rename a value's label (fixing a typo or preferring different wording) and remove values they never use — removal is refused with an explanation when the value is in use on any plan.

**Why this priority**: This is the user-visible payoff of US1: the tool grows with the gear instead of waiting for software changes. Second priority because it needs US1's stored vocabularies to exist first.

**Independent Test**: On the settings page add "DMX 5-pin" to signal cable types; open an event's input patch and select it on a channel; rename its label and see the new label on the row; attempt to delete it while in use and get refused with the reason; clear the channel and delete it successfully.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** the technician adds a value to a vocabulary, **Then** it persists and appears in that vocabulary's planning dropdowns without restarting anything.
2. **Given** an existing value, **When** its display label is renamed, **Then** planning rows using it show the new label while remaining the same underlying value.
3. **Given** a value in use on at least one planning row, **When** deletion is attempted, **Then** it is refused with a message stating it is in use.
4. **Given** a value not in use anywhere, **When** it is deleted, **Then** it disappears from the settings page and from planning dropdowns.
5. **Given** an attempt to add a duplicate of an existing value in the same vocabulary, **When** it is submitted, **Then** it is rejected with a clear message.

---

### User Story 3 - Fixture DMX modes with auto-filled channel counts (Priority: P3)

Lighting fixture models operate in different DMX modes with different channel footprints (a moving head might run 16-channel basic or 39-channel extended mode). The technician defines the modes a fixture model supports — mode name and channel count — once per model. When patching that fixture on a rig, they pick a mode from the model's list and the channel count fills in automatically, so DMX addressing calculations use the right footprint without the technician remembering each fixture's channel map.

**Why this priority**: Real workflow value (§3.5) and the last hard-coded fixture knowledge, but it layers on the same "definitions as data" machinery and nothing else depends on it.

**Independent Test**: Define two modes on a fixture model from the rental catalog; patch that fixture on an event rig and pick the extended mode; verify the channel count auto-fills and DMX auto-addressing spaces fixtures by that count; switch modes and see the count update.

**Acceptance Scenarios**:

1. **Given** a lighting fixture model in the catalog, **When** the technician adds modes (name + channel count), **Then** the modes persist and are listed for that model.
2. **Given** a rig fixture whose model has defined modes, **When** the technician selects a mode, **Then** the fixture's channel count is set to the mode's count automatically.
3. **Given** a fixture with a mode-derived channel count, **When** DMX addresses are auto-assigned, **Then** spacing uses that count.
4. **Given** a fixture model with no defined modes, **When** a fixture of that model is patched, **Then** the technician can still enter mode text and channel count manually exactly as today.
5. **Given** a mode in use by rig fixtures, **When** the mode's channel count is edited or the mode is deleted, **Then** already-patched fixtures keep their current values (modes are fill-in helpers, not live links).

---

### Edge Cases

- A vocabulary value stored on old rows but removed from the vocabulary later (or never seeded) must still display on those rows; the dropdown offers it as the row's current value so editing other fields doesn't force a vocabulary change.
- Renaming a label must not rewrite history: the stored value is stable, only the human-facing label changes.
- Deleting a value checks every place the vocabulary is used (inputs, outputs, fixtures, stage multis…) before allowing it.
- Duplicate protection is per vocabulary: "XLR" can exist in both signal cable types and speaker cable types, but only once in each.
- An empty vocabulary (every value deleted) leaves the dropdown empty but must not break the page or prevent saving rows that leave the field untouched.
- Fixture modes belong to catalog models; a re-import of the price list must leave defined modes intact (models are matched, not recreated).
- Structural choices that drive application behavior — output destination (local / stagebox / stage multi) and equipment category (audio / lighting / rigging / video / misc) — are not vocabularies and stay fixed; making them editable would change what the application does, not what it lists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store the following as named, editable vocabularies: signal types, preamp connector types, signal cable types, speaker cable types, output types, mic stand types, power connector types, and truss types.
- **FR-002**: On first start after the upgrade, each vocabulary MUST be pre-populated with the values in use today, and every previously saved planning row MUST remain valid and displayable unchanged.
- **FR-003**: All planning dropdowns for these vocabularies MUST be driven by the stored values; no hard-coded copies of the lists may remain in the application for these vocabularies.
- **FR-004**: Technicians MUST be able to add a value (with display label) to any vocabulary from a settings page, and it MUST become available in planning immediately.
- **FR-005**: Technicians MUST be able to rename a value's display label; rows referencing the value MUST show the new label without being modified.
- **FR-006**: Deleting a vocabulary value MUST be refused with an explanatory message while any planning row uses it, and MUST succeed otherwise. Duplicate values within one vocabulary MUST be rejected.
- **FR-007**: Rows whose stored value is absent from the current vocabulary MUST still display that value, and editing such a row MUST NOT force the technician to change it.
- **FR-008**: Technicians MUST be able to define, edit, and delete DMX modes (name + channel count, both required, count ≥ 1) on lighting fixture models in the catalog.
- **FR-009**: Selecting a defined mode on a rig fixture MUST auto-fill the fixture's channel count from the mode; manual entry of mode text and channel count MUST remain possible for models without defined modes.
- **FR-010**: Editing or deleting a mode MUST NOT alter fixtures already patched with it (the mode is copied at selection time, not linked live).
- **FR-011**: Re-importing the price list MUST leave vocabularies and fixture modes untouched.

### Key Entities

- **Vocabulary**: A named category of planning choices (e.g., "signal cable types"). Fixed set of eight vocabularies; the values within each are the editable part.
- **Vocabulary value**: One choice within a vocabulary — a stable stored value plus a human-facing display label, unique per vocabulary.
- **Fixture mode**: A DMX operating mode belonging to one catalog fixture model — mode name and channel count. A fill-in template for patching, not a live reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After upgrading an existing database, 100% of previously saved planning rows display and re-save without any change forced on the technician.
- **SC-002**: A technician can add a new connector/cable/stand value and use it on a planning row in under 30 seconds, with no restart or software change.
- **SC-003**: 0 of the eight vocabularies remain hard-coded in the application's planning screens.
- **SC-004**: Deletion of an in-use vocabulary value is refused 100% of the time, with a message naming the reason.
- **SC-005**: Selecting a defined fixture mode fills the channel count correctly 100% of the time, and subsequent DMX auto-addressing uses that count.
- **SC-006**: Re-importing the price list changes 0 vocabulary values and 0 fixture modes.

## Assumptions

- The eight vocabularies listed in FR-001 are the complete set for this slice. Output destination types and equipment category types stay fixed because they select application behavior, not terminology.
- Seeded defaults are exactly the values offered today (including the Swedish-labeled power connectors), so the upgrade is invisible until someone opens the settings page.
- Vocabulary values are flat value+label pairs; ordering is alphabetical by label (no manual sort order in this slice).
- Fixture modes attach to rental-catalog fixture models (the same models rig fixtures already reference). Owned-gear items are not patchable as fixtures today, so they carry no modes.
- Mode selection is copy-on-pick: patched fixtures store their own mode text and channel count, so later mode edits never silently rewrite a rig.
- Single-user local tool: no permissions or audit trail on vocabulary edits.
