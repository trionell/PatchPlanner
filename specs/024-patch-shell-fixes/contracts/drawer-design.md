# Contract: the drawer design language

**Feature**: `024-patch-shell-fixes` | **Date**: 2026-07-26

What every section of the Rig and Buses drawers must look like and how it must
behave, so FR-017 to FR-026 and SC-008 are checkable rather than a matter of
taste. Derived from the approved mockup's `.sd__sec`, `.gear` and `.rowed`
constructions, with its pixel sizes read as proportions (research.md R12).

---

## Primitives

New file `frontend/src/components/ui/GearList.tsx`. Nothing here knows about
audio; the six sections supply the content.

| Export | Renders | Notes |
|---|---|---|
| `MicroLabel` | mono, `text-[9px]`, uppercase, `tracking-[0.14em]`, `text-zinc-500` | the only label style in a drawer |
| `DrawerSection` | `MicroLabel` heading + item count + right-aligned add slot, then children in a `gap-1.5` column | one per kind of equipment |
| `GearCard` | bordered, `rounded-md`, `bg-zinc-900`, `px-2.5 py-2`, `gap-1.5` column; `accent` tints it amber | one per declared item |
| `GearTop` | name (`text-sm font-medium`), what item it stands for (`text-xs text-zinc-400`), right-aligned actions | the summary line |
| `GearSpecs` + `Spec` | mono `text-[10px] text-zinc-500` wrap row; each `Spec` is `label value` with the value in `text-zinc-300` | the capacity line |
| `Meter` | 3 px bar, amber, red above 100% | desks only |
| `GearForm` | `flex flex-wrap items-end gap-2` with an amber left rail | the edit and add forms |
| `FieldStack` | `MicroLabel` over a control, `min-w` per field | one field |

`Input` and `Select` gain a `size` prop: `sm` is `h-8 text-xs px-2`, `md`
(default, unchanged) is `h-10 text-sm px-3`. Drawers and row editors pass `sm`;
nothing outside the audio tabs changes.

## Section anatomy

Every section, without exception:

```
CONSOLES  2                                    [+ Console]
┌──────────────────────────────────────────────────────────┐
│ (foh)  FOH · SD10       DiGiCo SD10 · rental      [Edit] │
│ in 96   out 48   local 8 in / 4 out   used 15 in · 10 out│
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ (monitor)  MON · CL5    Yamaha CL5 · owned        [Edit] │
│ in 72   out 35   local 8 in / 8 out   used 0 — no outputs│
└──────────────────────────────────────────────────────────┘
▏NAME              ROLE      CATALOG ITEM              [Add]
▏[            ]    [FOH ▾]   [Pick a console…      ▾]
```

Rules:

- **FR-018** — sections are full width, stacked, `gap-5` between them. No
  `grid-cols-2` anywhere in a drawer.
- **FR-019** — a card not being edited shows no form control at all. Name, item,
  specs, and a usage figure derived from the patch.
- **FR-020** — pressing Edit opens that card's `GearForm` beneath its summary
  line and closes any other open one in the same section.
- **FR-021** — every control in a drawer is `size="sm"` and at least `10rem`
  wide, except numeric counts (`5rem`) and a role/connector select (`7rem`).
- **FR-022** — a desk shows `used N in · M out`; the figure turns red and the
  meter turns red when a declared count is exceeded. A count of `0` means
  undeclared: no meter, no warning, and `—` in place of the number.
- **FR-023** — delete is a red-tinted labelled control inside the open form,
  never an icon in the summary line, and confirms with what else it removes.
- **FR-025** — for a read-only role the add slot and every card's Edit are not
  rendered. Cards, specs and meters still render: reading the rig is never
  restricted.
- **FR-026** — the drawer footer states how many rows become rental lines.

## The six sections

| Section | Item summary line | Specs |
|---|---|---|
| Consoles | role badge, name, catalog **or** owned item | `in`, `out`, `local N in / M out`, `used`, meter |
| Stageboxes | name, catalog item | `in`, `out`, `link`, `used N in · M out` |
| Stage multis | name, catalog item | `ch`, `length`, `conn`, `used` |
| Processing devices | name, catalog item, `on inputs` | `in N`, `out M`, connector per side |
| Output devices | name, catalog item, `on outputs` | `in N`, `out M`, `link`, connector per side |
| Groups / DCAs (Buses) | colour swatch, name | `N channels` |

`StageboxMultiManager` and `StageboxMultiSection` are removed; the first two rows
of that table replace them (research.md R13).

---

## The sheet row editor

Same language, one construction, both tabs (FR-027 to FR-032).

```
 3  ■ Snare Top   M   e906 → SB1 : 3 → ch 3   ▮   DRUMS  DCA 1   tape the clip
▏NAME          WIDTH    TAPE     GROUPS    DCA      NOTES        SOURCE
▏[Snare Top ]  [Mono▾]  [■ sky]  [DRUMS▾]  [DCA1▾]  [tape the…]  [Edit in Flow →]
▏                                                    [Save channel]  [Delete]
```

- A `flex flex-wrap items-end gap-3` strip, `border-l-2 border-amber-500`,
  `rounded-r-md`, on a faint amber ground — so it reads as hanging off the row
  above it (FR-028). The row being edited carries the same faint amber ground and
  loses its bottom border, so the two are one block.
- Fields wrap onto a second line only when they run out of room (FR-027). No
  fixed column track.
- `Save channel` / `Save output` is the primary button, pushed right with
  `ml-auto`, `px-4` so its label never meets its own edge. `Delete` is a labelled
  ghost button in red beside it. Neither is an icon (FR-029).
- `Edit in Flow →` sits under a `SOURCE` micro-label and switches the tab to
  Flow with the row's own upstream source selected — the row's first hop, or the
  row itself when nothing feeds it (FR-030, research.md R15).
- `Esc` discards and `⌘↵` / `Ctrl↵` saves and opens the next row, exactly as
  before (FR-031).
