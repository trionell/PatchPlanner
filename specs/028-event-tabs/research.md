# Research: Four tabs, one shape

The decisions taken before the plan, each with the alternative that was rejected
and why. Values are looked up in [design/](../../design/), not restated here.

---

## R1 · Where the event summary is computed

**Decision.** In TypeScript, as a pure function over payloads the application
already fetches. No endpoint.

**The mockup proposed the opposite** — `GET /events/{id}/summary`, on the
reasonable-sounding grounds that fetching a whole audio patch to show six numbers
is the wrong shape. Writing the spec killed it.

The numbers Overview wants are not counts:

| Figure | What produces it |
|---|---|
| `2 gaps` | `buildInputChannelFlows` + `buildOutputChannelFlows` walking `input_cables` and `output_cables` hop by hop |
| `addressed` | `dmxMap` partitioning identical spans into groups before comparing pairs |
| `128 cables picked` | `cablesPicked`, counting cables with an item chosen |
| `1 over stock` | already on `RentalSummary.has_over_stock` |

Three of those four are derivations with real logic in them, two of which took a
slice each to get right. A Go implementation would be a **second** implementation,
and the failure mode is specific and bad: Overview says *addressed*, the reader
clicks through to Lighting, and Lighting's own strip says *2 errors*. A summary
that disagrees with the thing it summarises is worse than no summary.

This is Slice 27's R3 rule applied in the other direction. There, the packing went
to TypeScript because the browser had to derive the map anyway. Here, the same
test gives the same answer: **the derivation lives once, where the data already
is.**

**Cost, stated honestly.** Overview fetches four payloads it did not before —
audio patch, lighting rig, stage plots, owned equipment. On a fresh page load
that is four requests instead of two. They are cached under the keys the audio,
lighting and stage-plot tabs already use, so the second of those is free and
Overview *warms* the cache for the tab the reader is about to open. For an event
of 32 channels and 64 fixtures the payloads are tens of kilobytes.

**Rejected: partial endpoint.** Return the SQL-countable figures and derive the
rest client-side. That is the worst of both: an endpoint *and* the payloads, for
the numbers that were already easy.

## R2 · How a tab hands off to another tab

**Decision.** `ui/Tabs` gains optional `value` / `onValueChange`; `EventDetail`
drives the desktop tabs from a `?tab=` search param.

Wave 3 shipped `RowEditor`'s `handoff` slot and `LightingSheet`'s `onOpenPlot`
prop and **never wired them**, because `EventDetail` renders
`<Tabs defaultValue="overview">` — uncontrolled, so the selected tab is state no
child can reach. The button has never rendered.

Wave 4 needs the hand-off three times (rental ↔ equipment, signal flow → audio),
so the mechanism has to exist. The change is the same shape as the `active` prop
Wave 2 added to `Tab`: purely additive, uncontrolled behaviour unchanged, and
`Inventories.tsx` — the only other `Tabs` call site — is untouched.

**Why a URL param and not component state.** The phone already deep-links its
sections with `?section=`; doing the same on desktop makes a hand-off survive a
reload, a bookmark and the back button, and makes "open Signal Flow on channel 9"
a link rather than a gesture.

**Rejected: a shared context.** A `useEventTab()` provider would work and touches
`ui/` less, but it makes the selection unaddressable — and the param is three
lines.

## R3 · What a hand-off carries

**Decision.** The tab, and nothing else, in this wave.

`?tab=audio-inputs` opens the tab. It does **not** scroll to or select channel 9,
because selection on the audio tabs lives inside `AudioPatchShell` and reaching it
means a second param and a second effect on a surface this wave promised not to
touch (FR-089).

Stated in the spec as what FR-052 delivers, so the follow-up is a known gap rather
than a bug: *the row opens the right tab; finding the row there is still yours.*

## R4 · One equipment sheet, or two bands

**Decision.** One sheet, with a `Source` column.

Signal Flow's inputs and outputs stay two bands because their columns genuinely
differ — an input row carries bus memberships and an output row has no equivalent.
Equipment's two lists do not differ that way: both are *item, how many, have I got
them, note*. The only real difference is that a rented line carries two quantities
because the rental order splits by department.

So the split goes into a `Pill` and the two quantities into a badge on one `Qty`
cell (`8a·4l`), rather than into two mostly-empty columns.

**What this forbids, and why that is right.** Changing a line's source would be a
delete on one endpoint and a create on another, with a different item catalog on
each side — that is a move, not an edit. `Source` is editable in the add editor
and read-only on an existing row (FR-035).

## R5 · The rental order's three exports

**Decision.** Three `xs outline` buttons in the bar. No Print button.

The canonical bar is *…drawers, `flex-1`, Print, one primary action*. This tab has
no print sheet — the PDF export **is** its paper — so the Print slot is where the
exports go, and there are three of them because the renter's own price-list format
is a different artefact from a generic spreadsheet.

**Rejected: an `Exports` drawer.** A drawer is for something *declared once and
referenced often*. Three download buttons are neither. The one argument for it —
that the LL export's unplaced-lines behaviour deserves explaining before you run
it — is answered by the report block that already appears after it runs (FR-025).

## R6 · Where the rental totals go

**Decision.** Into the status strip; the fake totals row in the table body is
deleted.

A `TableRow` whose cells are sums is data-shaped chrome: it sorts with the rows,
it exports with the rows if anyone ever adds either, and at 300 lines it is 300
rows away from the number you wanted. The strip is the pattern's answer and every
other work panel already uses it.

## R7 · Over stock stops tinting the row

**Decision.** The cell that is wrong turns `text-red-400` with a `title`; the row
keeps its ground.

`bg-red-950/40` across nine cells is legible at four rows and is a banding pattern
at three hundred — the same argument that took zebra striping off the sheet. It is
also inconsistent with Lighting, which flags the offending *cell* and counts the
problems in the strip. One treatment, on both.

## R8 · The chain gets the chain treatment

**Decision.** `font-mono text-[11px] text-zinc-300 tabular-nums`, arrows at
`text-zinc-600`, the desk's own socket at `amber-300`, a missing link at
`amber-400` **with** an `AlertTriangle`.

Those are `ChainCell`'s values (`design/tokens.md` §4), and this is the surface
they were written for — a chain is one of the four things mono exists for. Today
Signal Flow sets its chains in proportional 14 px sans, so hop *n* of two adjacent
rows starts at two different x positions and the eye cannot run down the column.

**Not reusing `ChainCell` itself.** It renders `outputChainSegments`, a different
model from the `FlowHop[]` this tab walks. Sharing the *values* is the claim that
matters; sharing the component would mean converting one model into the other for
presentation, which is the abstraction rather than the fix.

## R9 · Signal flow gets no view toggle

**Decision.** One scroll, two labelled bands.

A trough would be defensible — inputs and outputs are two views of one panel — but
the tab is wrapped in `PrintSheet`, and a toggle prints whichever half is showing.
A load-in sheet that silently omits the output patch is worse than a long one.

The band is a small new construction: a full-width row on `bg-zinc-950/60` with a
`MicroLabel`, a count, and a hint. It is the same shape `DrawerSection`'s header
already is, at sheet width.

## R10 · Overview's numbers are big, and that is the point

**Decision.** `font-mono tabular-nums text-[26px]` on the inset ground.

Everything in the application is 10–14 px on purpose, which is exactly what makes
a row of five 26 px numerals land. It is scale contrast rather than decoration,
and `design/tokens.md` has no rule against it — the density tiers govern *controls
and rows*, and this is neither.

**The one rule it must obey**: a figure with no data is `—`, never `0`. An event
with no patch has not got zero channels; it has no patch. Conflating those is the
Undeclared/Empty distinction `design/patterns.md` §5 already names, and it is why
`Meter` draws nothing at an undeclared capacity.

## R11 · The ribbon is the canvas, not a chart

**Decision.** Real `NodeShell`-style boxes — `rounded-[7px]`, `bg-zinc-850`,
`border-zinc-700`, `shadow-[0_2px_8px_rgba(0,0,0,0.4)]` — with the console at
`border-amber-500/55`, joined by 2 px runs.

No new visual vocabulary: it is the flow canvas at one row high, so *what shape is
this show* is answered in the app's own picture of itself. A bar chart or a donut
would be a second visual language for data the canvas already draws.

**No animation on it.** The Wave 5 dashboard puts the sanctioned pulse on its copy
of this ribbon; Overview does not, because Overview is a working screen inside the
event and `design/tokens.md` §6 is explicit that a tool which animates while a
technician is counting is in the way.

## R12 · Readiness reuses each tab's own words

**Decision.** The pills say what the owning strip says, and are computed by the
same functions.

`dmxStatusState(map)` already returns `errors | unaddressed | clean`;
`patchStatusState(status)` already returns `complete | gaps | over`. Overview maps
those to pills rather than inventing thresholds. That is what makes SC-008
testable: the verdict is not *similar to* the tab's, it is the same call.

## R13 · Order of work

**Decision.** Summary derivation → Tabs/hand-off → Rental → Equipment → Signal
Flow → Overview.

The derivation and the hand-off are the two things more than one tab depends on,
so they land first and are reviewable with their tests before any surface moves.
Overview is last because it consumes everything the other five phases produce, and
because it is the only one whose "before" is worth keeping working until the end.

**Not alphabetical, and not by size.** Rental is first among the surfaces because
it is the largest sheet, so its editor settles the questions the other two inherit.
