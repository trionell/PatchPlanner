# Feature Specification: Mono/Stereo Channels & DI Cabling

**Feature Branch**: `009-stereo-di`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Go ahead with slice 9" — per ROADMAP.md Slice 9 (`stereo-di`), field-feedback items 1–2: mono/stereo channel width on inputs and outputs (stereo = two physical preamps/line inputs, with per-channel mixer behavior *stereo channel* vs *linked channels*), and complete DI cabling (a DI needs a source-side line cable in addition to the DI→preamp XLR; dual-channel DIs feed two inputs from two line cables or one 3.5 mm TRS → 2×TS splitter cable). Rental aggregation counts everything per the standing invariant.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan a stereo source as one channel row (Priority: P1)

A planner adds a stereo source — playback from a laptop, a keyboard, a piano, an overhead pair — as a single row on the input list and marks it **stereo** instead of mono. The system understands that a stereo channel always occupies **two physical inputs** (two preamps or line inputs, two cables, and — where a microphone or stand is planned — two of each). Each side of the pair is patched **independently**: when a channel becomes stereo, the second side conveniently defaults to the next channel on the same stagebox or stage multi, but the planner can repatch it anywhere — a stereo crowd-mic pair placed on opposite sides of the stage goes through separate stage multis or even different stageboxes. The planner also chooses how the channel behaves on the mixing console: as a **stereo channel** (one console channel strip) or as **linked channels** (two adjacent console strips). Channel numbering, the on-screen tabs, and the printed patch sheets all present both sides unambiguously, and the rental order counts the doubled physical equipment automatically. Outputs work the same way, so the main L/R feed is one stereo row instead of two mono rows.

**Why this priority**: This is field-feedback item 1 and the slice's core model change. Every real event has stereo sources and a stereo main output; today each one must be faked as two unrelated mono rows, which splits the paperwork.

**Independent Test**: Can be fully tested by marking an input row stereo (in both mixer behaviors) and an output row stereo, then checking the tabs, printed sheets, and rental summary — no DI involvement needed.

**Acceptance Scenarios**:

1. **Given** a mono input channel with a microphone, cable, and stand planned, **When** the planner marks it stereo, **Then** the rental order counts two of the microphone, two of the cable, and two of the stand, and the physical patch shows two adjacent input connections.
2. **Given** a stereo input channel set to *linked channels* at console channel 5, **When** the planner views or prints the input sheet, **Then** the row shows it occupying console channels 5–6, and the next row's suggested channel number is 7.
3. **Given** a stereo input channel set to *stereo channel* at console channel 5, **When** the planner views or prints the input sheet, **Then** the row occupies only console channel 5 while still showing both physical input connections, and the next suggested channel number is 6.
4. **Given** a mono channel patched to stagebox channel 9, **When** the planner marks it stereo, **Then** the second side defaults to channel 10 on the same stagebox and everywhere the patch is shown, both sides are presented explicitly.
5. **Given** a stereo crowd-mic pair whose sides hang on opposite stage sides, **When** the planner repatches the second side to a different stage multi (or a different stagebox), **Then** the tabs, printed sheets, and signal flow show each side's own route.
6. **Given** a stereo output row for the main L/R feed with a speaker cable planned, **When** the planner opens the rental summary, **Then** the cable is counted twice.
7. **Given** an existing event planned before this feature, **When** the planner opens it, **Then** every channel is mono and nothing about its sheets or rental order has changed.
8. **Given** a stereo channel, **When** the planner switches it back to mono, **Then** the second physical connection disappears from all sheets and the doubled counts return to single.

---

### User Story 2 - Complete DI cabling, including dual-channel DIs (Priority: P2)

For a channel whose signal type is DI, the planner picks **two** cables instead of one: the existing XLR from the DI to the preamp, and a new **source cable** from the instrument or playback device to the DI (typically a line/instrument cable). For a **stereo** DI channel, one dual-channel DI feeds both physical inputs, and the planner chooses the source side: **two individual line cables** or **one splitter cable** (3.5 mm TRS → 2×TS) — the choice determines whether the picked source cable is counted twice or once. The rental order and Excel export count every one of these cables.

**Why this priority**: This is field-feedback item 2. Real events already carry DI channels (bass, guitar, piano) whose source-side cables are silently missing from the rental order today — line cables sit in the price list but are never counted, which is exactly the leak the rental-completeness invariant exists to stop.

**Independent Test**: Can be fully tested on mono DI channels alone: pick a source cable on a DI channel and verify it appears on sheets and in the rental summary. The stereo interplay is then tested with one stereo DI row.

**Acceptance Scenarios**:

1. **Given** a mono DI channel with an XLR picked, **When** the planner picks a line cable as the source cable, **Then** the rental order counts one DI, one XLR, and one line cable.
2. **Given** a stereo DI channel (e.g. piano through a dual-channel DI), **When** the planner chooses *two individual cables* and picks a line cable, **Then** the rental order counts one DI, two XLRs, and two line cables.
3. **Given** a stereo DI channel, **When** the planner chooses *one splitter cable* and picks a TRS→2×TS cable, **Then** the rental order counts one DI, two XLRs, and one splitter cable.
4. **Given** a non-DI channel, **Then** no source-cable choice is offered and nothing about its cabling changes.
5. **Given** a DI channel whose source cable was picked, **When** the planner changes the channel's signal type away from DI, **Then** the source cable no longer appears on sheets or in the rental order.

---

### User Story 3 - Sheets and signal flow understand width and DI chains (Priority: P3)

The signal-flow view traces a stereo channel's **both** physical paths and a DI channel's **two-hop** cabling (source → source cable → DI → XLR → preamp). A DI channel with no source cable picked is flagged as a gap, the same way a missing cable is flagged today. Printed input/output sheets carry the same pairing and cabling detail so the crew can patch from paper without asking questions.

**Why this priority**: Display depth on top of the model change. Stories 1 and 2 already make the basic rows and counts correct; this story makes the trace and paperwork complete enough to hand to a crew.

**Independent Test**: Can be tested by rendering the signal-flow view and print sheets for an event containing a mono channel, a stereo channel of each mixer behavior, and DI channels with and without source cables.

**Acceptance Scenarios**:

1. **Given** a stereo channel, **When** the planner opens the signal-flow view, **Then** the trace shows both physical connections of the pair.
2. **Given** a DI channel with both cables picked, **Then** its trace shows the chain source → source cable → DI → XLR → console.
3. **Given** a DI channel with no source cable picked, **Then** the channel is flagged as having a gap.
4. **Given** an event with stereo and DI channels, **When** the planner prints the input sheet, **Then** each stereo row shows its console numbering (single or paired) and both physical channels, and each DI row shows both cables.

---

### Edge Cases

- **Linked-channel overlap**: a *linked channels* row at console channel 5 occupies 5–6; if another row is already numbered 6, the sheets show the collision just as duplicate numbers show today — resolving numbering stays the planner's job, but suggested numbers for new rows always skip past occupied pairs.
- **Stereo default at the end of a stagebox**: marking a channel stereo when its first side sits on the box's last channel still defaults the second side to the next number; the sheets show what was planned (the planner sees, e.g., "ch 17" on a 16-channel box) and repatches the second side wherever there is room.
- **Switching stereo → mono**: second-side connections vanish from sheets, doubled rental counts return to single, and any splitter-vs-two-cables choice becomes irrelevant but harmless.
- **Switching signal type away from DI**: the source cable is dropped from display and counting; switching back to DI restores the previously picked source cable if it is still stored.
- **Splitter choice on a mono DI channel**: not offered — the two-vs-one choice only exists on stereo DI channels; a mono DI channel counts its source cable once.
- **Stereo channel with no equipment picked**: perfectly valid — width alone changes numbering and physical pairing; counts only double for items actually picked.
- **Existing events**: every pre-existing channel is mono with no source cable; their rental orders and exports are unchanged until the planner opts in per channel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every input channel and every output channel MUST have a width of **mono** or **stereo**; mono is the default, and all channels existing before this feature are mono.
- **FR-002**: A stereo channel MUST represent two **independently patchable** physical connections: each side has its own stagebox-or-stage-multi route and channel number, and both are shown wherever the physical patch is displayed (tabs, print sheets, signal flow).
- **FR-002a**: When a channel is switched to stereo, the second side MUST default to the next channel number on the first side's stagebox or stage multi (when one is set), as a convenience the planner can override; changing the first side later never silently rewrites an explicitly patched second side.
- **FR-003**: Every stereo **input** channel MUST carry a mixer behavior of **stereo channel** (occupies one console channel number) or **linked channels** (occupies its console channel number and the next); the choice is per channel with *stereo channel* as the default.
- **FR-004**: Console channel numbering displays MUST present a *linked channels* row as its number pair (e.g. "5–6"), and suggested numbers for newly added rows MUST skip numbers occupied by linked pairs.
- **FR-005**: Rental aggregation MUST count per-side physical equipment twice for a stereo channel: microphone/source item where one is picked, stand, DI→preamp cable on DI channels, and the planned cable on inputs and outputs alike.
- **FR-006**: A DI-type input channel MUST offer a second cable pick — the **source cable** (source → DI) — from the same cable catalog as all other cable picks, independent of the existing DI→preamp cable pick.
- **FR-007**: A **stereo** DI-type channel MUST offer a source-side cabling choice: *two individual cables* (source cable counted twice) or *one splitter cable* (source cable counted once); a mono DI channel counts its source cable once and offers no choice.
- **FR-008**: On a stereo DI-type channel, the DI itself MUST be counted once (a dual-channel DI feeds both inputs).
- **FR-009**: The rental order and the Excel export MUST include every source cable and every stereo-doubled count, following the standing invariant that anything picked from the price list is counted.
- **FR-010**: The signal-flow view MUST trace both physical paths of a stereo channel and the full two-hop cabling of a DI channel, and MUST flag a DI channel with no source cable picked as a gap.
- **FR-011**: Printed input and output sheets MUST show each channel's width, console numbering (single or pair), both physical connections for stereo channels, and both cables for DI channels.
- **FR-012**: Switching a channel's width or signal type MUST immediately update all displays and counts: stereo→mono drops the second side and the doubling; leaving the DI signal type drops the source cable from display and counting.
- **FR-013**: Source-cable picks MUST be validated the same way as existing cable picks (must reference an existing catalog item), and clearing a pick MUST remove it from all counts.

### Key Entities

- **Input channel**: gains a width (mono/stereo), a second independently patchable physical connection (own stagebox/stage-multi route and channel, meaningful only when stereo), a mixer behavior (stereo channel / linked channels, meaningful only when stereo), and a source cable pick with a two-cables-vs-splitter choice (meaningful only for DI signal type).
- **Output channel**: gains a width (mono/stereo) and, when stereo, a second independently patchable physical connection; a stereo output doubles its cable count.
- **Source cable pick**: a reference to a cable catalog item on DI channels, counted once or twice according to width and the splitter choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A planner can turn a stereo source into a correctly counted stereo channel (width, mixer behavior, doubled equipment) in a single row edit taking under 30 seconds.
- **SC-002**: The real reference event's piano channel can be planned as it is actually rigged — one stereo channel through one dual-channel DI with a single splitter cable — and its rental lines read exactly 1 DI, 2 XLR cables, and 1 splitter cable for that channel.
- **SC-003**: 100% of picked DI source cables appear on the rental order and in the Excel export; the price-list leak for line cables is closed.
- **SC-004**: Every stereo channel's physical pair is visible on the printed sheets and the signal-flow view — a crew member can patch the pair without asking which second channel to use.
- **SC-005**: Events planned before this feature show zero change in their sheets, rental orders, and exports.
- **SC-006**: A DI channel missing its source cable is flagged in the signal-flow view immediately, so no such gap reaches a printed sheet unnoticed.

## Assumptions

- The two sides of a stereo pair are patched **independently** — different channels, different stage multis, even different stageboxes (e.g. a crowd-mic pair on opposite sides of the stage). Adjacent-next-channel on the same route is only the convenience default when a channel is switched to stereo. Console-side adjacency for *linked channels* (n and n+1) is unaffected: some consoles require linked strips to be neighbors, and the pair numbering models that; physical patching carries no such restriction.
- Both sides of a stereo pair share one set of equipment picks (same microphone model, cable type, stand type — counted twice). Differing per-side picks (e.g. two different cable lengths) are out of scope; the workaround remains two mono rows.
- A stereo DI channel uses **one dual-channel DI**; planning two separate mono DIs for a stereo source is done as two mono rows, exactly as today.
- The source-cable concept applies only to DI-type channels. Mic channels have no source side, and line/aux/return channels' existing single cable already covers source → input.
- No new inventory items are required: line cables already exist in the price list, and a TRS→2×TS splitter cable is picked from whatever the catalog offers (adding one is ordinary catalog maintenance, not part of this feature).
- Mixer behavior (*stereo channel* vs *linked channels*) applies to input channels; a stereo output is always one output row occupying one output number, since output numbering has no console-strip semantics.
- Duplicate/overlapping console numbers remain planner-managed, as today for duplicate numbers; the system only makes occupancy visible and suggests non-colliding numbers for new rows.
- Single planner per event (established product constraint); no concurrent-edit handling.
