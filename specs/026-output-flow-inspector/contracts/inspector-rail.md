# Contract: the shared inspector rail

**Feature**: `026-output-flow-inspector` | **Date**: 2026-07-27

The interface between the two flow inspectors and the rail they are both built
from. This is the contract that FR-014 and SC-004 are checked against: every value
in §1 must exist in exactly one place, and both inspectors must get it from there.

Values are the ones Slice 25 established in
`specs/025-patch-visual-language/contracts/visual-language.md` §7 — this slice
moves them, it does not change them. Anything that differs from that table is a
bug in this slice, not a new decision.

---

## 1. `components/event/graph/InspectorRail.tsx`

### `InspectorRail`

The frame. One `<aside>`, a left border rather than a card.

```tsx
<InspectorRail>{children}</InspectorRail>
```

| Property | Value |
|---|---|
| class | `flex w-60 shrink-0 flex-col gap-2.5 border-l border-zinc-800 p-2.5` |

Fixed width, `shrink-0`: the canvas gives up the space, the rail does not
compress. On a narrow window the canvas scrolls (spec edge case).

### `InspectorHeader`

```tsx
<InspectorHeader label="Output" pill={<Pill …/>} onClose={…} />
```

| Part | Value |
|---|---|
| row | `flex items-center gap-1.5` |
| `label` | rendered in `MICRO_LABEL` — what kind of thing is selected |
| `pill` | optional slot, immediately after the label |
| close | `ml-auto text-zinc-500 hover:text-zinc-200`, `X` at `h-3.5 w-3.5`, `aria-label="Close inspector"` |

### `Field`

```tsx
<Field label="Type">{control}</Field>
```

| Part | Value |
|---|---|
| row | `grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2`, as a `<label>` |
| label | `MICRO_LABEL` |

The 44px column is exact, not carried: it is the width that fits every label both
inspectors use. A label that does not fit is a label to shorten, not a column to
widen — widening it moves every control on both rails.

### `Note`

```tsx
<Note label="Lands on">{children}</Note>
```

| Part | Value |
|---|---|
| box | `flex flex-col gap-1 rounded-[5px] border border-zinc-800 bg-zinc-950/60 p-1.5` |
| label | `MICRO_LABEL` |

For things that are read, not edited.

### `Legend`

```tsx
<Legend rows={[{ kind: 'cable', meaning: 'cable, carrying that output' }, …]} />
```

The component owns the **strokes**; the caller owns the **wording**
(research.md R5). Renders inside a `Note` labelled `Legend`.

| `kind` | Sample drawn |
|---|---|
| `cable` | `<svg width=22 height=4>`, solid, `#38bdf8`, `strokeWidth 1.5` |
| `network` | the same, `strokeDasharray="6 3"` |
| `unpatched` | the same, `#71717a`, `strokeDasharray="4 3"` |
| `phantom` | the `PHANTOM_BAR` token, centred in a 22px box |

| Part | Value |
|---|---|
| row | `flex items-center gap-2 text-[10px] text-zinc-400` |
| sample | `shrink-0` |

**Why the split**: the samples' claim is "these are the lines the canvas draws",
which a second copy of the dash arrays falsifies the first time one is changed.
The wording is not shared because the two sides mean different things by colour —
*reaching a channel* versus *carrying an output* — and phantom power exists only
on the input side (FR-013).

## 2. The gesture split on a port row

`components/event/graph/PortRow.tsx` — `PortRow` gains two optional props:

```tsx
<PortRow port={…} label={…} wiring={…} align="right"
         selected={boolean}      // optional
         onSelect={() => void}   // optional
/>
```

| Given | Row behaviour |
|---|---|
| `onSelect` absent | exactly as today — the label is inert text |
| `onSelect` present | the label is a clickable region spanning the row's free width |
| `selected` true | row tinted `bg-amber-500/10`, label `font-semibold text-zinc-50` |

The port dot's own handlers are untouched in both cases. A press on the dot must
not select the row, and a press on the label must not start a cable (FR-009);
`PortDot`'s pointer-down already calls `stopPropagation`, and the dot's hit area is
its own padded button, so the two targets do not overlap.

The tint matches the sources rail's selected row exactly (visual-language.md §6),
because it means the same thing: this is the row the rail is editing.

## 3. The output inspector's fields

`components/event/OutputFlowInspector.tsx`, in this order:

| Order | Field | Control | Saves on | Condition |
|---|---|---|---|---|
| 1 | name | `Input`, `h-7 font-semibold`, no `Field` label | blur, when changed and non-empty | always |
| 2 | Out | `Input type=number` | change | always |
| 3 | Type | `Select` over vocabulary `output_types` | change | always |
| 4 | Width | `Select` mono/stereo | change | always |
| 5 | Tape | `ColorSelect` | change | always |
| 6 | Desk | `Select` over consoles + "No desk" | change | `consoles.length > 1` |
| 7 | Notes | `Input` | blur | always |
| — | Lands on | `Note` | — | always |
| — | Legend | `Legend`, three rows, no phantom | — | always |
| — | actions | `mt-auto flex gap-2`: Duplicate, then Delete in red | — | not read-only |

The name is the header field with no label, as on the source rail — a rail whose
subject has a name shows it first and large, and "Name" beside it says nothing.

Every control renders `disabled` when read-only; the actions row is absent
entirely (FR-016). Reading is never restricted.

## 4. "Lands on"

| State | Rendered |
|---|---|
| the run reaches a destination | each line's **last** segment label, in mono, in the output's derived colour |
| more than one line (stereo, uncollapsed) | one per line, prefixed by the line's side label |
| nothing patched | `Not patched — this output doesn't leave the desk.` in `text-zinc-500` |

Source: `outputChainSegments(output, ctx, {consoleLabel, consoles})` — the same
model the sheet's Chain column renders, so the rail and the sheet cannot disagree
about where a run goes (research.md R6).

Below it, in quieter mono: the port count (`1 port` / `2 ports`) and the desk the
output comes off, or `no desk`.

## 5. What must not change

- The inputs inspector's appearance and behaviour (FR-015). Its file is renamed
  and its rail parts are imported instead of locally defined; nothing else.
- `PortRow`'s existing call sites — six on the inputs canvas, five on the outputs
  canvas — pass neither new prop and must render identically.
- `ui/Table`, `ui/Badge`, `ui/SheetTable`: untouched.
