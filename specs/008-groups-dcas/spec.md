# Feature Specification: Mixer Buses — Groups & DCAs

**Feature Branch**: `008-groups-dcas`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Slice 8 — mixer buses: groups & DCAs (feedback items 8–9). Per-event groups created/renamed/deleted in their own manager; LR is always present as a built-in group and is the default routing for new channels; each input channel selects the set of groups it routes to. Per-event DCAs managed the same way; the channel's DCA assignment becomes a selection over the event's DCAs instead of today's free-text string, with existing strings migrated. Input patch print sheet and Signal Flow tab show group/DCA assignments."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route input channels to managed groups (Priority: P1)

A sound engineer planning an event creates the mix groups the show will use (e.g. "Trummor", "Vocals", "Band") in a group manager on the audio inputs view. Every event starts with the built-in **LR** (main left/right) group already present. For each input channel, the engineer picks which groups the channel routes to from the event's groups; new channels start routed to LR so the common case needs no action.

**Why this priority**: This is the core of the feature — it introduces the group entity and the routing selection that the DCA story and the display story build on. Bus routing is a fundamental part of a patch sheet; today it cannot be captured at all.

**Independent Test**: Can be fully tested by creating groups on an event, assigning channels to them, and confirming the assignments persist and reload — without touching DCAs or print output.

**Acceptance Scenarios**:

1. **Given** a brand-new event, **When** the engineer opens the audio inputs view, **Then** the group manager already shows LR without anyone creating it.
2. **Given** an event, **When** the engineer creates a group "Trummor", **Then** it appears in every channel's group selection for that event (and only that event).
3. **Given** an event with groups, **When** the engineer adds a new input channel, **Then** the channel is routed to LR by default.
4. **Given** a channel, **When** the engineer selects groups "LR" and "Trummor", **Then** both assignments persist across a page reload.
5. **Given** a channel routed only to LR, **When** the engineer removes LR from its selection, **Then** the channel is routed to no groups (allowed — e.g. a channel that only feeds a recording feed) and is shown as such.
6. **Given** a group "Trummor" assigned to four channels, **When** the engineer renames it to "Drums", **Then** all four channels show the new name immediately.
7. **Given** a group assigned to channels, **When** the engineer deletes it after confirming, **Then** the group disappears from those channels' routing; the channels are otherwise untouched.
8. **Given** the built-in LR group, **When** the engineer tries to rename or delete it, **Then** the action is unavailable.

---

### User Story 2 - Assign DCAs by selection instead of free text (Priority: P2)

The engineer manages the event's DCAs (e.g. "Trummor", "Keys") in a manager alongside groups. On each input channel, the DCA assignment is a selection over the event's DCAs — replacing today's free-typed text. DCA text already entered on existing events shows up as proper DCAs with the assignments intact after the upgrade.

**Why this priority**: Same interaction pattern as groups but replaces an existing (worse) mechanism rather than adding a missing one — valuable, but the patch sheet is usable today with the text field.

**Independent Test**: Can be tested by creating DCAs on an event, assigning channels, and verifying an event with pre-existing DCA text shows the same values as selectable DCAs after upgrade.

**Acceptance Scenarios**:

1. **Given** an event, **When** the engineer creates a DCA "Trummor", **Then** it is selectable on every input channel of that event.
2. **Given** a channel, **When** the engineer selects DCAs for it, **Then** the channel may belong to zero, one, or several DCAs and the selection persists.
3. **Given** an event that had channels with DCA text "Trummor" before the upgrade, **When** the event is opened afterwards, **Then** a DCA named "Trummor" exists on the event and those channels are assigned to it — no free text remains.
4. **Given** a channel with pre-upgrade DCA text "Trummor, Keys", **When** the event is opened after the upgrade, **Then** the channel is assigned to two DCAs, "Trummor" and "Keys".
5. **Given** DCAs on the event, **When** the engineer renames or deletes one, **Then** channel assignments follow the rename, and deletion (after confirming) removes the assignment from affected channels.
6. **Given** an event, **When** the engineer looks for the old DCA text input, **Then** it is gone — DCA assignment is selection-only.

---

### User Story 3 - See routing on the print sheet and in Signal Flow (Priority: P3)

The input patch print sheet and the Signal Flow tab show each channel's group routing and DCA membership, so the paper/PDF handed to the crew and the per-channel flow view carry the full mix assignment.

**Why this priority**: Pure presentation of data captured in stories 1–2; valuable for the printed sheet's completeness but nothing new can be entered here.

**Independent Test**: Assign groups/DCAs to channels, open the print preview and the Signal Flow tab, and verify the assignments are rendered.

**Acceptance Scenarios**:

1. **Given** channels with group and DCA assignments, **When** the engineer prints the input patch sheet, **Then** each row shows its groups and DCAs by name.
2. **Given** a channel routed to several groups, **When** viewed on the sheet, **Then** all group names are listed legibly (e.g. comma-separated).
3. **Given** a channel in the Signal Flow tab, **When** its flow is displayed, **Then** the channel's groups and DCAs are visible alongside the existing source-to-console chain.
4. **Given** a channel with no group routing, **When** printed, **Then** the groups cell is empty — not an error, not a placeholder.

---

### Edge Cases

- Creating a group or DCA with a name that already exists on the event (including "LR", case-insensitively) is rejected with a clear message — duplicates would make selections ambiguous.
- Creating a group or DCA with an empty/whitespace-only name is rejected.
- Deleting a group or DCA that channels are assigned to asks for confirmation and states how many channels are affected before removing the assignments.
- Deleting an event removes its groups, DCAs, and all assignments (no orphans).
- Pre-upgrade DCA text that is only whitespace or empty produces no DCA and no assignment.
- Two channels with the same pre-upgrade DCA text produce **one** DCA with two assignments, not two DCAs.
- Pre-upgrade DCA text differing only in surrounding whitespace ("Trummor" vs " Trummor ") maps to the same DCA.
- The upgrade runs once: re-opening the event or re-importing the price list must not duplicate DCAs or assignments.
- Groups and DCAs are per-event: same-named groups on two events are independent entities.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let users create, rename, and delete named **groups** per event, managed from the audio inputs area alongside the existing stagebox/multi managers.
- **FR-002**: Every event MUST always have a built-in **LR** group that cannot be renamed or deleted, present on new and existing events without user action.
- **FR-003**: Each input channel MUST carry a set of group assignments (zero or more) chosen from that event's groups; free-text entry of group names on a channel is not offered.
- **FR-004**: New input channels MUST default to being routed to LR; users can remove that routing per channel.
- **FR-005**: The system MUST let users create, rename, and delete named **DCAs** per event, managed the same way as groups.
- **FR-006**: Each input channel MUST carry a set of DCA assignments (zero or more) chosen from that event's DCAs, replacing the current free-text DCA field, which is removed from the channel row.
- **FR-007**: Group and DCA names MUST be non-empty and unique within their kind on the event (case-insensitive); violations are rejected with a message.
- **FR-008**: Renaming a group or DCA MUST be reflected on every channel assigned to it; deleting one MUST remove its assignments from all channels after the user confirms, leaving the channels otherwise unchanged.
- **FR-009**: Existing DCA text on input channels MUST be converted during the upgrade: each distinct comma-separated, whitespace-trimmed, non-empty token becomes a DCA on the channel's event (one DCA per distinct name), and the channel is assigned to it. The conversion runs exactly once and leaves no free text behind.
- **FR-010**: Input channels existing before the upgrade MUST be routed to LR by the upgrade (matching the default for new channels).
- **FR-011**: The input patch print sheet MUST show each channel's group names and DCA names.
- **FR-012**: The Signal Flow tab MUST show each channel's group and DCA assignments alongside the existing flow chain.
- **FR-013**: Deleting an event MUST remove its groups, DCAs, and all channel assignments.

### Key Entities

- **Group**: A named mix bus belonging to one event. Attributes: name (unique per event, case-insensitive), built-in flag (true only for LR). LR exists on every event.
- **DCA**: A named control assignment belonging to one event. Attributes: name (unique per event, case-insensitive). No built-in member.
- **Channel routing assignment**: The many-to-many link between an input channel and the groups it routes to, and between an input channel and the DCAs it belongs to. Removed automatically when either side is deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Group and DCA assignment on a channel is 100% selection-based — no free-text bus or DCA entry remains anywhere in the input patch.
- **SC-002**: After the upgrade, 100% of previously entered DCA text values are present as selectable DCAs with their channel assignments intact (verified against a copy of the production data).
- **SC-003**: A newly added channel is routed to LR with zero additional user actions.
- **SC-004**: An engineer can create a group and route five channels to it in under one minute.
- **SC-005**: Every channel's group and DCA assignments appear on the printed input patch sheet and in the Signal Flow tab.

## Assumptions

- Groups and DCAs are **per-event** entities (like stageboxes and stage multis), not a shared library across events — matches "created separately" in the request and the established per-event manager pattern.
- A channel may belong to **multiple DCAs** as well as multiple groups: the request says DCAs are "created like groups" and selected the same way, and real consoles allow multi-DCA membership. The existing field name (`dca_groups`, plural) and comma-separated legacy values support this.
- Removing LR from an individual channel is allowed (only the group itself is protected); a channel routed to no groups is a valid state (e.g. record-only feeds).
- Deleting an in-use group/DCA removes the assignments (with confirmation) rather than being blocked — the per-event manager pattern (stageboxes) clears references on delete; the 409 in-use protection used for shared reference data does not apply to per-event entities.
- Legacy DCA text is split on commas; every trimmed non-empty token is a valid DCA name, so the one-time conversion always succeeds and no legacy-label fallback is needed (production data currently holds only single-word values, e.g. "Trummor").
- Groups capture **routing membership only** — no levels, sends, or output/matrix behavior; how group buses reach outputs is Slice 10 (output chains) territory.
- Groups and DCAs involve no equipment selection, so the rental order, stock flagging, and the Excel export are unaffected (standing invariant not triggered).
- Output channels are out of scope: the request applies groups/DCAs to audio **inputs**; output-side bus structure arrives with Slice 10.
