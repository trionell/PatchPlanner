# Quickstart: The pages, and what is left over

---

## Gates

```bash
cd frontend && npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run
cd backend  && go vet ./... && go test ./...
```

### Boundary gates

`$BASE` is the commit the wave started from (`92d4027`).

```bash
# FR-053 — components/ui/ changes in exactly one file
git diff --name-only $BASE -- frontend/src/components/ui
#   expect: Button.tsx changed, plus two new files — PanelRail.tsx and
#   buttonVariants.ts. The class map moved out of Button.tsx rather than being
#   exported from it, because a component file that also exports a function
#   breaks fast refresh; Button.tsx itself only got smaller.

# FR-054 — every Wave 4 surface, and everything before it
git diff --stat $BASE -- \
  frontend/src/components/event/graph \
  frontend/src/components/event/{AudioPatchShell,InputSheet,OutputSheet}.tsx \
  frontend/src/components/event/{LightingSheet,LightingTab,StagePlotTab}.tsx \
  frontend/src/components/event/{RentalSheet,RentalTab,EquipmentSheet,EquipmentTab}.tsx \
  frontend/src/components/event/{SignalFlowTab,OverviewTab,OverviewBands}.tsx
#   expect: empty

# FR-055, FR-057 — the paper and the phone
git diff --stat $BASE -- frontend/src/components/print frontend/src/components/mobile
#   expect: empty

# FR-056 — the backend is one field and its test
git diff --stat $BASE -- backend
#   expect: domain/reference.go, db/reference.go, db/reference_test.go only
git diff --stat $BASE -- backend/migrations
#   expect: empty
```

### Counting gates

```bash
# SC-006 — A4 closes. The one remaining is inside a comment.
grep -rn "rounded-lg" --include='*.tsx' frontend/src
#   expect: exactly one hit, frontend/src/components/ui/PatchPanel.tsx, in a comment

# SC-001 — Card is gone from the converted surfaces
grep -l "ui/Card" frontend/src/pages/{Dashboard,Inventories}.tsx \
  frontend/src/components/OwnedGearManager.tsx \
  frontend/src/components/event/SettingsTab.tsx frontend/src/pages/MyDefaults.tsx
#   expect: nothing

# SC-002 — VocabularyCard is gone
ls frontend/src/components/VocabularyCard.tsx 2>/dev/null
#   expect: no such file
```

---

## Unit tests

### Go — `db/reference_test.go`

| Case | Asserts |
|---|---|
| a value no plan references | `UsageCount == 0`, and `DeleteReferenceValue` succeeds |
| a value one channel references | `UsageCount == 1`, and the delete returns `ErrInUse` |
| the same value on a *different* event | counted 0 here — usage is event-scoped |
| the template response | carries no usage count at all (FR-034) |

**SC-007 is the load-bearing one**: the count and the refusal come from the same
function, so a value reporting zero must be deletable and one reporting more must
not be. If they can disagree, the column is a lie.

### TypeScript — `lib/dashboard.test.ts`

| Case | Asserts |
|---|---|
| a mix of dated and undated events | the hero is the soonest event *at or after* today |
| an event today | is the hero, not "past" |
| only past events | no hero; `upcoming` empty; `past` newest-first |
| only undated events | no hero; they sort last under *Also coming up* |
| an empty account | every list empty, no hero, no crash |

---

## The manual passes

### 1 · The inventory catalog at real size *(worth doing)*

Open a 308-item inventory at 1440 px.

- All twelve categories visible in the rail without scrolling; the sheet shows
  ~28 items.
- Click a category: the sheet filters, the strip's count follows, the rail row is
  amber. Click it again: cleared.
- Open a lighting item: its DMX modes are in the editor's notice block, with an add
  row. Add one, delete one. **No dialog opens at any point.**
- Open a non-lighting item: no modes block.

### 2 · The two drawers

- `Categories`: rename one, change a picker role, delete an empty one. The sheet
  behind does not shift.
- `Import`: the format note is readable *before* you pick a file. Import one; the
  result appears **in the drawer**, and the page does not jump.
- As a contributor on someone else's inventory: both drawers open and read;
  neither offers an operation.

### 3 · The vocabulary panel *(worth doing)*

Event Settings, on an event with a real patch.

- Nine vocabularies in the rail, with counts. Pick *Signal types*.
- A value used by channels shows a non-zero `In use`; one used by nothing shows `—`.
- Open the used one: the notice says how many, and that renaming is safe.
- Try to delete it: refused, and the message matches what the column implied.
- Open **My Defaults**: same panel, **no `In use` column**.

### 4 · The dashboard *(worth doing)*

- With an upcoming event: the hero is bordered amber, the countdown is right, the
  ribbon draws, five figures, five verdicts. Compare a verdict against that event's
  own tab — they must agree.
- The dot travels the ribbon's runs, staggered.
- **Set the OS to reduce motion, reload: it stops.** Nothing else changes.
- With no upcoming event: no hero, an actionable empty state, past events still
  listed.
- With no events at all: the empty state and the primary action, nothing broken.
- Resize to 900 px: the dated rows keep their date column aligned.

### 5 · Login and Events

- Login: the button looks *identical* to before — it is the same classes, now
  imported. Trigger an error (`?error=not_allowed`): the block is `red-800`.
- Events: search filters the grid; clearing restores it. An account with no events
  shows one sentence and the button that fixes it.

### 6 · The phone

Every converted surface at phone width: Inventories keeps its category dialog and
condensed list, Settings keeps its stacked cards, Dashboard and Events keep their
condensed rows. This wave does not touch any of them, and this pass exists to
catch having broken one by accident.
