# Quickstart: Four tabs, one shape

How to run the gates, and the claims no unit test can make.

---

## Gates

Run from the repository root. All must pass before the wave is called done.

```bash
# frontend — note tsc -b, not --noEmit: the root tsconfig is references-only
cd frontend && npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run

# backend — must be untouched, but prove it still builds
cd backend && go vet ./... && go test ./...
```

### Boundary gates

These are the wave's promises, asserted rather than assumed. `$BASE` is the commit
the wave started from (`66a8a15`).

```bash
# FR-088 — components/ui/ changes in exactly one file
git diff --stat $BASE -- frontend/src/components/ui | tail -1
git diff --name-only $BASE -- frontend/src/components/ui
#   expect: frontend/src/components/ui/Tabs.tsx, and nothing else

# FR-089 — the canvases, the audio sheets, Lighting's sheet, Stage Plots
git diff --stat $BASE -- \
  frontend/src/components/event/graph \
  frontend/src/components/event/AudioPatchShell.tsx \
  frontend/src/components/event/InputSheet.tsx \
  frontend/src/components/event/OutputSheet.tsx \
  frontend/src/components/event/LightingSheet.tsx \
  frontend/src/components/event/StagePlotTab.tsx
#   expect: empty

# FR-090, FR-091 — the phone and the paper
git diff --stat $BASE -- frontend/src/components/mobile frontend/src/components/print
#   expect: empty

# FR-092 — no backend
git diff --stat $BASE -- backend
#   expect: empty

# SC-012 — the radius ladder on these four surfaces
grep -c rounded-lg \
  frontend/src/components/event/{RentalTab,EquipmentTab,OverviewTab,SignalFlowTab}.tsx
#   expect: 0 for each (files may have been renamed/split — grep the directory)
```

### Counting gates

```bash
# SC-001 — no Card left on the four tabs
grep -l "from '../ui/Card'" frontend/src/components/event/*.tsx
#   expect: no rental/equipment/overview/signal-flow file

# SC-007 — Overview has no form control
grep -nE "<(Input|Select|Textarea)\b" frontend/src/components/event/OverviewTab.tsx
#   expect: nothing
```

---

## Unit tests

`lib/eventSummary.test.ts` carries the load, and none of it renders.

| Case | Asserts |
|---|---|
| everything undefined | every figure `undefined`, `readiness` is five neutral pills |
| an event with no date | `daysToLoadIn` undefined, not a negative number |
| today, tomorrow, yesterday | the three special forms |
| a patch with one broken cable | `signalGaps === 1`, and equals what `buildInputChannelFlows` reports directly |
| a rig with a clash | `dmxState === 'errors'`, equal to `dmxStatusState(dmxMap(fixtures))` |
| a rig with a shared group | `dmxState === 'clean'` — sharing is not an error (Slice 27) |
| an empty plan vs. no plan | `0` in the first case, `undefined` in the second |
| dmx capacity | universes **in use** × 512, not 512 × the highest universe number |
| readiness ordering | audio, lighting, rental, equipment, plots, always |

**SC-008 is the important one**: for one fixture set, the summary's gap count, DMX
verdict and rental figures are asserted equal to the values the owning
derivations return when called directly. If those ever diverge, the summary is
lying about the tab it links to.

---

## The manual passes

There is no browser in the toolchain, so these are for a human at a keyboard. In
rough order of what would be most embarrassing to ship wrong.

### 1 · The rental sheet at real size *(worth doing)*

Open an event with **40+ rental lines** at 1440 px.

- All nine columns visible without horizontal scroll.
- At least 28 rows on a 900 px-tall window.
- Narrow to 1100 px: `Description` and `Note` truncate; nothing wraps to two lines.
- One line over stock: the `Stock` cell is red, **the row is not**, and the strip
  names it.

### 2 · The rental editor's read-only field

Find a line with both a planned and a manual quantity (add a manual line for an
item the patch already uses).

- Closed row shows `10` with a `+2` badge; hovering it says *8 from the plan · 2
  added by hand*.
- Open it: `From the plan` reads `8 audio · 0 lighting` and cannot be focused.
- Change `Manual audio` to 5 and save: the closed row reads `13` with `+5`.
- `Delete` removes the manual part and the row stays, now reading `8` with no badge.

### 3 · The hand-off, both directions *(worth doing — it has never worked)*

- From a rented equipment line: *See on rental order* → the Rental tab opens, and
  the URL carries `?tab=rentals`.
- Browser back returns to Equipment.
- Paste the URL into a new tab: it opens on Rental Order.
- From Lighting's fixture editor: *Hang in plot* → Stage Plots opens. **This
  button has never rendered before this wave.**

### 4 · The chain, printed *(worth doing)*

Signal Flow, an event with a stereo channel and at least one gap.

- On screen: hop *n* of two adjacent rows starts at the same x.
- The gap shows a triangle **and** amber, and is legible in greyscale.
- `Cmd-P`: **both** bands print, the panel chrome does not, and the chains are
  black on white.

### 5 · Overview, on three events

- **A full event**: five figures, both ribbons, five pills. Click each figure —
  each opens the tab that derives it.
- **A brand-new event, nothing planned**: figures read `—`, not `0`; ribbons are
  absent rather than a row of empty boxes; readiness is neutral.
- **An event with no date**: the days figure reads `—`.
- Compare the audio pill against the Audio Inputs strip and the lighting pill
  against Lighting's strip. They must say the same thing.

### 6 · The drawer

- `Edit details` opens over the tab; the tab does not shift.
- Change the name, `Save`: the drawer closes and the heading updates.
- Change the name, `Cancel`: nothing changes, and reopening shows the stored value.
- Clear the name: `Save` is refused.

### 7 · Read-only *(worth doing)*

Open an event you are a **viewer** on.

- Overview: no `Edit details`. Everything else identical — numbers, ribbons,
  readiness, inventory row all present. Reading is never restricted (P7).
- Rental: no `+ Manual line`, and clicking a row does nothing.
- Equipment: no `+ Line`, rows inert.
- Signal Flow: unchanged, and still printable.

### 8 · The phone

Narrow to a phone width on all four tabs. Each must render the
`CondensedListRow` branch exactly as it does today — this wave does not touch it,
and pass 8 is here to catch having broken it by accident.
