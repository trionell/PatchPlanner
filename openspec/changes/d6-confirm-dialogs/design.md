## Context

See `proposal.md — Why`, and behind it `ROADMAP.md` under `### D6`, which is the brief.

The shape is not being invented here. `ui/ConfirmDialog` exists and is unchanged.
Three surfaces already use it — `EventMembersDrawer`, the two flow inspectors from D2,
and `PlotTrussManager` from Slice 39. `PlotTrussManager.tsx:126-135` is the worked
example the brief points at, and it is the model every one of the fifteen follows.

Two constraints from the code decide most of what follows:

1. **`Dialog`, `Drawer` and `Sheet` are all `z-50`** (`Dialog.tsx:33`, `Drawer.tsx:112`,
   `Sheet.tsx:75`). Among siblings at equal stacking, **DOM order decides.** A confirm
   raised from inside a drawer and rendered inside that drawer's body renders *under* it.
2. **Six of the fifteen fire from inside a `.map()`** over near-identical rows. A boolean
   `open` flag cannot say *which* row, and a confirm that silently re-aims is the one
   outcome a confirm exists to prevent (`spec.md`, third requirement).

## Goals / Non-Goals

**Goals:**

- The fifteen sites satisfy `specs/destructive-confirmation/spec.md` with no change to
  `ui/ConfirmDialog` and no change to `design/`.
- Each conversion is attributable — one commit per surface, so a regression bisects to
  the surface that caused it. This was D2's stated reason for deferring, and scheduling
  the work does not repeal it.

**Non-Goals:**

- **The two `window.alert` calls in `LightingTab.tsx:90,100` stay.** D6 is about
  `window.confirm`; an alert is a notification, not a question, and replacing it needs a
  decision this change has no mandate for (a one-button `Dialog`? a toast the application
  does not have?). They are reported to the user as a possible separate defect, not
  folded in — `CLAUDE.md` forbids adding a defect unasked.
- No shared `useConfirm` hook (see Decision 1).
- No new `ConfirmDialog` prop, no `design/` edit, no backend change.

## Decisions

### 1 · Per-site `useState` holding the pending record — not a shared hook

The brief's first open decision. **Per-site state, and the record not a boolean:**

```tsx
const [pendingBox, setPendingBox] = useState<Stagebox | null>(null)
```

*Why not a `useConfirm` hook.* Two callers became five; five become twenty. Principle V
forbids abstraction ahead of need, and at twenty the need would normally be real — but a
promise-returning `useConfirm()` re-creates `window.confirm`'s own call shape, which is
the thing being removed, and it cannot carry the typed record each site needs for its
sentence. Constitution Principle V names this case directly: *dialog open/close state
MUST use React's built-in state.* Slice 39's two confirms in one file are already not
identical to each other, which is the evidence the brief asked for.

*Revisit if:* six of the fifteen turn out byte-identical apart from the type parameter.
They are not expected to — see the sentence table in `tasks.md`.

### 2 · The dialog mounts as a sibling, after the surface that raised it

The brief's second open decision, and the one with a real failure mode. The dialog is
**never** rendered inside the drawer/sheet/inspector/`RowEditor` body that raises it. It
is a sibling in the same fragment, **last**:

```tsx
<>
  <Drawer …>{/* the rows, whose ✕ calls setPendingBox(box) */}</Drawer>
  {/* Sibling, after the drawer: both are z-50, so DOM order is the mechanism. */}
  <ConfirmDialog open={pendingBox != null} …>{pendingBox && <>…</>}</ConfirmDialog>
</>
```

Where the raising control is deep inside a `.map()` — a row's `✕`, a `RowEditor`'s
`onDelete` — the state lives in the **component that owns the list**, not in the row, so
that there is one dialog per surface rather than one per row.

*Alternative considered and rejected:* a React portal to `document.body`. It would make
order irrelevant, but `Dialog` already portals as it sees fit and adding a second
mechanism to solve an ordering problem that one line of JSX placement solves is exactly
the speculative layer Principle V rules out.

### 3 · The sentence moves across unchanged in meaning, and gains typography

Each site's existing string becomes `ConfirmDialog`'s children. Subject then consequence
is preserved because every one of the fifteen already reads that way — that is
`ConfirmDialog`'s stated contract, not a new rule.

Two mechanical changes fall out of moving from a string to JSX, and both follow
`PlotTrussManager`:

- The trailing *"Continue?"* / *"?"* that `window.confirm` needed goes. The two buttons
  are the question now; the body is a statement. `OwnedGearManager`'s *"Continue?"* and
  `LightingTab`'s `?` are the two affected.
- The subject is wrapped in `<span className="text-zinc-200">`, as
  `PlotTrussManager.tsx:253` does — the body text is `text-zinc-400`, so this is the
  established contrast for the named thing. No new token; looked up, not invented.
- `\n\n` in `LightingTab`'s skipped-universe suffix becomes a second `<p>`-equivalent
  block rather than a literal newline, which HTML would collapse.

### 4 · `title` and `confirmLabel` per site

`title` is a noun phrase naming the operation, per the prop's own doc — *Delete stagebox*,
*Delete channel*, *Delete category*. `confirmLabel` defaults to `Delete` and is only
passed where the verb is not delete: `LightingTab` alone, whose verb is the caller's
(*Renumber* / *Close the gaps around*), so it passes its own label.

### 5 · `LightingTab` is the one structurally different site — and stays within the pattern

`run(plan, verb, nothingToDo)` is a local function called from four places, gated on a
plan, carrying a computed suffix. Its pending state carries all of it:

```tsx
const [pendingPlan, setPendingPlan] = useState<{ plan: Plan; verb: string } | null>(null)
```

That still **differs only in the record it carries**, which is what the brief's escape
hatch permits. It is scheduled last so that if it does prove to differ in *kind*, thirteen
surfaces are already landed and the decision to escalate costs nothing already done.

### 6 · Testing

Vitest with `renderToStaticMarkup`, per the stack — no DOM, so interaction is not
testable and is verified in the browser instead. `ConfirmDialog.test.tsx` already covers
open/closed rendering, so per-site unit tests would test React, not this change. The
per-site verification is the browser walk in `tasks.md`, which is where the z-order
failure mode actually shows.

## Risks / Trade-offs

- **A confirm renders under the surface that raised it** → the failure mode Decision 2
  exists for. Every site raised from inside a `Drawer`, `Sheet`, inspector or `RowEditor`
  is opened in a browser and checked, on a phone viewport too. It is a task line, not a
  hope.
- **Fifteen surfaces in one branch is a lot of surface to regress** → one commit per
  surface, so `git bisect` lands on the file. This is D2's reason and it is kept.
- **A sentence's meaning drifts while being retyped as JSX** → `tasks.md` carries the
  before/after sentence for each site, so review compares against the recorded original
  rather than against memory.
- **The three counted sentences silently lose their count** → `OwnedGearManager`,
  `StageboxSection` and `StageMultiSection` are called out individually in tasks and in
  the spec's scenarios; the count is what makes those confirms worth having.
- **`LightingTab` is not mechanical after all** → scheduled last, and the brief's
  escalation-to-a-slice hatch is explicitly still open at that point.

## Migration Plan

None. No schema, no API, no persisted state, no dependency. Rollback is
`git revert` of one commit for one surface.
