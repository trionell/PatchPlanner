# Quickstart: verifying the nine surfaces

**Feature**: 035-phone-surfaces · Wave 6c

Two halves, and the split is 6b's. The **gates** are mechanical and run in this toolchain.
The **handset pass** is a human's, because there is no browser here: every height in this
slice is arithmetic over stated values, not a measurement — and this slice adds a second
reason, which is that four of its findings are about *whether a thing can be done at all*
and that is answered by doing it.

---

## Gates

Run from the repository root. All must pass before the slice is called done.

```bash
cd frontend && npx tsc -b                 # NOT --noEmit — the root tsconfig is references-only
cd frontend && npx eslint src
cd frontend && npx vitest run
cd frontend && npx vite build
cd backend  && go vet ./... && go test ./...
```

The backend gates are run to prove the slice did not touch it, not because it changed.

### Scope assertions

```bash
git diff --stat -- backend/ frontend/src/api/          # must be empty (FR-035)
git diff --stat                                         # must match plan.md's file list

# M4 — the finding, as a grep. Must return nothing.
grep -rn "!isMobile" --include='*.tsx' frontend/src

# F1 — five rails, not four.
grep -rln "StatusStrip" frontend/src/components/event/*StatusRail.tsx | wc -l   # 5

# F3 — the constant named after a deleted thing.
grep -rn "MOBILE_SECTION_CAPABILITIES" frontend/src | wc -l                     # 0
```

### The two byte-identical checks

`SignalFlowStatusRail` and `StagePlotInspector` are the only files in this slice that a
**desktop** surface renders. Both are asserted the way 6b asserted its four rails — render
every state before and after, diff the markup — which is stronger than comparing class
strings, because it catches element order too.

| Component | States | Result |
|---|---|---|
| `StagePlotInspector` | each `element.kind` (`shape`, `resource`, `truss`, `fixture`), locked and unlocked, read-only and not, with and without links — all with `spatial` defaulted | **byte-identical** |
| `SignalFlowStatusRail` | `gaps = 0` · `gaps = 1` · `gaps > 1`, each with and without `firstGap`, each with and without a filter handler | **two stated deltas** |

**The rail's two deltas, read and accepted rather than waved through.** A check that is
allowed to fail silently is not a check, so both are written down here and neither is a
surprise:

1. **Class order inside the `class` attribute.** `print:hidden` moves ahead of
   `text-[11px] text-zinc-400`, because it is part of `StatusStrip`'s base now rather
   than appended by this one caller. Rendering-identical — distinct utilities, no
   specificity interaction. Normalising the attribute's word order makes the diff
   disappear, which is the check for it.
2. **`gaps === 0` with the filter *on* gains its `Show all` control.** This is a
   **fix**, and it is 6b's own rule arriving late: *a filter has to outlive the condition
   it filtered on.* The hand-built rail hid the control the moment the last gap was
   fixed, which left the list filtered to nothing with no way back — the exact latent
   trap 6b found and closed on the other four rails. Joining the shell closes it here.

Everything else — all six states, both tints, every sentence — is identical.

`StatusStrip`'s base gains `print:hidden` in the same change. For the other four rails
that is a **no-op**: their surfaces sit inside a `print:hidden` wrapper already. It is
load-bearing only for the fifth, whose panel is *inside* `PrintSheet`.

---

## Handset pass

Rows 1–14 can be checked in a desktop browser narrowed to 375 px. **Rows 15–18 need a
phone**, and are the reason this list exists.

### The four findings

| # | Check | Expected |
|---|---|---|
| 1 | As a **contributor**, tap an owned equipment line | A sheet with Quantity and Note. Save commits, and the desktop shows the new value. **M4** |
| 2 | As a **contributor**, tap a rental line | Manual audio, manual light, note. No delete. **M4** |
| 3 | As a **contributor**, tap a *rented* line on Equipment | It states the line is on the rental order and offers to open it — no editable fields. |
| 4 | As a **viewer**, tap any row on any of the nine sections | The row responds. The sheet opens, every field is readable, and there is no confirm and no delete. **M4** |
| 5 | Open Stage Plots as an **owner** | The sentence *"Placing elements is a desk job…"*. The words **Viewer only** appear nowhere. **M4** |
| 6 | Tap a plot element | The inspector's fields in a sheet, committing per field. Position and size are absent, with a note saying where they are. |
| 7 | On Audio Inputs, open the overflow → **Open Rig** → add a stagebox | It saves. Now edit a channel: the new stagebox is in the *Stagebox* select. **M5** |
| 8 | Print Audio Inputs, Audio Outputs and Lighting from the phone | Three real sheets, identical to the desktop's. No panel, bar, strip, switcher or nav on any of them. **M11** |
| 9 | Open Overview | Countdown spanning, four figures beside it, two ribbons, five readiness rows. Every number matches the desktop's for the same event. **M9** |
| 10 | Open Settings, then **More → My Defaults** | Both are panels. The vocabulary picker opens a sheet of nine with counts. **M9** |

### The frame, the bar and the shell

| # | Check | Expected |
|---|---|---|
| 11 | Open Signal Flow | One bordered panel, two runs under their headings, a strip that names the first gap. Tap it — the list filters to the gaps. **F1** |
| 12 | On Signal Flow, find a long chain | It **wraps**. It is the only row in the app that does. |
| 13 | Open Audio Inputs and count the bar's targets | Three: search, `⋯`, add. The bar does not wrap. **F2** |
| 14 | Open Signal Flow's bar | Print is its **own** target — one overflow action does not earn a menu. |
| 15 | Scroll a 40-row rental order to the middle | The bar and the strip stay on screen; only the rows move. The nav is still there. |
| 16 | Open Overview and Settings and scroll | Both scroll. Neither is compressed below its content or clipped — this is the exact defect that made 6b revert the column. |
| 17 | Count the rows visible at 375 × 667 on Audio Inputs | **No fewer than before this slice.** |
| 18 | Pan a rig ribbon on Overview sideways | The ribbon moves; the page does not. The DMX meter stays put below it. |

### On a device

| # | Check | Expected |
|---|---|---|
| 19 | Open any section and read the top of the screen | The **event's name**. Scroll to the bottom of a 40-row list — it is still there. |
| 20 | Open an event whose name is very long | It truncates. The brand mark and the avatar do not move. |
| 21 | Open a surface with a strip | The strip clears the home indicator; the nav is not overlapping it. |
| 22 | Tap the `⋯`, then a sheet row, one-handed | Nothing mis-fires. Every row in the sheet is at least 52 px. |
| 23 | Edit an equipment line with the connection off | The save fails, the sheet stays open with every value intact, and the error is inline above the fields. |

### The event sweep

All nine, checked for the same three things — one frame, a strip that states something,
and no control that lies about a role:

Overview · Audio Inputs · Audio Outputs · Lighting Rig · Stage Plots · Signal Flow ·
Equipment · Rental Order · Settings

---

## What this slice does not claim

- **Any height, at any width.** `renderToStaticMarkup` produces no layout, so the tests pin
  class strings and structure, never pixels. The 317 px bar and the row counts are computed
  from stated values in research R1 and are rows 13 and 17 above for exactly that reason.
- **That the column is correct on a real device.** Rows 15–18 are the assertion; the test
  asserts the *structure* that makes it possible (one scrolling element, every sibling
  `flex-none`), which is what caught nothing in 6b because nobody wrote it.
- **Anything about the Flow canvas.** `M6` is 6d, untouched by design. A phone that still
  cannot open the patch graph is not a regression from this slice.
