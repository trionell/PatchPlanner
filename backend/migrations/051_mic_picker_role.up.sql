-- 'mic' becomes a fourth picker_role, alongside cable/stand/truss (019).
-- One-time backfill: any category the old name-matching heuristic in
-- AudioInputsTab.tsx treated as mic inventory gets the role explicitly, so
-- those inventories keep working once the heuristic is deleted. A category
-- with no picker_role that doesn't match keeps none — same as a brand new
-- mic category would, requiring a manual role assignment.
UPDATE inventory_categories
SET picker_role = 'mic'
WHERE picker_role IS NULL
  AND LOWER(name) LIKE 'mikrofon%';
