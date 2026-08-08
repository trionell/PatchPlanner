## 1. Migration

- [ ] 1.1 Create `backend/migrations/051_mic_picker_role.up.sql`: backfill
  `UPDATE inventory_categories SET picker_role = 'mic' WHERE picker_role IS
  NULL AND LOWER(name) LIKE 'mikrofon%'`.
- [ ] 1.2 Create `backend/migrations/051_mic_picker_role.down.sql`: clear
  `picker_role` back to `NULL` for rows matching the same `WHERE` shape.

## 2. Backend: picker_role gains 'mic'

- [ ] 2.1 Add `'mic'` to `validPickerRole` in `backend/internal/api/inventories.go`.
- [ ] 2.2 Update the three "invalid picker_role" error message strings in
  `inventories.go` to list `mic` alongside `cable`, `stand`, `truss`.
- [ ] 2.3 Add/extend a Go test covering category creation and update with
  `picker_role: "mic"` (accepted) and an unknown role (still rejected).

## 3. Backend: mic sources may be unassigned

- [ ] 3.1 Remove the `source.MicItemID == nil` rejection branch in
  `validInputSource` (`backend/internal/api/audio_patch.go`), keeping the
  "line forbids mic_item_id/stand_item_id/phantom_power" branch unchanged.
- [ ] 3.2 Update the doc comment above `validInputSource` to reflect that
  `mic_item_id` is now optional for `kind: "mic"`.
- [ ] 3.3 Update `backend/internal/api/audio_patch_test.go`'s "mic without
  mic_item_id → 400" case (~line 118-122) to expect success (201) instead,
  and add a case verifying the created source has `mic_item_id: null`.
- [ ] 3.4 Add a test verifying an existing unassigned mic source can later be
  updated with a valid `mic_item_id`.

## 4. Backend: audit downstream consumers of mic_item_id

- [ ] 4.1 Verify `backend/internal/db/rental.go`'s rental/quantity counting
  excludes sources with a null `mic_item_id` (it already filters `WHERE
  mic_item_id IS NOT NULL`) — add a regression test with an unassigned mic
  source in the fixture confirming it contributes no quantity.
- [ ] 4.2 Verify `backend/internal/service/audio_pdf_sections.go` renders an
  unassigned mic source without error (e.g. blank/placeholder mic label) and
  fix if it doesn't.

## 5. Frontend: picker_role type and role-picker UI

- [ ] 5.1 Add `'mic'` to `InventoryCategory['picker_role']` in
  `frontend/src/types/index.ts`.
- [ ] 5.2 Add `{ value: 'mic', label: 'Mic' }` to `PICKER_ROLES` in
  `frontend/src/components/inventory/InventoryDrawers.tsx`.

## 6. Frontend: source mic list and default kind

- [ ] 6.1 In `frontend/src/components/event/AudioInputsTab.tsx`, replace
  `micItems`'s category-name filter with a `picker_role === 'mic'` lookup,
  modeled on how `standItems` is resolved.
- [ ] 6.2 Change the new-source default in
  `frontend/src/components/event/InputGraphCanvas.tsx:290` from `kind:
  'line'` to `kind: 'mic'`.
- [ ] 6.3 Verify `frontend/src/lib/patchSheet.ts:127` and
  `frontend/src/components/event/InputGraphCanvas.tsx:323-324` already
  render an unassigned mic source's label sensibly (they null-check
  `mic_item_id` today) — fix if either assumes non-null.

## 7. Frontend tests

- [ ] 7.1 Update/add Vitest coverage in `frontend/src/lib/patchSheet.test.ts`
  for an unassigned mic source (`kind: 'mic'`, `mic_item_id: undefined`).
- [ ] 7.2 Add coverage confirming a newly created source object defaults to
  `kind: 'mic'`.

## 8. Validation

- [ ] 8.1 Run backend gates: `cd backend && gofmt -l . && go vet ./... && go
  test ./...`.
- [ ] 8.2 Run frontend gates: `cd frontend && npx tsc -b && npx eslint src &&
  npx vitest run && npx vite build`.
- [ ] 8.3 Manually verify against a copy of real data
  (`PATCHPLANNER_DB` pointed at a `/tmp` copy, never the live `backend/
  patchplanner.db`): assign the mic role to an existing mic category, confirm
  the Sources drawer's Mic select now lists items, create a new source and
  confirm it defaults to kind "Mic" with no item, attach an item, and switch
  it to "Line".
