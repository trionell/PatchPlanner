# Feature Specification: Audio Input Signal-Flow Graph

**Feature Branch**: `012-input-signal-graph`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Refactor the Audio Inputs tab the same way the Audio Outputs tab was refactored in Slice 11: replace the flat per-channel table with an interactive, Sankey-style signal-flow graph for wiring, while keeping a table view for channel metadata (name, groups, DCA, notes, color). Separate the physical Source (mic-on-a-stand, or a bare line/instrument output) from the console Channel it feeds, so the graph — not a flag on the channel row — is what ties them together, and so the same physical source can feed more than one channel at once (double-patching, e.g. a talkback mic feeding both a FOH and a monitor channel). A Source's own configuration (mic model, stand, phantom power) only applies when it's a mic source; a line source (e.g. a bass DI'd output) just needs a connector type, no mic. DI boxes are handled as Slice 11's generic 'Processing device' node, reused unchanged. A stereo source with a single physical jack (e.g. a laptop's 3.5mm headphone output feeding a stereo DI) connects via a single splitter cable that must be billed once, not twice. Stageboxes and stage multis are reused unchanged from the existing shared model. Color is set once, on the Channel, and everything upstream (source, processing device ports, cables) inherits it automatically by tracing the graph, falling back to a neutral color when a double-patched source reaches channels of different colors. A mockup of this design (`mockup.html`, in this feature's directory) was iterated on and accepted before this spec was written, and documents the agreed visual/interaction design in detail."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Patch the input signal path on an interactive graph (Priority: P1)

An audio engineer opens the Audio Inputs tab for an event and sees three zones — Sources on the left, Processing (stageboxes, stage multis, DI boxes and similar devices) in the middle, and Channels on the right. They wire the rig by drawing cables between compatible ports: a mic source into a stagebox jack, a bass source into a DI box and onward into a stagebox, or a source straight into a channel with nothing in between. The same physical source can feed more than one channel at once (double-patching) without creating a duplicate source record.

**Why this priority**: This is the headline capability requested — replacing a flat, per-row table (today's only way to express routing) with a graph that actually shows the rig's real shape, including sharing and branching the current table can't express at all (e.g. one talkback mic feeding two channels).

**Independent Test**: On an event with one Source, one Stagebox, and one Channel, draw a cable from the Source to the Stagebox and another from the Stagebox to the Channel; confirm the Channel is shown as fed by that Source. Remove either cable and confirm the Channel is no longer fed. Add a second Channel and connect the same Source's port to it directly; confirm both Channels now show that Source as a feed, with no error and no need to duplicate the Source.

**Acceptance Scenarios**:

1. **Given** an event with a mic Source, a Stagebox, and a Channel all unwired, **When** the engineer draws a cable from the Source's port to a free Stagebox input jack, and another from that jack's paired output to the Channel, **Then** the Channel's resource summary shows the Source as its feed and the graph renders both cable segments.
2. **Given** a Source already feeding one Channel, **When** the engineer connects that same Source's port to a second, different Channel, **Then** both Channels show the Source as a feed, and no error or warning is raised.
3. **Given** two different Sources, **When** the engineer attempts to connect both to the same Channel's input port, **Then** the second attempt is rejected because a Channel's input port already carries a cable.
4. **Given** a wired cable between two nodes, **When** the engineer deletes that cable from the graph, **Then** the Channel that cable fed reverts to unfed (a gap), and the freed ports become connectable again.

---

### User Story 2 - Manage channel identity independent of wiring (Priority: P2)

An audio engineer manages a dedicated Channels list — channel number, name, width, mixer behavior, group membership, DCA membership, color, and notes — without any of it being affected by which physical source currently feeds that channel, or requiring the source's own details (mic model, stand, phantom power, connector) to be re-entered here.

**Why this priority**: Delivers the "separate channel from source" ask on its own — an engineer can plan and rename the full channel list for a show before any physical source has been wired up, exactly as they can today, but without source-only fields cluttering the channel row.

**Independent Test**: Create a Channel with no Source wired to it yet; set its name, width, groups, DCA, color and notes; confirm all of it persists and displays correctly with no source-related fields present, and with the channel's "fed by" summary correctly showing empty/unfed.

**Acceptance Scenarios**:

1. **Given** a new event, **When** the engineer adds a Channel and sets its name, groups, DCA, color, and notes, **Then** those values save and display without requiring any Source to be selected.
2. **Given** a Channel already fed by a Source via the graph, **When** the engineer edits the Channel's name or color, **Then** the change does not alter the Source's own configuration in any way.

---

### User Story 3 - Manage source identity independent of channel (Priority: P2)

An audio engineer manages a dedicated Sources list — each source's name, whether it's a mic or a line/instrument source, and (for a mic source only) which mic model, which stand, and whether phantom power is required. A line source instead only exposes a connector type, with no mic-related fields shown at all. Every source also declares a connector type and a mono/stereo width.

**Why this priority**: Completes the source/channel split from the source side, and is the direct fix for today's limitation where a line-only input (e.g. a bass) still has to go through mic-oriented fields that don't apply to it.

**Independent Test**: Create a mic Source and confirm mic/stand/phantom-power fields are present and required; create a line Source and confirm those same fields are absent, with only a connector type required; confirm neither source requires a Channel to exist yet.

**Acceptance Scenarios**:

1. **Given** a new Source marked as "mic", **When** the engineer fills in its details, **Then** they are required to pick a microphone model, and may pick a stand and toggle phantom power.
2. **Given** a new Source marked as "line", **When** the engineer fills in its details, **Then** no microphone, stand, or phantom-power field is shown or required — only a connector type.
3. **Given** any Source, **When** the engineer sets its width to "stereo", **Then** the graph shows two independently connectable output ports for that Source.

---

### User Story 4 - Signal-flow color follows the channel automatically (Priority: P3)

An audio engineer sets a color on a Channel and immediately sees that color reflected on every Source, processing device port, and cable segment that feeds it, all the way back through any stageboxes or DI boxes in between — with nothing else to configure. If a double-patched Source feeds channels of different colors, that Source (and any shared upstream ports) shows a neutral color instead of guessing.

**Why this priority**: A visual nice-to-have that makes a busy rig easier to follow at a glance, but the feature is fully usable without it (US1-3 already deliver the core value).

**Independent Test**: Color a Channel; confirm its Source (and any Processing/Stagebox ports between them) shows the same color in both the graph and the table. Double-patch that Source to a second Channel with a different color; confirm the Source's color reverts to neutral, while each cable segment still shows its own destination Channel's color.

**Acceptance Scenarios**:

1. **Given** a Channel with a color set and a single Source feeding it through a Stagebox, **When** the engineer views the graph, **Then** the Source's port, the Stagebox's matching port pair, and every cable segment between them all display the Channel's color.
2. **Given** a Source feeding two Channels of different colors, **When** the engineer views the Sources table or graph, **Then** the Source itself displays a neutral color, while each outgoing cable still displays its own destination Channel's color.
3. **Given** a Channel with no color set, **When** the engineer views its Source, **Then** the Source displays a neutral color.

---

### User Story 5 - Stereo source through a splitter cable (Priority: P3)

An audio engineer declares a Source as stereo where the physical connection is genuinely a single jack (e.g. a laptop's 3.5mm headphone output), and connects it to a stereo processing device (e.g. a stereo DI box) using one physical splitter cable rather than two independent cables. That single cable is counted once on the rental order, even though it reaches two separate input ports.

**Why this priority**: A specific, real edge case flagged during design, but narrow in scope compared to US1-3 — it refines cable counting for one particular stereo scenario rather than adding a new capability.

**Independent Test**: Create a stereo Source and a stereo Processing device (2 in / 2 out); connect both of the Source's ports to the device using the "splitter" cabling choice, picking a single catalog cable item; confirm the rental summary counts that cable item once, not twice.

**Acceptance Scenarios**:

1. **Given** a stereo Source and a stereo Processing device with two free input ports, **When** the engineer connects both ports using a shared splitter cable pick, **Then** the rental summary counts that cable item exactly once.
2. **Given** the same setup but with two independently picked cables instead of a splitter, **When** the engineer views the rental summary, **Then** the cable item(s) picked are each counted once per cable, as with any other pair of independent cables.

---

### Edge Cases

- What happens when a Channel has no Source connected to it at all? The Channel is flagged as an unfed gap in the Signal Flow view and print sheet, exactly as an unwired destination is already flagged today on the Output graph.
- What happens when an engineer tries to connect a second Source into a Channel input port that already carries a cable? The connection is rejected — a Channel's input port, like every port except a Source's output port, carries at most one cable.
- What happens when an engineer deletes a Source or Channel that still has cables attached? The deletion proceeds after confirmation, and the now-orphaned cable(s) are removed rather than blocking the deletion — mirroring the existing Output-graph device-deletion behavior.
- What happens when a Stagebox or Stage Multi already used by the Output graph is also wired on the Input graph? Both graphs share the same Stagebox/Stage Multi records but keep entirely independent cable sets (input-side jacks vs. output-side jacks), so activity on one graph never affects the other's wiring.
- What happens to a mic Source's stand/phantom-power fields if its kind is switched from "mic" to "line"? Those fields are cleared and hidden; switching back to "mic" requires re-entering them (no mic-field data is silently retained across a kind change).
- How is a stagebox or stage multi's own jack-to-channel hop billed? As pure console/network routing with no separate cable item, identical to the equivalent rule already established for the Output graph.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST represent a physical audio Source as an entity independent from a console Channel, each created, edited, and deleted separately.
- **FR-002**: System MUST allow declaring a Source as a "mic" source, requiring a microphone model selected from the equipment catalog, or a "line" source, requiring no microphone selection.
- **FR-003**: For a mic Source, system MUST allow selecting a stand and toggling phantom power; system MUST NOT show or require these fields for a line Source.
- **FR-004**: Every Source MUST declare a connector type and a mono/stereo width, regardless of its mic/line kind.
- **FR-005**: System MUST allow connecting a Source's output port to a Channel's input port either directly or through any number of intermediate Stageboxes, Stage Multis, or Processing devices, using the same node/port/cable model already established for the Output graph.
- **FR-006**: System MUST allow a single Source's output port to feed more than one Channel at once ("double-patching"), while every other port kind (Stagebox, Stage Multi, Processing device, and Channel input) continues to accept at most one cable.
- **FR-007**: System MUST treat a Stagebox's or Stage Multi's own hop from its input jack through to a Channel as pure console/network routing with no separately billable cable, mirroring the equivalent existing rule for the Output graph.
- **FR-008**: System MUST let an engineer pick a rentable cable-catalog item for every real physical cable segment in the graph (Source-to-Processing, Source-to-Stagebox, Source-to-Channel, Processing-to-Stagebox, etc.).
- **FR-009**: System MUST support declaring a Source as stereo and connecting both of its ports to a stereo Processing device using either two independently picked cables or a single shared "splitter" cable pick; when a splitter is used, the cable MUST be counted once on the rental order, not twice.
- **FR-010**: System MUST provide a Channels management view listing channel number, name, width, mixer behavior, group membership, DCA membership, color, and notes, independent of which Source feeds the channel.
- **FR-011**: System MUST provide a Sources management view listing each source's name, kind (mic/line), mic model, stand, and phantom power (mic only), connector type, and width.
- **FR-012**: System MUST continue to provide the existing Stagebox and Stage Multi management, shared unchanged with the Output graph.
- **FR-013**: System MUST continue to support Processing devices with independently configurable input and output port counts and connector types, reused unmodified from the Output graph for DI boxes and similar input-side gear.
- **FR-014**: System MUST render an interactive graph with three zones — Sources (vertical reorder only), Processing (free 2D placement), and Channels (vertical reorder only) — mirroring the Output graph's canvas conventions.
- **FR-015**: System MUST render all Sources within a single compact node (one row per Source, plus a second row for a stereo Source's second port), rather than one node per Source, so the number of Sources on an event does not increase the graph's vertical footprint per-source.
- **FR-016**: System MUST allow creating and deleting cables by clicking or dragging between two compatible free ports, and MUST reject connecting incompatible port kinds or a port that already carries a cable where fan-out is not allowed.
- **FR-017**: System MUST provide a flat, non-graph table view summarizing every graph node (Source, Processing device, Stagebox, Stage Multi, Channel) and its cabling, as an alternative to the graph view.
- **FR-018**: System MUST allow setting a color only on a Channel; the color shown for every Source and every intermediate Processing/Stagebox/Stage-Multi port MUST be derived by tracing the cable graph forward to the Channel(s) it reaches — a single color when every reachable Channel agrees, a neutral color when none is reachable yet or reachable Channels disagree — and MUST NOT be independently stored or editable anywhere else.
- **FR-019**: System MUST reflect a Source's or Channel's color both as a highlighted table row (left-edge accent plus a tinted row background) and as the matching port and cable color in the graph.
- **FR-020**: System MUST allow deleting a Source or Channel that still has cables attached, after confirmation, removing those cables rather than blocking the deletion — mirroring the existing Output-graph device-deletion behavior.
- **FR-021**: System MUST offer a "3.5mm TRS (mini-jack)" connector type, in addition to existing connector types, so a stereo consumer-line source can be declared accurately.
- **FR-022**: System MUST update the existing Input signal-flow print sheet and Signal Flow view to walk each Channel's cable graph back to its Source(s), flagging a Channel with no connected Source as a gap, mirroring how the Output graph already flags an unwired destination.
- **FR-023**: System MUST automatically convert every existing Audio Input row (today's flat model: signal type, preamp connector, stagebox/multi route, mic, cable, stand, phantom power, groups, DCA, color) into the new Source, Channel, and cable representation the first time an event is opened after this feature ships, with no manual re-entry required.
- **FR-024**: The automatic conversion in FR-023 MUST preserve each converted event's rental totals and existing stagebox/stage-multi channel routing exactly, verified against real production event data before this feature is considered complete.

### Key Entities

- **Source**: The physical origin of a signal — a microphone on a stand, or a bare line/instrument output. Attributes: name, kind (mic/line), mic model + stand + phantom power (mic only), connector type, mono/stereo width, canvas position. Never carries its own color; never directly linked to a Channel by a stored reference — only by the cable graph.
- **Channel**: A console input strip. Attributes: channel number, name, mono/stereo width, mixer behavior, group memberships, DCA memberships, color, notes. Independent of any Source; what feeds it is entirely determined by the cable graph.
- **Processing device**: Reused unchanged from the Output graph — gear with an input side and an output side (e.g. a DI box), declared once with port counts and connector types per side, positioned freely in the Processing zone.
- **Stagebox / Stage Multi**: Reused unchanged, shared between the Input and Output graphs; the Input graph is concerned with the mic/line jack ("input") side of these.
- **Cable (input-side)**: An edge from one node's output-side port to another node's input-side port, with an optional cable-catalog item pick; a Source's output port may be the origin of more than one cable at once (double-patching), every other port kind stays limited to one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An engineer can fully re-patch a 32-channel event's inputs without leaving the Audio Inputs tab, using the graph for wiring and the two tables only for Source and Channel metadata.
- **SC-002**: A single physical Source can be visibly and correctly patched to two or more Channels at once, with the source's own hardware counted once on the rental order regardless of how many channels it feeds.
- **SC-003**: Recoloring a Channel visually updates every Source, Processing device port, and cable segment feeding it within the same view, with no separate color setting required anywhere else.
- **SC-004**: A stereo consumer-line source connected to a stereo DI via one splitter cable appears once, not twice, in that cable's rental quantity.
- **SC-005**: Every event migrated from the previous Audio Inputs data model retains byte-for-byte identical rental totals and stagebox/stage-multi channel routing after the upgrade, verified against real production event data.
- **SC-006**: An event with 32 Sources shows them within a single scrollable graph node rather than 32 separate node cards, keeping the Sources column's width and per-source height constant regardless of source count.

## Assumptions

- Stageboxes and Stage Multis are reused unchanged, including their already-existing `input_count` / `channels` field, which represents the mic/line jack side relevant to this feature.
- Processing devices (the Output graph's input/output port-count device concept) are reused unmodified for DI boxes and similar input-side gear; no new entity is introduced for them.
- A Stagebox's or Stage Multi's own network hop into a Channel is never a separately billable cable, consistent with the equivalent rule already established for the Output graph.
- Color is set only on the Channel; Source and intermediate-port colors are always derived, never independently editable, and a conflicting double-patch falls back to a neutral color rather than an arbitrary pick.
- A new "3.5mm TRS (mini-jack)" connector reference value is added to the existing connector vocabulary; no other new reference vocabulary is required.
- The accepted mockup at `mockup.html` in this feature's directory documents the agreed visual and interaction design — zone layout, port/cable conventions, table layout, and the color-inheritance rule — and is the reference design this feature must match.
- This feature replaces the current Audio Inputs tab's flat single-table editing model outright, the same way Slice 11 replaced Slice 10's chain editor; the previous view is not kept as an alternative.
- Existing equipment-catalog categories (microphones, DI/line boxes, stands, cables) already cover the gear needed for this feature; no new inventory categories are introduced.
