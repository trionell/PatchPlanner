# Feature Specification: The sheet, and the edge the thumb is on

**Feature Branch**: `033-phone-sheet`

**Created**: 2026-07-28

**Status**: Draft

**Input**: The three calls in [mockup.html](mockup.html), all approved as
recommended:

> "Looks good. Go ahead with the full speckit flow."

— which settles the footer as **B** (a full-width confirm alone, delete at the
foot of the scrolling body, no Cancel), takes **M12 and M7 along** because they
live inside the six files this phase already opens, and puts **`index.html`'s
viewport meta** in this phase rather than a later one.

## Context

Wave 6 is the phone, and it is one finding wearing twelve names. **6a is the
first of its four phases and it builds no surface at all** — two primitives, one
hardening, six conversions.

[design/audit.md](../../design/audit.md) orders it first for a concrete reason:
*"five call sites are waiting on it, and the correct implementation already
exists inline in `MobileNav`."* Both halves of that sentence are the finding.
`ui/Dialog` is `max-w-2xl`, centred, with no `Escape` handler and no internal
scroll — survivable as the short confirmation box it was built for, and not
survivable as the phone's edit form, which is what five call sites use it as.
Meanwhile a correct bottom sheet — anchored, `rounded-t-xl`, scrim, safe inset —
is written inline inside `MobileNav`'s **More** menu. The pattern exists in the
tree and is not a component, which is the condition A1 and A3 were both filed
under.

### What a phone overlay does today

| | Today |
|---|---|
| Shape | Centred, `max-w-2xl`, vertically centred in the viewport |
| Scroll | None. Content past the viewport is unreachable, not scrolled past |
| Escape | None. `Drawer` has had it since Slice 23 |
| Confirm | Bottom-right, behind the virtual keyboard, next to a Cancel |
| Label voice | `FieldLabel` — sans, sentence case, 14 px. 18 of them; `MicroLabel`: 0 |
| Section list | Nine sections graded *editable / read-only / viewer*, in `sky` |
| Safe inset | Two call sites, both evaluating to `0` on the device they were written for |
| A drawer | Has no phone form at all — `Rig`, `Buses`, `Universes`, `Categories`, the catalog's manage drawer |

### The three things this phase settles

**The footer.** [patterns.md](../../design/patterns.md) §7d says *"confirm is
full width at the bottom, delete kept apart from it."*
[design-language.html](../../design/design-language.html) §8 draws `Save`,
`Cancel` and `Delete` in one row. At 375 px that is a ~185 px confirm with a
destructive control 10 px from it, in the corner a thumb rests on. The prose
wins and the specimen is redrawn: **the footer holds the confirm, full width,
and nothing else.** Delete moves to the foot of the scrolling body, and Cancel
goes — the close target, the scrim and the platform's back gesture are three
ways out already, and a fourth costs a third of the confirm's width.

**The label voice, and the badge.** M12 (18 `FieldLabel`s, 0 `MicroLabel`s) and
M7 (a phone-only vocabulary in a reserved hue) live inside the six files this
phase rewrites. Neither was assigned to a phase. Converting a container and
leaving its labels in a second voice means opening one file twice for one
appearance, and the second visit is the one that stops being scheduled —
[audit.md](../../design/audit.md) Part 3 names exactly that failure. **They ride
along.**

**The viewport.** M8's sentence has two halves, and *"the confirm button sits
where the keyboard opens"* is not a component problem. Neither is the inset the
sheet is supposed to sit above: without `viewport-fit=cover`, every
`env(safe-area-inset-*)` evaluates to `0` on iOS, so both call sites added in
Slice 21 have been inert since the day they landed. This is A5's lesson once
more — **a value a sibling positions against has to be a value that exists.**

### The sheet is a container, and containers have no opinions

[components.md](../../design/components.md) §5: `ui/Sheet` does three jobs and
*decides nothing about any of them*, which is the reason it is worth a component
rather than a `className` on `Dialog`. A sheet holds another pattern's contents
at that pattern's own tier ([patterns.md](../../design/patterns.md) §7d), and
each job keeps its own commit behaviour:

| Job | Contents | Commits |
|---|---|---|
| Row editor | `RowEditor` / `GearForm` fields | a draft, confirmed — one **Save** |
| Drawer | `DrawerSection` + `GearCard` | per card, each opening its own `GearForm` |
| Inspector | `InspectorRail`'s `Field`, `Note`, `Legend` | per field — the rail holds no draft |

[tokens.md](../../design/tokens.md) §7 amendment 2 is what makes that cheap:
**type is read, geometry is touched.** A phone keeps its tier's type and gives up
only what a finger presses. So a phone drawer is the same component tree as the
desk at `h-10` instead of `h-8` — which is why anchoring `ui/Drawer` is one
branch rather than five bespoke phone forms.

## User Scenarios

### US1 — The edit form reaches its Save (Priority: P1)

A technician standing at a stagebox taps a channel, changes its source, and
saves — with the keyboard up, on a form longer than the screen. Today the
confirm is behind the keyboard and the form does not scroll.

**Independent Test**: Open the channel edit form on a 375 × 667 viewport with a
soft keyboard raised; confirm every field is reachable by scrolling within the
overlay and that the confirm is above the keyboard.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport, **When** any phone edit form opens,
   **Then** it is anchored to the bottom edge of the screen, its top corners
   rounded and its bottom corners square, at most 85 % of the small viewport
   height tall.
2. **Given** an edit form whose fields exceed the sheet's height, **When** the
   user drags within it, **Then** the fields scroll inside the sheet and the
   page behind does not move.
3. **Given** an open sheet, **When** the confirm is rendered, **Then** it spans
   the full width of its row, is the only control in that row, and is named for
   the operation it performs.
4. **Given** an edit form for an existing row, **When** the user scrolls to the
   end of the fields, **Then** the delete control is there, left-aligned, apart
   from the confirm and never in the same row as it.
5. **Given** an open sheet, **When** the user taps the scrim, presses `Escape`,
   or activates the close control, **Then** the sheet closes without saving.
6. **Given** a save that fails, **When** the error returns, **Then** the sheet
   stays open with every value intact and the error renders above the fields.

---

### US2 — A phone drawer is the drawer (Priority: P1)

The same technician declares a stagebox that arrived at load-in, from the
loading bay, in the Rig drawer — which has never had a phone form. What opens is
recognisably the drawer they use at the desk, not a different application's form
wearing this one's colours.

**Independent Test**: Open the Rig drawer at 375 px and at 1440 px and compare:
the same sections, the same mono headings, the same 10 px spec lines, the same
chips — differing only in anchor and in the height of what is pressed.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport, **When** any `Drawer` opens, **Then** it is
   anchored to the bottom edge as a sheet, and its `width` is not applied.
2. **Given** a desktop viewport, **When** any `Drawer` opens, **Then** it is
   right-anchored exactly as before, with no visual change whatsoever.
3. **Given** a drawer with a footer, **When** it opens on a phone, **Then** the
   footer's statement renders in the sheet's footer row, above the safe-area
   inset.
4. **Given** any phone edit form, **When** its fields render, **Then** every
   field label is the application's one work-surface label — mono, uppercase,
   tracked — and no phone surface renders a sentence-case 14 px form label.
5. **Given** any phone edit form, **When** its controls render, **Then** every
   control a finger presses is at least 44 px tall.

---

### US3 — The section list names sections and nothing else (Priority: P2)

A viewer on someone else's event opens the section list and is not told that
Audio Inputs is "Editable".

**Independent Test**: Open the section list as a viewer-role user; confirm nine
destinations, no badges, and that the current section is marked in the list
rather than on the closed control.

**Acceptance Scenarios**:

1. **Given** the section list, **When** it opens, **Then** it lists nine
   sections and renders no capability badge on any of them.
2. **Given** the section list, **When** the current section renders, **Then** it
   carries the accent as a left marker in the open list.
3. **Given** the closed section control, **When** nothing is being selected,
   **Then** it carries no accent border.
4. **Given** the application, **When** any surface renders, **Then** no
   component tints a state with the hue reserved for the legend's sample stroke.

---

### US4 — The confirm clears the hardware (Priority: P2)

The confirm is not under the home indicator, and on a device whose browser
supports it, not under the keyboard either.

**Independent Test**: On a handset with a home indicator, open any sheet and
confirm the primary control clears it. Repeat with the keyboard raised.

**Acceptance Scenarios**:

1. **Given** a device reporting a bottom safe-area inset, **When** any
   bottom-anchored surface renders, **Then** that inset is added to the
   surface's own padding rather than absorbed by it.
2. **Given** the bottom navigation bar, **When** it renders, **Then** the body's
   bottom padding derives from the bar's own height plus the inset, rather than
   from a literal.

---

### US5 — The canvas inspector reads against its canvas (Priority: P3)

Delivered as a capability of the component, not as a wired surface: 6d mounts
the canvases. The sheet must be able to express it now so that 6d does not
reopen this file.

**Independent Test**: Render a sheet with the scrim withheld; confirm no
backdrop element exists, that content behind it remains interactive, and that
the sheet does not announce itself as modal.

**Acceptance Scenarios**:

1. **Given** a sheet rendered with its scrim withheld, **When** it opens,
   **Then** no dimming layer is drawn and no element intercepts pointer events
   outside the sheet's own panel.
2. **Given** the same sheet, **When** assistive technology reads it, **Then** it
   is not announced as modal.

---

### Edge Cases

- **A sheet with three rows** renders three rows tall, not 85 % tall. There is
  no minimum height.
- **A drawer opened on a desktop, then narrowed past 767 px** re-anchors to the
  bottom without unmounting its contents or losing an open `GearForm`'s draft.
- **A sheet opened over the bottom navigation** covers it. The nav is not a
  second bottom edge to account for; the sheet is anchored to the screen.
- **Two overlays at once** — the section list and an edit form — is not
  reachable today and is not made reachable here.
- **A `Dialog` taller than the viewport** now scrolls internally instead of
  overflowing off both ends. Nothing in the tree is currently that tall, which
  is why it has never been reported.
- **A phone with no safe-area inset** (most Android devices, every desktop
  browser) gets `0` added, which is the current appearance exactly.
- **`prefers-reduced-motion`** — the sheet does not animate in or out, so there
  is nothing to withhold. Adding an entrance is out of scope.

## Requirements

### The sheet (US1)

- **FR-001**: A new shared component `ui/Sheet` MUST render a bottom-anchored
  overlay panel: full width, `max-h-[85svh]`, `rounded-t-xl` with square bottom
  corners, `border-t border-zinc-700` (the Frame role), `bg-zinc-900`,
  `shadow-2xl`. It MUST render nothing when closed.
- **FR-002**: It MUST live in `components/ui/`, not `components/mobile/`,
  because `ui/Drawer` imports it and a `ui/` component reaching into `mobile/`
  is the layering inversion [components.md](../../design/components.md) §5
  exists to prevent.
- **FR-003**: Its API MUST be exactly: `open`, `onClose`, `title` (a node, not a
  string — the inspector puts a micro-label and a chip there), optional
  `subtitle`, `children`, optional `footer`, optional `scrim` defaulting to
  true, and optional `flush` defaulting to false. No other prop.
- **FR-004**: The header MUST be `flex-none`, bordered below, carrying the title
  at the navigation tier's `text-lg font-semibold` — the drawer's own — with the
  subtitle at `text-xs text-zinc-500` beneath it, and a close control on the
  trailing edge that is a **44 px target** with an accessible name.
- **FR-005**: The body MUST be the only part that scrolls: `flex-1 overflow-y-auto
  overscroll-contain`, at the phone's `px-4 py-4`. **No section inside it may
  take a height of its own** ([patterns.md](../../design/patterns.md) §3).
- **FR-006**: `flush` MUST remove the body's own padding, for contents that are
  a run of full-bleed rows.
- **FR-007**: The footer MUST be `flex-none`, bordered above, and MUST carry
  `env(safe-area-inset-bottom)` **added to** its own bottom padding.
- **FR-008**: The scrim MUST be `bg-zinc-950/80` — the dialog's, because a sheet
  covers most of the screen — and MUST carry `touch-none` so the page behind
  cannot be scrolled through it. Tapping it MUST close the sheet.
- **FR-009**: `scrim={false}` MUST render **no backdrop element at all**, so the
  surface behind stays interactive. The sheet is then not modal, and MUST NOT
  announce itself as such.
- **FR-010**: `Escape` MUST close the sheet.
- **FR-011**: The sheet MUST expose `role="dialog"`, an accessible name derived
  from `title`, and `aria-modal` following `scrim`. Focus MUST move into the
  sheet on open and return to the invoking control on close.
- **FR-012**: The sheet MUST NOT draw a grab handle and MUST NOT implement
  drag-to-dismiss. A handle over a sheet that cannot be dragged is a control
  that does not work.
- **FR-013**: The sheet MUST NOT animate on open or close.

### The footer, and what goes in it (US1)

- **FR-020**: Where the sheet's job is a row editor, the footer MUST hold
  **exactly one control**: the confirm, spanning the row's full width, at the
  phone's `h-10`, in the primary variant.
- **FR-021**: The confirm MUST be named for the operation — *Save channel*,
  *Save output*, *Save fixture* — matching the desktop editor's own wording, and
  MUST render its in-flight state in place.
- **FR-022**: There MUST be no Cancel control in any converted sheet.
- **FR-023**: Where the row can be deleted, the delete MUST sit at the **foot of
  the body**, left-aligned, in the ghost variant tinted `red-400`, and MUST
  never share a row with the confirm.
- **FR-024**: Where the sheet's job is a drawer, the footer MUST carry the
  drawer's statement line at `text-xs text-zinc-500`, unchanged from the desk.
- **FR-025**: Where the sheet's job is the canvas inspector, there MUST be no
  footer — the rail commits per field and has nothing to confirm.

### The drawer, anchored (US2)

- **FR-030**: `ui/Drawer` MUST render a `Sheet` at phone width, passing `title`,
  `subtitle`, `children` and `footer` through unchanged. Its `width` prop MUST be
  ignored there.
- **FR-031**: `ui/Drawer`'s desktop branch MUST be **byte-identical** to today's,
  asserted by a diff rather than assumed.
- **FR-032**: No drawer call site may change. Rig, Buses, Universes, Categories,
  Import and the catalog's manage drawer MUST each acquire their phone form from
  this one branch.
- **FR-033**: A drawer's contents MUST keep the work surface's type at every
  width — `MicroLabel` headings, `GearSpecs` at 10 px mono, `Pill` chips — and
  give up only the geometry a finger presses
  ([tokens.md](../../design/tokens.md) §7 amendment 2).

### The label voice (US2 · M12)

- **FR-040**: Every field label in `components/mobile/` MUST render the
  application's one work-surface label — `MicroLabel`, mono, uppercase,
  `tracking-[0.14em]`. `FieldLabel` MUST NOT appear anywhere under
  `components/mobile/`.
- **FR-041**: Every `Input`, `Select` and `Textarea` in a phone sheet MUST render
  at `size="md"` (`h-10`); every `Button` at `size="md"`, with its **variant
  unchanged**.
- **FR-042**: Fields MUST stack full width, two side by side **only where they
  are one idea** — stagebox and input number, universe and address.
- **FR-043**: None of `text-[13px]`, `text-[11px]` as a row subtitle, `h-9`,
  `w-9` or `py-1.5` may be introduced by this phase.
  [tokens.md](../../design/tokens.md) §7 names them as off both ladders; closing
  them across `components/mobile/` generally is 6b's, not this phase's.

### The dialog, hardened

- **FR-050**: `ui/Dialog` MUST close on `Escape`.
- **FR-051**: `ui/Dialog` MUST scroll internally: `max-h-[85svh]`, header fixed,
  body scrolling — **the sheet's own numbers**, so a tall overlay behaves the
  same way whichever anchor it has.
- **FR-052**: `ui/Dialog` MUST stay centred at every width. The rule, stated
  once so it stops being decided per call site: *an overlay with fields is a
  `Sheet`; an overlay that is a sentence and two buttons is a `Dialog`.*
- **FR-053**: The `Escape` handler MUST exist once and be shared by `Drawer`,
  `Dialog` and `Sheet` — three callers, which is past the line Principle V
  draws.

### The six conversions

- **FR-060**: `MobileChannelEditSheet`, `MobileOutputEditSheet` and
  `MobileFixtureEditSheet` MUST each render a `Sheet` with the header, footer and
  delete placement of FR-020–FR-023, and the label voice of FR-040–FR-042.
- **FR-061**: `SectionSwitcher` MUST render a `flush` `Sheet` titled
  **Sections**, listing the nine destinations. Each row MUST be at least 44 px
  tall and carry a mono ordinal; the current section MUST be marked by a 2 px
  left edge in the accent — the sidebar's own marker — and its label tinted.
- **FR-062**: The capability badge MUST be deleted, along with the
  `MobileCapability` type, the `capability` field on all nine entries, the
  `sky` tint, the sixth micro-label definition (`text-[10px] font-bold uppercase
  tracking-wide`) and the `border-amber-500/60` on the closed trigger.
- **FR-063**: The inventory page's phone category filter MUST render a `flush`
  `Sheet`. Its rows MUST NOT carry `border` + `bg-zinc-900` — the Control role —
  because a list of destinations is not a column of inputs.
- **FR-064**: `MobileNav`'s inline bottom sheet MUST be replaced by the
  component, and its `border-zinc-800` becomes the Frame role's
  `border-zinc-700`. The nav bar itself is unchanged.
- **FR-065**: After this phase, `components/mobile/` MUST contain **zero**
  `<Dialog` call sites.

### The viewport (US4)

- **FR-070**: `index.html`'s viewport meta MUST add `viewport-fit=cover`, so
  that `env(safe-area-inset-*)` evaluates to a real value on devices that have
  one.
- **FR-071**: It MUST also add `interactive-widget=resizes-content`. This is
  honoured by Chromium and ignored by WebKit, so the sheet MUST NOT depend on
  it: the body scrolls and the focused field can be brought into view
  regardless.
- **FR-072**: The bottom navigation bar MUST **state** its height as `h-14`
  ([tokens.md](../../design/tokens.md) §7), rather than emerging from a padding,
  an icon and a font size.
- **FR-073**: `Layout`'s phone body padding MUST derive from that stated height
  plus the inset, rather than from the literal `pb-20`.
- **FR-074**: The phone header MUST state its height as `h-14`, the desktop
  header's own number ([patterns.md](../../design/patterns.md) §7a). Together
  with FR-072 and FR-073 this closes M10 whole rather than in half — see
  [research.md](research.md) R7 for why the half that FR-073 alone would have
  left is the expensive one.

### Boundaries

- **FR-080**: No backend file may change. Asserted by
  `git diff --stat -- backend/` being empty for the phase.
- **FR-081**: No route, endpoint, migration or query may change.
- **FR-082**: The desktop's rendering MUST be unchanged apart from **one stated
  delta**: a `Dialog` taller than `85svh` now scrolls instead of overflowing.
  Every other converted class string MUST be compared before and after through
  `twMerge`, the way Wave 0 caught its own four rows.
- **FR-083**: No tab's phone branch, panel frame, status strip, print branch or
  `!isMobile` permission expression may change. Those are 6b, 6c and 6d.
- **FR-084**: `design/` MUST be updated in the same commit: §7d's footer settles
  to FR-020–FR-023, `design-language.html`'s sheet specimen is redrawn to match,
  `ui/Sheet` stops being marked *gap* in components §5, and M7, M8 and M12 move
  to audit Part 1b with this phase named.

## Assumptions

- The mockup's three recommendations are approved as written; no further
  clarification is outstanding.
- `svh` is safe to use: the project targets current mobile browsers, and the
  unit degrades to nothing worse than `vh` where unsupported by falling back to
  the untruncated content height.
- The three `Mobile*EditSheet` components stay one per entity, as
  [components.md](../../design/components.md) §5 already argues — this phase
  changes their container and their labels, not their count.
- Whether the label-above-control wrapper becomes a small shared component or
  stays inline in three files is an implementation decision for `plan.md`; the
  requirement is the voice and the geometry, not the mechanism.
- Focus return on close is best-effort: where the invoking control has unmounted
  (a deleted row), focus returns to the surface that held it.
- No handset is available to the toolchain. FR-070 and FR-071 are verifiable
  only by a human on a real device, and are named as such rather than covered by
  a gate.

## Out of Scope

- **The phone's panel frame, rows and strip.** `MobilePanel` is 6b. The sheets
  built here open over the card stack that is there today.
- **The section list's derived counts.** `design-language.html` draws
  *16 ch · 3 gaps* per row; those come from `lib/eventSummary.ts`, which needs
  each tab's data, and the phone branches do not all load it yet. The list ships
  without them and they arrive with the surfaces that derive them (6c).
- **Whether the three edit sheets should be `RowEditor` outright.** §7d's table
  says the row-editor job holds `RowEditor` / `GearForm`. That is a question
  about each surface, and each surface has a phase.
- **Mounting a canvas on a phone.** The inspector job is built and speccable;
  6d wires it.
- **The four `Dialog`s a phone can reach that are not in the six** —
  `ChainCell`'s hop detail, the two cable pickers, `EventMembersDialog`. All
  four are short, and all four now scroll and take `Escape`. If one wants a
  sheet, it wants it as part of its own surface's phase.
- **`!isMobile` in permission expressions** (M4), **the two tabs with no phone
  branch** (M9), **print from a phone** (M11), **the off-ladder values in
  `components/mobile/`** (M2). All are about surfaces. M10 is the one finding
  outside the six files that this phase does close, and only because R6 turns it
  from a dormant guess into a live one.
- **An entrance animation, drag-to-dismiss, or snap points.**
- **Converting the nineteen `window.confirm` call sites.** Unchanged from Slice
  32's boundary.

## Success Criteria

- **SC-001**: `components/mobile/` contains **zero** `<Dialog` call sites, down
  from four; the fifth, on the inventory page, is converted with them.
- **SC-002**: `components/mobile/` contains **zero** `FieldLabel` uses, down
  from 18, and the phone's forms render the same label as the drawer they stand
  in for.
- **SC-003**: **Six** drawers acquire a phone form from **one** branch in one
  file, none of which existed before.
- **SC-004**: Every phone overlay's confirm is reachable with the keyboard
  raised, on a form longer than the screen — the state the form is in for the
  whole of its useful life.
- **SC-005**: Exactly **one** control sits in a converted sheet's footer, down
  from three, and none of them is destructive.
- **SC-006**: `env(safe-area-inset-bottom)` evaluates to a real value on a
  device that has one, for the first time since Slice 21 — and no bottom-anchored
  surface's clearance is a literal any more.
- **SC-007**: The application renders **zero** capability badges, and `sky`
  appears only as the legend's sample stroke.
- **SC-008**: The desktop's rendering is unchanged apart from the single delta
  in FR-082, asserted by diff and by `twMerge` comparison rather than by
  inspection.
- **SC-009**: All gates pass: `go vet`, `go test ./...`, `tsc -b`, `eslint`,
  `vitest`.
