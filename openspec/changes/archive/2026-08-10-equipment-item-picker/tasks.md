## 1. Backend — the description on an owned line

- [x] 1.1 Add `Description string \`json:"description,omitempty"\`` to `EventOwnedEquipment` in `backend/internal/domain/owned.go`, beside `OwnedItemName`
- [x] 1.2 Add `COALESCE(o.description, '')` to **both** select lists in `backend/internal/db/owned.go` — the list query (~line 72) and the single-row query (~line 99) — positioned to match the scan order
- [x] 1.3 Add the matching argument to `scanEventOwnedEquipment` (~line 133)
- [x] 1.4 ~~in `backend/internal/api/`~~ — written in `backend/internal/db/` instead (`TestEventOwnedEquipmentCarriesDescription`). **Deviation**: the substance is the same and it covers both select lists, which is where the defect would live; the handler adds no logic of its own over the query
- [x] 1.5 `cd backend && gofmt -l . && go vet ./... && go test ./...`

## 2. Frontend — types and the row model

- [x] 2.1 Add `description?: string` to `EventOwnedEquipment` in `frontend/src/types/index.ts` (`EventRental` already carries it — verify before adding)
- [x] 2.2 Add `description` to `EquipmentRow` in `frontend/src/lib/equipmentRows.ts`, mapped from both the owned and the rented side
- [x] 2.3 Extend `frontend/src/lib/equipmentRows.test.ts` for both sources, including an item with no description

## 3. `ui/RecordField`

- [x] 3.1 Create `frontend/src/components/ui/RecordField.tsx` — `ui/Button variant="outline"` geometry, `h-8` desk / `h-10` hand; empty it invites, holding one record it reads `name · description` in ink-then-muted with a `title`, holding several it reads `N items`; it opens whatever overlay the caller passes and offers no clear control
- [x] 3.2 Unit-test the three states with `renderToStaticMarkup` — empty, one record, several — including a record with no description (name alone, no em-dash)

## 4. The catalog picker

- [x] 4.1 Create the picker component: `ui/Drawer wide` + `flush` body + `PanelCols` + `PanelRail` + `SheetTable`, taking either catalog and returning chosen item ids
- [x] 4.2 Derive the rail's `{label, qualifier?, count}` from either catalog without branching on shape — 27 free-form category names with a `category_type` qualifier, or up to 5 fixed types; omit any category with no items
- [x] 4.3 Columns Item · Description · Stock, with `Stock` reading `quantity_available` (rented) or `quantity_owned` (owned); a stock of `0` stated plainly; long descriptions truncated with a `title`, a missing one an em-dash
- [x] 4.4 Sticky search row with a mono match count, focused on open, matching name **and** description through the existing `matchesSearch` in `lib/patchSearch`
- [x] 4.5 Two gestures per row — the name chooses and closes while nothing is ticked; the tick accumulates and keeps the drawer open; once anything is ticked the name ticks instead
- [x] 4.6 A real `<input type="checkbox">` beside a named target so `Tab` reaches both, `Space` ticks and `Enter` chooses
- [x] 4.7 Footer appears only once something is ticked: `"N items selected · N lines on the sheet"` with **Choose N items** at `ml-auto`
- [x] 4.8 Candidates already on the sheet carry no tick and do not choose, stating `on the sheet · N` — absent, never disabled; a category whose every item is planned still renders every row and simply shows no footer
- [x] 4.9 The four states: no match within a category (plus **Search all N items**), owned catalog empty, catalog empty, catalog loading — reusing the existing wording; the drawer opens even when the catalog is empty
- [x] 4.10 Re-opening while holding a selection restores every tick and lands on the chosen item's category
- [x] 4.11 Give `ui/Drawer` a focus return target (as `ui/Sheet` already has) so closing returns focus to the field that opened it

## 5. The desktop add editor

- [x] 5.1 Replace the Item `<select>` in `AddEquipmentLine` (`EquipmentSheet.tsx`) with `ui/RecordField` + the picker, rendering the picker **beside** `RowEditor` and never within it, so `Escape` does not reach both
- [x] 5.2 Default `EMPTY_ADD.source` to `'rented'`, leaving the option order unchanged
- [x] 5.3 Grow the editor to N lines when N > 1: a full-width child of `RowEditor`'s own flow so the confirm wraps below it, each line with its own quantity, one confirm reading **Add N lines**; at N = 1 the editor is unchanged from today
- [x] 5.4 A batch line defaults to quantity 1 in the department its `category_type` implies — lighting → Light, everything else → Audio. **A single add keeps today's `0 / 0` and must be typed** (ruling B)
- [x] 5.5 Changing Source clears the whole batch, as it already clears one chosen item
- [x] 5.6 No per-line note; the single add keeps its Note field
- [x] 5.7 Save: N sequential calls against the existing PUTs, not stopping at the first failure, one invalidation at the end
- [x] 5.8 Partial failure keeps the editor open holding only what failed with quantities intact, the confirm re-reading **Add N lines** for the remainder, the error naming what landed
- [x] 5.9 `⌘/Ctrl+Enter` saves the whole batch; `Escape` closes the picker first and the editor second

## 6. The desktop sheet — reading it back

- [x] 6.1 Add a Description column second, between Item and Source, at `max-w-56 truncate text-zinc-500` with an em-dash for missing — matching `RentalSheet`
- [x] 6.2 Pass `row.description` into the sheet's `matchesSearch` call so `Find a line…` matches it
- [x] 6.3 The open row editor's static Item text becomes `name · description` in the record field's two inks

## 7. The phone

- [x] 7.1 `MobileEquipmentEditSheet`: replace the Item `<select>` with `ui/RecordField` opening the picker as a **second** `ui/Sheet` layer, the add sheet staying mounted so the draft survives
- [x] 7.2 Default the phone's `source` state to `'rented'`
- [x] 7.3 Picker sheet bar of two rows — `MobilePicker variant="title"` + count, then the search field **open** rather than behind a target
- [x] 7.4 ~~Rows are `CondensedListRow`~~ — **deviation**: a picker row has *two* gestures, and `CondensedListRow` makes the whole row one tap target (*"one state or one affordance, never both"*); a tick nested in a row-wide `<button>` is invalid markup besides. `PhoneCandidateRow` copies its geometry — 44 px minimum, the same hairline, the same two truncating lines — rather than inventing one. Subtitle `description · Stock N` with a missing description dropped, as specified
- [x] 7.5 Footer holds the confirm full width and nothing else, with the safe-area inset, the count in the label (**Choose 3 items**)
- [x] 7.6 The batch in the hand: name at the left, editable numbers at the right edge, both departments shown, ~64 px a row
- [x] 7.7 The add sheet's title counts — **Add a line** / **Add 3 lines**
- [x] 7.8 Back, Escape and the scrim close the picker only
- [x] 7.9 Re-rank the `EquipmentTab` phone subtitle: (1) description, or type when there is none; (2) source; (3) qty with its split; (4) `exceeds owned N`, conditional and never dropped; (5) note
- [x] 7.10 Add `description` to the phone branch's own search filter in `EquipmentTab`

## 8. `design/` — in the same commit as the code, never a docs phase

- [x] 8.1 `components.md` §4: add `ui/RecordField` beside `ui/Input` and `ui/Select`, at `h-8`/`h-10`, with its *names what it holds* contract
- [x] 8.2 `components.md` §`ui/Dialog`: the clause distinguishing a Drawer picker from a Dialog picker — a short vocabulary is *answered*, a catalog is *worked in*
- [x] 8.3 `patterns.md` §4: the filter rail's "fourth instance" becomes the fifth
- [x] 8.4 `patterns.md` §2: the overlay-beside-the-editor rule, and a row editor holding N lines under one confirm where the lines were chosen together and differ only in a quantity
- [x] 8.5 `patterns.md` §7b: the stated exception for a search field left open where finding is the surface's entire job
- [x] 8.6 Confirm no value written into `design/` disagrees with what the code actually renders — multiply the stated values out rather than copying them

## 9. Gates and review

- [x] 9.1 `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`
- [x] 9.2 `cd backend && gofmt -l . && go vet ./... && go test ./...`
- [x] 9.3 Run the `reviewer` subagent against the spec's requirements, the diff and the tests
- [x] 9.4 Walk the surface in a browser at both widths against a **copy** of the database with `PATCHPLANNER_DB` — the 338-item catalog, the fifteen `Mikrofonkabel`, an item already on the sheet, and a partial-failure batch
- [x] 9.5 Write the outcome into `ROADMAP.md` (manual — `openspec archive` knows nothing about it)

## 10. Review findings, fixed

The `reviewer` subagent found ten defects against the spec. All are fixed on this
branch; the numbering is that report's.

- [x] 10.1 **A NUL byte in `CatalogItemPicker.tsx:38`** made git store the whole
      400-line component as **binary** — it appeared in no diff, `git blame` and
      `git merge` refused it, and `grep -r` skipped it silently. It compiled and
      every test passed, which is exactly why nothing caught it. The sentinel is
      now `'__all__'`, and `file` reports the component as text
- [x] 10.2 The `loading` prop was dead and the *catalog is still loading*
      requirement had **no implementation** — both call sites collapsed the
      queries with `?? []` before handing them down, so during the first fetch
      the picker said *Nothing in this catalog yet*, the one sentence the
      requirement forbids. Both catalogs' `isPending` now reach the picker
- [x] 10.3 Task 4.11 had not been done. `ui/Drawer`'s desktop branch now stores a
      focus return target as `ui/Sheet` already did — **this is what makes
      Escape-twice work**: without it focus fell to `<body>`, and `RowEditor`
      binds Escape on its own subtree, so the second press reached nothing
- [x] 10.4 The phone's partial-failure path never invalidated, so lines that
      *did* land stayed invisible. It now invalidates before it throws
- [x] 10.5 *Search all N items* cleared the query, so it was not the same search;
      it now widens the category only, and is offered only when a category is
      what narrowed the list
- [x] 10.6 The phone's Note field was rendered for a batch and then silently
      discarded. Hidden when `many`, as the desk already had it
- [x] 10.7 The phone's footer was the desk's composition — a 32 px confirm on a
      surface whose rule is 44, beside a statement too wide for 375 px. The phone
      now gets the confirm full width and nothing else (§7d)
- [x] 10.8 A planned candidate's name on the phone was a **disabled** button
      dressed to look otherwise (`disabled:opacity-100`). It is a `div` now —
      absent, not disabled (P7), as the desk already was
- [x] 10.9 `lib/equipmentCandidates.ts` had no test, leaving ruling B — the one
      rule most likely to be got backwards — unprotected. `equipmentCandidates.test.ts`
      covers both halves, both departments and the every-line requirement
- [x] 10.10 The desktop batch save bypassed `useMutation`, against Principle V's
      explicit MUST. It is a mutation now, invalidating in `onSettled` so a
      partial batch still redraws the sheet
- [x] 10.11 `choose()` used `.map(find)!` — a `!` that would have let `undefined`
      through if the catalog changed between opening and confirming. `flatMap`
      with a guard at both call sites
- [x] 10.12 After a partial failure the confirm read *Add line* where `design.md`
      says *Add 1 line*. It counts the remainder now

## 11. Verification

- [x] 11.1 **The browser walk was run by the user and the surface verified
      working** (2026-08-10). It is the one task on this list a green suite does
      not stand in for, and it is the step that closed the slice
