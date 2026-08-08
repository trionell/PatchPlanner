-- Reverts only the rows this migration's up backfill set. A category a user
-- assigned the mic role to by hand after the up migration ran is also
-- cleared here, since there is no marker distinguishing "backfilled" from
-- "hand-assigned" — the same one-way convention as the 009 mic backfill and
-- 019's cable_item_id backfill.
UPDATE inventory_categories
SET picker_role = NULL
WHERE picker_role = 'mic'
  AND LOWER(name) LIKE 'mikrofon%';
