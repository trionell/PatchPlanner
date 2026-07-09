# Feature Specification: Output signal chains

**Feature Branch**: `010-output-chains`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Slice 10 — Output signal chains (feedback item 4): today an output is just source + destination; real rigs are multi-hop chains that branch. Per-output chain of hops (e.g. mixer → stagebox output → controller → amplifier → sub 1 → sub 2 (chained) → speaker top; or the trivial mixer local out → active speaker; or IEM paths: stagebox (×2 outputs for a stereo bus) → multichannel headphone amp → stage multi → bodypack → headphones). Branching: one source/bus can fan out to multiple stageboxes/chains, and shared devices (a multichannel headphone amp) are declared once and referenced by several output channels. Each hop selects its device (inventory or owned gear) and the cable into it, all counted on the rental order. Stereo LR chains reuse Slice 9's stereo semantics. Signal Flow tab and output print sheet render the full chains; gap flagging extends to incomplete hops."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Document a full multi-hop output chain (Priority: P1)

A system tech plans an output channel that doesn't go straight from the mixer to a
speaker: mixer → stagebox output → amplifier controller → amplifier → sub 1 →
sub 2 (daisy-chained) → top speaker. Today only the start (mixer) and one
piece of end equipment (a single amplifier + a single speaker) can be
recorded; everything in between is invisible, so it never lands on the
rental order or the print sheets.

**Why this priority**: This is the core problem statement — without it, the
rental order still misses real equipment for any rig more complex than the
simplest "local out → active speaker" case, which is the exact gap this
slice exists to close.

**Independent Test**: Can be fully tested by building a 5+ hop chain on one
output channel and confirming every device and cable in it appears once,
correctly, on the rental order and the output print sheet.

**Acceptance Scenarios**:

1. **Given** an output channel with no chain yet, **When** the tech adds
   hops in order (stagebox output → controller → amplifier → sub 1 → sub 2 →
   top speaker), each with its device and connecting cable, **Then** the
   channel's full path is stored in that order and every device/cable pick
   appears once on the rental order.
2. **Given** a chain already has hops, **When** the tech reorders or removes
   a hop from the middle, **Then** the remaining hops keep their relative
   order and the rental order updates to match — the removed hop's
   device/cable no longer counts.
3. **Given** the simplest case (mixer local out straight to an active
   speaker), **When** the tech sets that up, **Then** it requires no more
   steps than it does today — the chain model doesn't add friction to the
   common case.

---

### User Story 2 - Reuse a shared device across several output channels (Priority: P2)

A multichannel headphone amplifier feeds eight separate IEM mixes. Today
there is no way to record "this one physical amp is shared" — a tech would
either duplicate its rental count eight times (wrong) or omit it (a
price-list leak). The tech needs to declare the amp once for the event and
have every IEM channel's chain point at that same declared instance.

**Why this priority**: Without this, User Story 1's chain-building would
force a choice between double-counting shared gear or under-documenting it —
the fan-out case named explicitly in the field feedback that motivated this
slice.

**Independent Test**: Can be fully tested by declaring one shared device,
referencing it from multiple output channels' chains, and confirming the
rental order counts it exactly once regardless of how many channels
reference it.

**Acceptance Scenarios**:

1. **Given** no shared devices exist yet for the event, **When** the tech
   declares a headphone amplifier as a shared device, **Then** it becomes
   selectable as a hop's device from any output channel's chain.
2. **Given** a shared device is referenced by three output channels' chains,
   **When** the rental order is generated, **Then** that device appears
   exactly once at quantity 1, not three times.
3. **Given** a shared device is still referenced by at least one chain,
   **When** the tech deletes it, **Then** the deletion succeeds and every
   hop that referenced it reverts to "device not yet picked" (a visible
   gap), consistent with how deleting a stagebox or stage multi already
   clears the routes that pointed at it instead of blocking the deletion.

---

### User Story 3 - See and print the full chain (Priority: P3)

A system tech reviewing the rig before load-in wants to see, per output
channel, the complete path from mixer to final destination — not just the
first and last piece of equipment — and print it the same way the existing
patch sheets and Signal Flow tab already work for inputs.

**Why this priority**: Valuable once chains exist (P1/P2), but the planning
and rental-correctness value is already delivered without it — this closes
the loop for on-site use and gap-checking, mirroring the input-side Signal
Flow work already shipped.

**Independent Test**: Can be fully tested by opening the Signal Flow tab and
the output print sheet for an event with multi-hop chains and confirming
every hop renders in order, with any hop missing a device or cable flagged
as a gap.

**Acceptance Scenarios**:

1. **Given** an output channel with a complete 4-hop chain, **When** the
   tech views the Signal Flow tab, **Then** all four hops render in order
   between the mixer and "Console" labels, matching the input side's
   existing chain display.
2. **Given** a hop is missing its cable pick, **When** the tech views the
   Signal Flow tab or print sheet, **Then** that hop is visibly flagged as a
   gap and counted in the gap total, the same way a missing input cable is
   flagged today.
3. **Given** a stereo output channel with independently patched sides,
   **When** the tech views its chain, **Then** both sides' hops render,
   matching how stereo inputs already show a "Side B" line.

---

### Edge Cases

- A chain with zero additional hops (today's trivial "local out → active
  speaker" shape) must keep working exactly as before — no forced extra
  steps.
- A hop may specify a device without a cable, a cable without a device, or
  neither yet — Signal Flow must flag incomplete hops as gaps without
  crashing on partial data.
- A shared device referenced by several chains must still be edited (name,
  underlying catalog/owned item) from one place, with the change visible
  everywhere it's referenced.
- A stereo output channel's per-side hops (cables, non-shared
  speakers/devices) double the same way today's stereo speaker/cable
  doubling works; a hop pointing at a *shared* device never doubles,
  regardless of the channel's width, because the shared device is one
  physical unit.
- A stereo hop's two cable runs may need different lengths (an amplifier
  positioned on one side of the stage needs a shorter cable to the near
  speaker than the far one) — picking an independent side-B cable stops
  that hop's cable from doubling and counts each side's pick on its own.
- Deleting an output channel must remove its own chain's hops but must never
  delete a shared device that other channels' chains still reference.
- A hop's device may come from either the rental catalog or the event's
  owned-gear list; an owned-gear hop must be visible in the chain and on
  print sheets but must never appear on the rental order or the Excel
  export, matching the existing owned-gear rule.
- Migrating an event that only ever used the simple local/stagebox/stage_multi
  shape must produce equivalent chains with unchanged rental totals — no
  regression for rigs that never needed multi-hop chains.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to build an output channel's signal path as
  an ordered sequence of hops from the mixer/console to the final
  destination (speaker, headphones, or a routed stagebox/stage-multi
  channel for downstream handling elsewhere).
- **FR-002**: Users MUST be able to add, reorder, and remove hops within a
  chain; removing a hop must not affect the order of the remaining hops.
- **FR-003**: A channel with no additional hops MUST behave exactly like
  today's simplest case (a direct local output) — the model must not force
  extra steps for the common trivial rig.
- **FR-004**: Each hop MUST record the device the signal passes through
  (an amplifier, controller, distro, active speaker, headphone amp, etc.)
  and, independently, the cable connecting into it.
- **FR-005**: A hop's device MUST be selectable from either the rental
  inventory catalog or the event's owned-gear list; owned-gear hops MUST be
  excluded from the rental order and the Excel export, matching the
  existing owned-gear rule (Slice 3).
- **FR-006**: A hop's cable MUST be selectable from the cable catalog, using
  the same picker pattern already used for input/output cables (Slice 6).
- **FR-007**: Users MUST be able to declare a device once for the event and
  reference that same declared instance as a hop's device from multiple
  output channels' chains, so one physical unit is never mistaken for
  several.
- **FR-008**: The rental order MUST count each declared shared device
  exactly once regardless of how many chains reference it, while every
  other (non-shared) hop's device and cable is counted per channel that
  uses it — no price-list leakage and no double-counting relative to what
  today's flat model already gets right.
- **FR-009**: A stereo output channel's per-side, non-shared hop items
  (cables, dedicated speakers/devices) MUST double exactly as today's
  stereo speaker/cable doubling already works; a hop referencing a
  *shared* device MUST stay single-counted regardless of the channel's
  width.
- **FR-009a**: A hop's two physical cable runs on a stereo channel are not
  guaranteed to be the same length (e.g. an amplifier on one side of the
  stage needs a shorter run to the near speaker than the far one). Users
  MUST be able to pick side B's cable independently of side A's; left
  unset, side A's cable pick continues to double for both sides (FR-009's
  convenience default, no forced extra step); once picked, each side's
  cable MUST be counted independently instead of doubled.
- **FR-010**: Deleting a shared device MUST succeed and clear the reference
  on every hop that pointed at it (leaving those hops as an incomplete,
  gap-flagged device pick) rather than being blocked, consistent with how
  deleting a stagebox or stage multi already clears the routes that
  referenced it instead of preventing the deletion.
- **FR-011**: A chain's terminal hop MUST be able to record a destination of
  "routed to a stagebox/stage-multi channel" (today's `stagebox`/
  `stage_multi` destination types) in addition to ending at a device, so the
  "signal continues downstream, out of scope for this rig" case keeps
  working.
- **FR-012**: The Signal Flow tab MUST render every output channel's full
  chain, hop by hop, in order, mirroring the input side's existing
  source → cable → stagebox/multi → console presentation.
- **FR-013**: The Signal Flow tab and the output print sheet MUST flag any
  hop that has no device pick (device hops) or no stagebox/stage-multi
  target (route hops) as a gap, and that gap MUST be included in the
  existing gap count. A hop's cable is optional and never itself flagged
  — matching how a missing (non-DI) cable already isn't a gap on the
  input side today.
- **FR-014**: The output print sheet MUST render the full chain per channel
  (not just start/end), including both sides of a stereo channel.
- **FR-015**: Existing output rows (today's local/stagebox/stage_multi shape
  with a single amplifier and speaker) MUST be automatically converted into
  an equivalent chain with no user action required and no change to
  existing rental totals.

### Key Entities

- **Output Chain Hop**: One step in an output channel's signal path. Belongs
  to exactly one output channel, has a position within that channel's
  ordered chain, and carries a device reference (catalog item, owned item,
  or a declared shared device) and/or a cable reference. A terminal hop may
  instead record a routed stagebox/stage-multi destination.
- **Shared Output Device**: A physical device declared once per event (name
  + underlying catalog or owned-gear item), referenced by position from any
  number of output channels' chains. Counted once on the rental order no
  matter how many chains reference it. Cannot be deleted while referenced.
- **Output Channel** *(existing entity, extended)*: Gains an ordered list of
  chain hops in place of its current single amplifier/speaker/cable fields;
  its existing destination type, width, and side-B routing (Slice 9)
  continue to describe where the chain starts and, when relevant, where a
  routed terminal hop lands.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tech can fully document a 5-hop chain (stagebox output →
  controller → amplifier → two chained subs → top speaker) for one output
  channel in under two minutes.
- **SC-002**: A shared device referenced by eight different output
  channels' chains appears exactly once on the rental order, at the
  correct quantity.
- **SC-003**: Every device and cable across all output channels' chains
  that has a rental-catalog pick appears on the rental order — verified
  against the real reference event's output rigging with zero price-list
  leakage.
- **SC-004**: The Signal Flow tab and output print sheet display the
  complete, correctly ordered chain for 100% of output channels, with every
  incomplete hop flagged as a gap.
- **SC-005**: Migrating the real reference event's existing output rows
  into chains produces byte-for-byte unchanged rental totals — no
  regression for rigs that only ever used the simple case.

## Assumptions

- Chains fully replace today's flat destination + single-amplifier +
  single-speaker shape on output channels; existing rows convert
  automatically into an equivalent chain during migration, non-destructively
  and with no data loss, matching how earlier slices have upgraded existing
  rows to new shapes.
- Shared devices are a new event-scoped entity managed the same way as
  Stageboxes and Stage Multis (its own small manager: create, rename,
  delete, delete-when-unreferenced protection) rather than a special mode
  of the per-channel hop picker.
- Hop cables always belong to a single channel's chain (never shared across
  channels) and follow the existing Slice 6 cable-catalog-pick pattern;
  only hop *devices* can be declared shared per User Story 2.
- IEM-style output rows (`output_type = 'iem'`) use the exact same chain
  model as speaker-type outputs — no separate data path for IEM chains.
- "Branching" in the field feedback refers to one shared device being
  referenced by several *separate* output channels' chains (User Story 2),
  not a single output channel's chain splitting into multiple parallel
  paths — each output channel still has exactly one chain, matching every
  other per-channel model already in the codebase (inputs, existing
  outputs).
- A hop's device and cable are independently optional at the data layer
  (to allow incremental, partially-filled planning) but both are expected
  before an event is considered fully patched — gap flagging (FR-013)
  is how the UI communicates that, not a hard validation block.
