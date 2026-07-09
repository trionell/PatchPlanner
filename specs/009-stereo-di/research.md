# Phase 0 Research: Mono/Stereo Channels & DI Cabling

## R1 — Where does "width" live, and how is a stereo channel represented?

**Decision**: Add `width TEXT NOT NULL DEFAULT 'mono'` (values `mono`|`stereo`) to `audio_patch_inputs` and `audio_patch_outputs`. Side B of a stereo channel is **not** a second row — it is a second set of routing columns on the same row: `stagebox_id_b`, `stagebox_channel_b`, `stage_multi_id_b`, `stage_multi_channel_b`.

**Rationale**: One row per logical channel keeps channel numbering, notes, colors, group/DCA membership, and equipment picks singular and unambiguous (per spec: both sides share one set of equipment picks). Two independent rows linked by a `pair_id` was considered and rejected — see alternatives. Column-doubling mirrors the existing pattern where `stagebox_id`/`stagebox_channel` and `stage_multi_id`/`stage_multi_channel` already coexist as mutually-exclusive route pairs on one row; adding a `_b` suffix of the same four columns is a direct, low-risk extension of a pattern the codebase already has, and requires no join.

**Alternatives considered**:
- *Two linked rows (`pair_id` FK to self)*: would let each side carry independent equipment/notes, which the spec explicitly rules out of scope. Also multiplies channel-numbering logic (two rows sharing one number, or two numbers that must render as one) and breaks every existing per-row assumption in the tabs, print sheets, and signal flow. Rejected as unnecessary complexity for a scope the spec doesn't require.
- *Separate `stereo_pairs` table*: over-engineered for a same-row, same-equipment pairing; no query needs to join pairs independently of their owning channel.

## R2 — Mixer behavior representation and numbering interaction

**Decision**: Add `mixer_behavior TEXT NOT NULL DEFAULT 'stereo_channel'` (values `stereo_channel`|`linked_channels`) to `audio_patch_inputs` only (per spec, outputs have no console-strip semantics). Purely a display/numbering-suggestion attribute — it does not affect physical routing (side B routing is independent regardless of mixer behavior) or rental counting (a stereo channel doubles equipment the same way in either mode, since both still represent two physical inputs).

**Rationale**: Spec FR-003/FR-004 scope mixer behavior strictly to console channel-number *display* ("5" vs "5–6") and *suggested* numbering for new rows. It has zero effect on the physical patch (FR-002/FR-002a) or on the rental CTE (FR-005 counts by width alone). Keeping it a single enum column avoids coupling numbering logic to routing logic.

**Numbering suggestion algorithm**: `addRow` on the input tab currently does `lastNumber = inputs.at(-1)?.channel_number ?? 0; next = lastNumber + 1`. Extend to: the occupied-number set is `channel_number` for mono/stereo-channel rows, and `{channel_number, channel_number+1}` for `linked_channels` rows; the suggested number for a new row is the smallest integer greater than every existing row's highest occupied number (i.e., still `max(occupied) + 1`, just computed over the expanded occupancy set instead of raw `channel_number`). This is a pure frontend computation — no backend change, since the spec only requires "suggested numbers skip occupied pairs," not server-side collision prevention (edge case: duplicate/overlapping numbers stay planner-managed, exactly like today).

**Alternatives considered**: Deriving mixer behavior implicitly from whether side B's channel number equals channel_number+1 was rejected — it would silently reclassify a channel the moment its explicit routing happened to be adjacent, contradicting the independent-patching model (FR-002a: explicit routing is never inferred-away).

## R3 — DI source cable and the two-cables-vs-splitter choice

**Decision**: Add `source_cable_item_id INTEGER REFERENCES inventory_items(id)` to `audio_patch_inputs`, reusing the exact validation/display pattern already used for `cable_item_id` (`db.ValidateInventoryItemExists`-style FK check, resolved to a catalog label in `itemLabelById` on the frontend). Add `source_cabling TEXT NOT NULL DEFAULT 'two_cables'` (values `two_cables`|`splitter`), meaningful only when `signal_type = 'di'` and `width = 'stereo'`.

**Rationale**: The spec is explicit that the source cable is "from the same cable catalog as all other cable picks" (FR-006) — no new inventory concept, no new picker component; the existing cable-picker UI used for `cable_item_id` is reused verbatim, pointed at `source_cable_item_id`. The two_cables/splitter choice only changes the **rental multiplier** (1 vs 2) applied to that single pick — it does not create a second item reference, since a splitter is still one catalog item counted once, and "two individual cables" is the same catalog item counted twice (spec assumes one cable *type* is picked, not two different ones — consistent with the shared-equipment-across-sides assumption in R1).

**Alternatives considered**: A second `source_cable_item_id_b` column (mirroring the stagebox/multi side-B pattern) was considered so two *different* cable types could be picked for a two-individual-cables DI. Rejected: the spec's Assumptions section explicitly scopes shared equipment picks across both sides as the model ("Differing per-side picks ... are out of scope"), so a single pick + multiplier is sufficient and simpler.

## R4 — Rental CTE: doubling and two-channel-device exceptions

**Decision**: Extend the existing `combined` CTE in `rental.go` (currently a `UNION ALL` of arms, one `SELECT` per catalog-reference column) with a `quantity` expression per arm instead of the current literal `1`:

- Per-side items (mic, stand, cable on inputs/outputs, speaker): `CASE WHEN width = 'stereo' THEN 2 ELSE 1 END`
- Two-channel devices (DI recognized as such only via `signal_type = 'di'`, amplifier): stays literal `1` regardless of width
- Source cable (new arm): `CASE WHEN width = 'stereo' AND source_cabling = 'two_cables' THEN 2 ELSE 1 END`, `WHERE signal_type = 'di' AND source_cable_item_id IS NOT NULL`

**Rationale**: This is additive to the existing arm-per-column CTE shape already established in `rental.go`; no restructuring, no new joins, and the query still takes the event ID N times via `?` placeholders (N grows by one for the new source-cable arm). `mic_item_id`'s existing arm already fires for DI channels too (a DI's "mic" slot doesn't apply, but that arm is `WHERE mic_item_id IS NOT NULL`, and DI rows have no mic_item_id in practice — no special-casing needed there). The `signal_type = 'di'` check on the DI→preamp cable's own arm is unnecessary since the existing `cable_item_id` arm already doubles for *any* stereo channel, DI or not — correct, since a stereo mic channel's cable is physically two cables regardless of signal type.

**Alternatives considered**: Doing the doubling in Go after a single-count query was rejected — it would require re-deriving per-item-role stereo/DI logic outside SQL, duplicating the arm structure anyway, and the existing codebase's convention (confirmed in `rental.go`) is to push all counting into the CTE.

## R5 — Signal flow and print sheet extensions

**Decision**: `buildChannelFlow` gains two additions, both additive to `ChannelFlow`: an optional `sourceCable: FlowHop` (present only when `signal_type === 'di'`) that renders "no source cable picked" as `missing: true`, and an optional `pathB: FlowHop` (present only when `width === 'stereo'`) computed by the same `pathHop`-style logic against the `_b` columns. `hasGap` becomes `source.missing || cable.missing || path.missing || (sourceCable?.missing ?? false) || (pathB?.missing ?? false)`.

**Rationale**: Matches the existing "flagged gap vs legitimate absence" philosophy already documented in `signalFlow.ts` (a channel with no stagebox/multi is a legitimate direct-to-console run; a DI with no source cable is not legitimate, since FR-010 explicitly requires it be flagged). Reusing `pathHop`'s exact missing-vs-present rules for side B keeps the two sides visually and logically consistent.

**Print sheets**: `InputPatchSheet` gains a "Width" indicator merged into existing channel-number cell (renders "5" or "5–6" per mixer behavior, both computed client-side from `width`/`mixer_behavior`/`channel_number`), a second physical-connection line when stereo, and a second cable line when `source_cable_item_id` is set. `OutputPatchSheet` gains the same width/second-connection treatment (no mixer-behavior line, per FR — outputs have none).

**Alternatives considered**: A separate "stereo pair" print row (visually splitting one logical channel into two table rows) was considered for clearer per-side scanning, but rejected — FR-011 asks for one row showing both connections, and a doubled-row layout would misalign with the rest of the sheet's one-row-per-channel convention and complicate the existing sort-by-channel-number logic.

## R6 — Migration safety for existing rows

**Decision**: All new columns are added with safe defaults (`width` defaults `'mono'`, `mixer_behavior` defaults `'stereo_channel'`, `source_cabling` defaults `'two_cables'`) or nullable (`stagebox_id_b`, `stagebox_channel_b`, `stage_multi_id_b`, `stage_multi_channel_b`, `source_cable_item_id`). No backfill logic needed — a plain `ALTER TABLE ... ADD COLUMN` leaves every existing row mono with no side B and no source cable, satisfying spec Edge Case "Existing events" and SC-005 (zero change) by construction.

**Rationale**: Unlike migration 021 (which had real free-text data to convert), this slice adds no data that previously existed in another form — width and source cabling are brand-new concepts with no legacy representation to migrate from. A single up/down migration file is sufficient; down drops the added columns.

**Alternatives considered**: None needed — this is the simplest possible correct migration for purely additive, defaulted/nullable columns.

## R7 — Validation of new enum-like TEXT columns

**Decision**: `width`, `mixer_behavior`, and `source_cabling` are validated in the API handler layer against fixed Go string-slice constants (`domain.ValidWidths`, `domain.ValidMixerBehaviors`, `domain.ValidSourceCablings`), returning 400 on an unrecognized value — the same pattern already used for `destination_type` (a `CHECK` constraint in SQL) but enforced in Go instead of a `CHECK`, since Principle II already established (in slice 4/reference work) that behavior-bearing enums live in code, not reference-vocabulary tables (see plan.md Constitution Check, Principle II note).

**Rationale**: These three values drive doubling/pairing/numbering *logic*, not just display labels — unlike `channel_colors` or `signal_cable_types` (arbitrary-length, freely user-editable palettes/catalogs with no code branching on specific values), a stray fifth "width" value would have no defined counting behavior. This mirrors `destination_type`'s existing precedent exactly.

**Alternatives considered**: A DB-level `CHECK` constraint (matching `destination_type`'s current SQL-level enforcement) was considered; Go-level validation was chosen instead only because two of the three new columns (`mixer_behavior`, `source_cabling`) are conditionally meaningful (ignored when not stereo / not DI) and a `CHECK` can't express "valid value OR irrelevant-but-present default," making error messages worse for no safety gain over handler-level validation, which the codebase already does for cross-field checks (e.g. bus reference validation in slice 8).
