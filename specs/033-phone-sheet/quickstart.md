# Quickstart

## Run it

```bash
# backend — no migration, no change at all in this slice
cd backend && go run ./cmd

# frontend — proxies /api and /health to the backend
cd frontend && npm run dev
```

## Gates

Everything below must pass before a commit in this slice is considered done.

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

These are exactly what `.github/workflows/ci.yml` runs, and nothing more.

**`tsc -b`, not `tsc --noEmit`.** The root `tsconfig.json` is references-only, so
`--noEmit` type-checks nothing and passes on a broken tree. This has bitten the
project before.

The backend gates are listed because CI runs them, not because this slice can
affect them. If `go test` output changes, something is wrong with the slice, not
with the test.

## Database safety

**Never point a dev server at `backend/patchplanner.db`.** Copy it and set the
path:

```bash
cp backend/patchplanner.db /tmp/claude-1000/pp-033.db
PATCHPLANNER_DB=/tmp/claude-1000/pp-033.db go run ./cmd
```

This slice writes nothing new and changes no schema, so any existing event with
a patch, a rig and a catalog will do.

## Seeing it — at 375 px

Every surface below is behind `useIsMobile()`, i.e. **a viewport under 768 px**.
In a desktop browser: device toolbar, iPhone SE (375 × 667) or narrower.

| # | Where | What to look for |
|---|---|---|
| 1 | Event → **Audio Inputs** → tap a channel | The form rises from the bottom edge. Mono uppercase labels, `h-10` controls, one full-width **Save channel**, no Cancel. Scroll to the end of the fields for **Delete channel**. |
| 2 | The same, with the keyboard up | Tap the name field. The confirm is still reachable — scroll the sheet, not the page. |
| 3 | Event → **Audio Outputs**, → **Lighting Rig** | The same three shapes, one per entity. |
| 4 | Any event → the section control | Titled **Sections**. Nine rows, ≥44 px, mono ordinals, the current one marked by a 2 px amber left edge. **No badges anywhere**, and the closed control is not amber. |
| 5 | Event → **Audio Inputs** → **Rig** | The drawer, as a sheet. Same sections, same `MicroLabel` headings, same 10 px mono spec lines as the desk — at `h-10`. **Nothing in the Rig drawer's own file changed to make this happen.** |
| 6 | The same, at ≥768 px | Right-anchored, identical to before. This is the check that matters most. |
| 7 | **Inventories** → open a catalog → the filter control | A sheet, full-bleed rows, no per-row border-and-fill. |
| 8 | The bottom nav → **More** | A sheet. It looked like one before; now it is one. |
| 9 | Anywhere a sheet is open | `Escape` closes it. Tapping the dimmed area closes it. Both were true of exactly zero of these before. |

## What a gate cannot see

FR-070 and FR-071 are one line in `index.html` and **cannot be verified in this
toolchain** — there is no browser in it, let alone two mobile ones. This is
Wave 1's stage-plot canvas again, and it is named here rather than covered by a
claim.

**On a real handset, one pass, four things:**

1. **The confirm clears the home indicator.** Open any sheet on a device that
   has one. Before this slice the inset evaluated to `0`, so it did not.
2. **The keyboard does not cover the confirm.** Tap a text field in an edit
   sheet. On Chromium this should now be true outright; on WebKit the confirm
   may still need the sheet scrolled, which is expected and is why nothing
   depends on the second viewport key.
3. **A long sheet scrolls to its end.** The Rig drawer on an event with several
   stageboxes is the easiest one to make taller than the screen.
4. **The back gesture closes the sheet** rather than leaving the page.

If (1) still fails, the viewport meta did not take effect — check for a cached
`index.html` before checking anything else.

## Reading the diff

Three assertions this slice makes about itself, in the order a reviewer should
check them:

```bash
# 1 · no backend file, no API client file
git diff --stat main... -- backend/ frontend/src/api/     # expect: empty

# 2 · the file list is closed — every path must appear in plan.md
git diff --name-only main...

# 3 · the phone has no centred dialogs left, and one label voice
grep -rn "<Dialog" frontend/src/components/mobile/        # expect: 0
grep -rho "FieldLabel" frontend/src/components/mobile/ | wc -l   # expect: 0
```

And the one thing to read rather than grep: **`Drawer`'s desktop return.** The
block moves below a new early return and no line inside it changes. If a line
inside it did change, that is the whole desktop, and it is not in this slice.
