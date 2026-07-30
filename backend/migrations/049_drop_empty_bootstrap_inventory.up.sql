-- A login no longer provisions an inventory (2026-07-30 decision): a new user
-- owns no catalog until they create or import one, or reach one through an
-- event shared with them. That leaves migration 038's bootstrap row homeless.
--
-- 038 inserts 'Imported catalog' ownerless and unconditionally, so *every*
-- database has one — a freshly created one included, where it holds nothing at
-- all. It existed to be adopted on first login; with that adoption narrowed to
-- "the catalog follows the events that read it" (048, and the login path in
-- db.ClaimInventoriesForOwnedEvents), an empty one has no events to follow and
-- would sit ownerless forever: invisible in the list, 404ing every owner-scoped
-- route. That is ROADMAP.md D1's state, reached by a different road.
--
-- So remove it — but only when it is genuinely empty. Anything with a category,
-- an item, or an event bound to it is real data: 048 claims it where an owner
-- can be derived, and nothing here touches it either way.
DELETE FROM inventories
WHERE owner_user_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM inventory_categories c WHERE c.inventory_id = inventories.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.inventory_id = inventories.id)
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.inventory_id = inventories.id);
