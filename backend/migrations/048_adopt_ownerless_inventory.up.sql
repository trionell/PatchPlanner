-- Repair the orphaned legacy catalog (ROADMAP.md D1). Migration 038 created the
-- one pre-existing catalog ownerless, to be adopted on first login; the adoption
-- in db.EnsureUserHasInventory returned early whenever the logging-in user
-- already owned an inventory, so in any database where that happened the legacy
-- row is still owner_user_id IS NULL. A NULL owner matches nobody in
-- middleware.RequireInventoryOwner, so every owner-scoped route 404s for a
-- catalog that events are still bound to, and the inventory is absent from the
-- list, so it cannot be repaired through the interface either.
--
-- The code fix stops new databases reaching that state. This claims the row in
-- the ones that already have. It cannot guess an owner from nothing, so the rule
-- is the one defensible fact on hand: the owner of the events already bound to
-- it — the earliest such event, so several owners resolve deterministically to
-- the one who has had the catalog longest.
--
-- An ownerless inventory with no owned event bound to it is deliberately left
-- alone: there is nothing here to derive an owner from, and the fixed adoption
-- claims it on the next login.
UPDATE inventories
SET owner_user_id = (
  SELECT e.owner_user_id
  FROM events e
  WHERE e.inventory_id = inventories.id AND e.owner_user_id IS NOT NULL
  ORDER BY e.id
  LIMIT 1
)
WHERE owner_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM events e
    WHERE e.inventory_id = inventories.id AND e.owner_user_id IS NOT NULL
  );
