# Phase 0 Research: Mobile-Friendly Redesign

## R1 — Breakpoint

**Decision**: A single Tailwind breakpoint drives the mobile/desktop split: viewports narrower than the existing `md` breakpoint (768px) get the mobile layout described in spec.md; `md` and above keep every existing desktop layout untouched. Implemented as a `useIsMobile()` hook wrapping `window.matchMedia('(max-width: 767px)')`, not a CSS-only `md:` toggle, because several mobile surfaces (section switcher, edit sheets, bottom tab bar) are structurally different components, not just restyled ones — conditional rendering needs a JS boolean, not just Tailwind responsive classes.

**Rationale**: `md` (768px) is already the project's convention (`Dashboard.tsx`'s `md:grid-cols-3`), covers the phone-in-landscape case the mockups' "tablet/larger keeps desktop" assumption calls for, and needs no new config. Matches the reviewed mockups' 375px-wide phone frames comfortably below the threshold.

**Alternatives considered**: A custom narrower breakpoint (e.g. 480px) — rejected, would leave small tablets and large phones in landscape stuck with an unusable desktop sidebar, contradicting the spec's edge case about breakpoint boundaries. A pure CSS `md:hidden`/`md:block` pair for every component — rejected, doubles the JSX for structurally different components (section switcher vs. tab strip) for no benefit over one hook + one conditional branch per component.

## R2 — Mobile shell components (bottom nav, section switcher)

**Decision**: Two new presentational components, `MobileNav` (bottom tab bar) and `SectionSwitcher` (current-section pill + bottom sheet), both frontend-only, both consuming existing `react-router-dom` navigation — no routing changes. `Layout.tsx` renders either the existing sidebar+header or `MobileNav` based on `useIsMobile()`. `EventDetailPage` renders either the existing `Tabs`/`TabList` or `SectionSwitcher` the same way, with both driving the same `TabPanel` content underneath — the nine tab panels and their data-fetching are completely unchanged; only the control that picks which panel is visible changes shape.

**Rationale**: Keeps every existing tab's business logic, queries, and mutations untouched (Constitution V — no duplicated state layer); the switch is purely which "chrome" component is mounted. A bottom sheet is a lightweight enough UI pattern to hand-build (fixed-position overlay + slide-up panel) consistent with the project's existing hand-built `Dialog.tsx`, rather than pulling in a new UI library.

**Alternatives considered**: A responsive CSS-only sidebar that collapses to icons — rejected by the mockups (a full bottom tab bar was reviewed and approved, and a collapsed-icon sidebar doesn't solve reachability with a thumb). A third-party bottom-sheet library — rejected per Constitution V (no new runtime dependency without a concrete need the existing pattern can't meet).

## R3 — Mobile audio channel list & edit sheet

**Decision**: New `MobileChannelList` and `MobileChannelEditSheet` components for `AudioInputsTab`/`AudioOutputsTab`, rendered instead of the desktop `BusSection`/`ChannelSection`/`StageboxMultiSection`/`InputDeviceSection`/`SourceSection`/graph-or-table stack when `useIsMobile()` is true. The list reads from the same `getAudioPatch` query already fetched by the tab. The edit sheet's "source/mic" and "stagebox/input" fields are a simplified view over the existing input-cable graph (a channel's upstream feed is a graph edge in `input_cables`, not a flat field on `InputChannel` — see `ChannelSection.tsx`'s doc comment); saving a routing change in the sheet resolves to deleting the channel's current incoming cable (if any) and creating a new one via the existing `createInputCable`/`deleteInputCable` functions, exactly what the desktop graph's drag-to-connect gesture already does under the hood. Saving name/color/notes uses the existing `updateInputChannel` mutation unchanged. Add-channel uses the existing `createInputChannel` mutation. Audio Outputs mirrors this with the output-side equivalents (`updateAudioOutput`, output cable functions).

**Rationale**: No backend or schema change is needed — every mutation this feature calls already exists and is already exercised by desktop. This is the core reason the feature is frontend-only.

**Alternatives considered**: Adding a denormalized "assigned stagebox input" field directly on `InputChannel` to simplify the mobile form — rejected, would duplicate the graph as a second source of truth and risk desktop/mobile drift, a direct violation of Constitution I's "explicit, traversable port-and-cable graph, not flat foreign keys" rule for signal-routing features.

## R4 — Mobile lighting fixture list & edit sheet

**Decision**: New `MobileFixtureList` and `MobileFixtureEditSheet` for `LightingTab`, reading the same fixtures already fetched by that tab. Unlike audio channels, a fixture's `fixture_number` (console/GrandMA ID), `dmx_universe`, `dmx_start_address`, `dmx_channel_mode`, and `dmx_channel_count` are plain fields on the fixture row already — the edit sheet is a direct, un-simplified PATCH via the same update-fixture call the desktop table's inline inputs already use. Add-fixture reuses the existing create-fixture call and the existing mode-lookup query used by desktop's "Add Fixture" dialog.

**Rationale**: Simplest possible mapping — confirmed by reading the desktop fixture row's field bindings — no graph indirection like audio, so no new derivation logic is needed here at all.

**Alternatives considered**: None seriously considered; the desktop data model already matches the spec's required editable fields one-to-one.

## R5 — Stage plot & signal-flow mobile viewers

**Decision (revised during implementation)**: The two "diagram" sections turned out to be two different problems once the actual components were read:

- **Stage Plots** reuses `StagePlotCanvas` directly with `readOnly={true}` (a prop it already implements, suppressing every add/move/resize/rotate/delete affordance) and no palette/inspector mounted. Panning already works untouched on touch — the canvas drives its background drag-to-pan through Pointer Events (`setPointerCapture`), which unify mouse and touch. Zoom already has a working `+`/`−` button pair in `StagePlotTab`'s own toolbar (`zoomBy`, calling the same `onViewStateChange` wheel-zoom uses) — tapping a button is exactly as good as a pinch gesture for the "look at the plot" use case, so **no custom pinch-gesture code was needed**; the mobile branch just mounts a trimmed toolbar (zoom only, no grid/snap/Trusses/view-write controls, since those persist a plot setting for every viewer and mobile treats the whole section as read for every role) plus the canvas at `readOnly`.
- **Signal Flow** turned out not to be a canvas at all: `SignalFlowTab` is a separate, already-permanently-read-only component (a plain `<Table>` walking the cable graph into text, used for printing) — it never renders `InputGraphCanvas`. The canvas with drag/wheel-zoom lives *inside* the Audio Inputs/Outputs tabs as their optional "Graph" view, and mobile never mounts it there either (R3/R4 replace that whole section with `MobileEntityList`). So Signal Flow needed no viewer work at all — just wrapping its two `<Table>`s in `overflow-x-auto` (a pattern already used everywhere else in the codebase but missed on this one page), so a wide table scrolls horizontally instead of breaking the layout.

**Rationale**: Reusing `readOnly` and the existing zoom buttons means the mobile viewer inherits every future desktop fix to `StagePlotCanvas` for free, and avoids shipping untested custom multi-touch gesture math for a capability (zoom) the toolbar already provides via tap. Discovering Signal Flow's real shape avoided building a pinch-zoom system for a canvas mobile was never going to render in the first place.

**Alternatives considered**: A hand-built two-pointer pinch-to-zoom helper (the original plan) — dropped once the existing zoom buttons were confirmed sufficient; it would have been real, working, but strictly redundant with a lower-risk mechanism already in the toolbar. A separate, simplified static SVG renderer for mobile — rejected for the same reason as originally noted: it would duplicate layout/color/icon logic that must stay in sync with the desktop editor indefinitely.

## R6 — Mobile read-only lists (Equipment, Rental Order, Events)

**Decision**: Restyle only — the existing `Inventories`/`EquipmentTab`/`RentalTab`/`Events` list rows switch to the same condensed row treatment (reduced padding, smaller type scale, still legible) introduced for the audio/lighting mobile lists, applied via a shared `CondensedListRow` presentational component so the density styling lives in one place instead of being copy-pasted across four tabs. No new queries, no new mutations — these tabs already fetch what they display.

**Rationale**: Directly matches the user's explicit follow-up ask to make the tighter row size "the default for lists on mobile," and keeps the visual language consistent across every mobile list rather than each tab inventing its own row density.

## R7 — Constitution compliance check

No new runtime dependency, no new database, no backend endpoint, and no new domain entity is introduced by this feature — it is presentation and interaction changes over an already-complete API surface. Confirmed against Principles I–V: no signal-routing model changes (I), no new equipment-type concept (II), backend/frontend split and REST API untouched (III), rental export untouched (IV), no new dependency and state management stays on existing TanStack Query + local `useState` conventions (V). Full Constitution Check recorded in `plan.md`.
