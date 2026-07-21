# UI Contract: Mobile-Friendly Redesign

No REST API contract changes — every backend endpoint this feature calls already exists and already ships an OpenAPI/typed contract from earlier slices. This document is the UI-level contract: the fixed capability matrix every mobile screen must honor, and the props contract for the new shared components, so tasks/tests can be written against something concrete.

## Capability matrix (authoritative — mirrors data-model.md)

| Section | Mobile capability | Desktop component(s) replaced on mobile | New mobile component(s) |
|---|---|---|---|
| Overview | editable | (none — form reused as-is, single-column) | — |
| Audio Inputs | editable | `BusSection`, `ChannelSection`, `StageboxMultiSection`, `InputDeviceSection`, `SourceSection`, graph/table toggle | `MobileChannelList`, `MobileChannelEditSheet` |
| Audio Outputs | editable | equivalent output-side sections | `MobileChannelList` (output variant), `MobileChannelEditSheet` (output variant) |
| Lighting Rig | editable | fixture table + Add Fixture dialog | `MobileFixtureList`, `MobileFixtureEditSheet` |
| Stage Plots | viewer | `StagePlotPalette`, `StagePlotInspector` (removed); `StagePlotCanvas` reused with `readOnly` | (pinch-zoom added to `StagePlotCanvas`) |
| Signal Flow | viewer | none removed; `InputGraphCanvas` reused with `readOnly` | (pinch-zoom added to `InputGraphCanvas`) |
| Equipment | read-only | dense table | `CondensedListRow` |
| Rental Order | read-only | dense table | `CondensedListRow` |
| Settings | editable | (none — vocabulary CRUD reused as-is) | — |

Any task that adds a tenth section or changes this matrix MUST update this table and `data-model.md`'s `MobileSectionCapability` mapping in the same change.

## Component prop contracts

### `useIsMobile(): boolean`

Wraps `window.matchMedia('(max-width: 767px)')` with a change-event subscription. No parameters. Pure client-side, no network call.

### `<MobileNav />`

No props — reads current route via `useLocation`/`NavLink` exactly like the existing `Layout.tsx` sidebar it replaces. Renders the 4 primary destinations plus an overflow entry (My Defaults, sign out).

### `<SectionSwitcher currentSection, sections, onSelect, readOnly? />`

- `currentSection: MobileSectionCapability['section']`
- `sections: MobileSectionCapability[]` — the fixed 9-row table above
- `onSelect: (section) => void`
- Renders the current section pill; opening it shows every row labeled with its capability badge (`editable` / `read-only` / `viewer`) per FR-003.

### `<MobileChannelList channels, onSelect, onAdd, readOnly />`

- `channels: MobileChannelListItem[]` (see data-model.md)
- `onSelect: (channelId) => void` — opens `MobileChannelEditSheet`
- `onAdd: () => void` — hidden entirely when `readOnly` (viewer-role user), not just disabled, per FR-015 and the existing "hide, don't just block" convention.
- Includes a search input filtering by name/number client-side (no new query).

### `<MobileChannelEditSheet channel, sources, stageboxes, onSave, onClose />`

- Fields per FR-006: name, color, source/mic (or output device), stagebox/input (or output routing), notes.
- `onSave` resolves to the mutation calls documented in research.md R3 (channel field PATCH + cable create/delete for routing changes) — the sheet itself contains no direct `fetch`/`request` calls, only the same typed API functions desktop already uses.
- On save failure, the sheet stays open with an inline error and the user's edits remain in the form (FR-017) — it does not close or discard input on a failed request.

### `<MobileFixtureList fixtures, onSelect, onAdd, readOnly />` / `<MobileFixtureEditSheet fixture, onSave, onClose />`

Same shape as the channel pair, fields per FR-009 (fixture ID, universe, address, mode) and R4's direct-field-PATCH model (no cable resolution needed).

### `<CondensedListRow title, subtitle, trailing? />`

Presentational only — the shared tight-row layout used by Equipment, Rental Order, Events, and the Dashboard's recent-events list, per R6. No mutation, no query.

### Canvas changes (`StagePlotCanvas`, `InputGraphCanvas`)

No new props beyond the already-existing `readOnly`. Internal-only addition: a two-pointer pinch-tracking handler that computes a zoom delta and calls the existing `onViewStateChange`, active regardless of `readOnly` (panning/zooming is never restricted, only mutation is).
