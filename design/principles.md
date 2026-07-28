# 01 · Principles

Eight rules. They are here to settle arguments, so each one is stated as something
that can be violated, with the violation named.

---

## P1 · One surface, one frame

A screen is one bordered thing containing a bar, its content, and — if it has
something to say — a strip that closes it. Not a stack of rounded cards separated
by gaps.

The audio tabs used to be three cards: a toolbar floating with `mb-4`, a table in
its own `rounded-xl border`, a status strip in its own `mt-3 rounded-lg`. Switching
Sheet → Flow appeared to rebuild the page. As one panel, the toggle changes the
contents of something that stays put.

**Violation:** two bordered containers stacked with a gap where one would do.
**Exception:** genuinely independent objects in a list — an event card on the Events
page, an inventory on the Inventories page. Those are many things, not one thing in
pieces.

> A gap between cards says *these are separate*. Use it only when they are.

## P2 · Density is a property of the surface's job

There are two calibrations, and which one applies is decided by a question about
the user, not about taste:

> **Does the user scan many rows of this at once, cross-referencing as they go?**

Yes → **work surface**. Patch sheets, the flow canvas, the rig and buses drawers,
the lighting fixture table, the rental order, stage-plot inspectors.

No → **navigation surface**. Dashboard, Events, the inventory list, Login,
dialogs, drawer forms.

> The **signed-out start page is outside this language entirely** — exempted in
> writing in [audit.md](audit.md) Part 2b. It shares the brand mark, the accent
> and the type families, and nothing else. It used to be listed here, which
> settled its density and was read as a claim that it was inside the system.

A work surface earns its density: a technician reading a 200-row patch needs the
whole chain on one line, and 12 px of vertical padding per row costs them four
screens of scrolling. A navigation surface has not earned it: four event cards set
at patch-sheet density look cramped for nothing, because there was never anything
to fit.

Same vocabulary, two calibrations. The values are in [tokens.md](tokens.md) §3.

**Violation:** a `text-[10px]` label on a page with six controls on it. Or a
`py-3 text-sm` row in a table someone reads two hundred of.

## P3 · One label style per tier

A field's label is mono, uppercase, wide-tracked and quiet. That is the app's one
label voice, and its *size* is fixed by the tier — not by the component.

This rule exists because it is currently broken **inside the reference surface**:
the micro-label is defined four times, at two sizes.

| Where | Value |
|---|---|
| `graph/tokens.ts` `MICRO_LABEL` | `font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500` |
| `ui/SheetTable.tsx` `SheetHeadCell` | the same, inlined |
| `event/OutputSheet.tsx:173` | the same, inlined |
| `ui/GearList.tsx` `MicroLabel` | **`text-[9px]`** — the odd one out |

Four definitions is how a fifth ends up different. One export, imported everywhere.

**Violation:** writing `font-mono text-[10px] uppercase tracking-[0.14em]` into a
component instead of importing it.

## P4 · Amber is focus and action, and never the only carrier of meaning

Amber (`amber-500`) is the single accent. It marks **the thing you are working on**
and **the thing you act with**:

- the primary button
- the current tab, the current view in a toggle
- the selected node, the open row, the active form's left edge
- the desk — the box every other box on the canvas is arranged around

That is already a lot of jobs for one hue, and it is why the fifth job must not be
handed to it silently. When amber also has to say *warning* — a patch with gaps,
a desk near capacity — it does so **alongside** a shape or a word, never alone:

- the status strip tints its top border *and* shows a `3 gaps` pill
- a capacity meter turns `red-400` past 100 %, and draws nothing at all when no
  capacity has been declared

**Violation:** a state distinguishable from its neighbour only by being amber.

> Red is reserved and unambiguous: destructive actions, over capacity, a broken
> link in a chain, and 48 V phantom power. Emerald means complete. Nothing else
> gets a semantic hue.

## P5 · Shape carries meaning independently of colour

On the flow canvas every **circle is a port you can patch**. So 48 V phantom power
is a **bar** — `h-[3px] w-2`, red, glowing — and never a dot, in every view that
shows it: the sheet, the sources rail, the inspector.

The indicator differs from a port in both hue *and* geometry, which means it
survives a colour-blind reader, a greyscale print, and a patch where a channel's
tape colour happens to be red.

This generalises: any indicator that could be confused with an interactive element
must differ in shape, not only in colour.

**Violation:** a coloured dot that means a state rather than a port.

## P6 · A meaningful colour is derived, never typed

A colour that carries information is computed by walking the domain graph, not
stored on a row and not chosen by a component.

A cable's colour on the canvas is `derivedCableColor`, defined in terms of
`derivedOutputPortColor`, which walks the port-and-cable graph to find which output
the run carries. The sheet's Chain column and the inspector's "Lands on" note read
from the same `outputChainSegments` the canvas does. That is why they cannot
disagree — not because two implementations were kept in step.

This is Constitution Principle I at the pixel level: *"reaches the amp rack"* is a
derivation, not a field.

**Violation:** a component computing a colour from a name, a type string, or an
index. **Corollary:** `Badge`/`Pill` may map a *vocabulary value* to a hue, because
vocabularies are database records (Principle II) and the fallback for an unknown
value is the neutral style — not a crash and not a branch.

## P7 · Restricted roles lose controls; they never gain disabled ones

A viewer or contributor who cannot edit does not see a greyed-out **+ Channel**.
They see a toolbar without one. The Rig and Buses buttons are absent, not disabled.

Two reasons, and the second is the load-bearing one:

1. A disabled control is a promise the interface cannot keep.
2. Reading is never restricted. Someone who cannot edit the patch can still open
   Flow, pan it, zoom it, and print it — so the surface must not read as a locked
   version of someone else's.

The exception is a form already open on a row: its fields render disabled rather
than vanishing mid-interaction.

**Violation:** `disabled={readOnly}` on an add or delete control. The caller should
be passing no handler at all.

## P8 · Chrome recedes

The panel is the subject. The sidebar, the header and the tab strip are furniture,
and no element of them may be visually louder than the panel's own title.

Today the application announces itself three times on the way to the patch — a
24 px page header, a 20 px event name, a tab strip in `px-4 py-2` pills — before
reaching a panel whose title is 14 px. The loudest type on the screen is the word
"PatchPlanner".

**Violation:** navigation type larger than the content title it sits above.

---

## The tiebreaker

When two of these pull in different directions, the order is:

**P6 (derived) → P5 (shape) → P7 (roles) → P4 (amber) → P1 (frame) → P2 (density)
→ P3 (labels) → P8 (chrome).**

Correctness of meaning beats legibility beats consistency beats compactness. A
value shared for its own sake, where the two callers genuinely mean different
things, is not consistency — it is one of them being wrong on purpose. The
inspector legend is the worked example: the **strokes** are shared, because their
claim is "this is a line the canvas draws" and a second copy falsifies it; the
**wording** is not, because on the input side a colour means *reaching a channel*
and on the output side *carrying an output*.
