# Quickstart: verifying the phone's panel

**Feature**: 034-phone-panel · Wave 6b

Two halves, and the split is the honest one. The **gates** are mechanical and run in this
toolchain. The **handset pass** is a human's, because there is no browser here: every
height in this slice is arithmetic over stated values, not a measurement.

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
git diff --stat -- backend/ frontend/src/api/       # must be empty
git diff --stat                                      # must match plan.md's file list
```

Every desktop class string on the four status rails is compared through `twMerge` before
and after, rather than read (research R10). The rails are the only files in this slice a
desktop surface renders.

---

## Handset pass

Nine rows, at 375 px and on a real device. Rows 1–6 can be checked in a desktop browser
narrowed to 375 px; **rows 7–9 need a phone**, and are the reason this list exists.

| # | Check | Expected |
|---|---|---|
| 1 | Open Audio Inputs at 375 px | One bordered frame. No row draws a border, radius or raised ground of its own. |
| 2 | Count the rows visible at 375 × 667 | **Eight** — no fewer than before this slice. This is SC-002 and the whole of **F3**. |
| 3 | Scroll the list to its end | The bar and the strip are both still on screen. Only the rows scrolled. |
| 4 | Tap the search target | The bar's second row opens with the field focused. Press `Escape` — it closes and the query clears. |
| 5 | Type a query, then delete it character by character | The row stays open at empty. A filter is never applied invisibly. |
| 6 | Tap the strip on a patch with gaps | The list filters to exactly the gaps; the strip says so. Tap again — everything returns. |
| 7 | **On a device**: open a surface with a strip | The strip clears the home indicator. The bottom nav is not overlapping it. |
| 8 | **On a device**: tap the bar's controls and the strip with a thumb, one-handed | Nothing mis-fires. The strip is the easiest target on the screen. |
| 9 | **On a device**: open a 56-channel patch | The strip wraps to two lines with the verdict on the first. The list still shows its rows. |
| 10 | **On a device**: scroll a long list up and down | The address bar behaves acceptably. The shell is a fixed-height column now (plan.md, declared delta 3), so the page itself no longer scrolls — this is the one behaviour change this slice cannot check without a handset. |

### Per-surface sweep

All nine lists, checked for the same two things — one frame, no free-standing cards:

- Audio Inputs · Audio Outputs · Lighting Rig — with their strips
- Equipment · Rental Order — with their strips; the rental **Total** row is gone and the
  strip states the same number
- Events — month headings and the *today* rule are inside the frame
- Dashboard — your events
- Inventories — catalogs, and items with the category filter in the bar

### Role check

Open any surface as a viewer. The add control is **absent**, not disabled; the strip is a
sentence with no chevron; a row still responds to a tap.

---

## What this slice does not claim

- **Any height, at any width.** `renderToStaticMarkup` produces no layout, so the tests
  pin class strings and structure, never pixels. "Eight rows at 375 × 667" is computed
  from the stated values in research R2 and is row 2 above for exactly that reason.
- **Anything about the five findings 6c and 6d own.** `M4`, `M5`, `M6`, `M9` and `M11`
  are untouched by design (plan.md, *Out of scope*), and a phone surface that still
  cannot declare a stagebox or print a sheet is not a regression from this slice.
