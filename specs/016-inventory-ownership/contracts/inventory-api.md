# API Contract: Inventory Ownership & Duplication (Slice 16)

Two separate route groups with different authorization gates
(research.md R3) — do not confuse them.

## Direct inventory management — owner-only (`RequireInventoryOwner`)

All under `/api/v1/inventories`.

| Method | Path | Notes |
|---|---|---|
| GET | `/inventories` | List inventories the caller owns (no path param — filtered by context user) |
| POST | `/inventories` | Create a new, empty inventory owned by the caller (`{"name"}`) |
| GET | `/inventories/{id}` | Get one — 404 if the caller isn't its owner |
| PATCH | `/inventories/{id}` | Rename |
| DELETE | `/inventories/{id}` | **400** if any event still has `inventory_id = {id}` (FR-010) |
| POST | `/inventories/{id}/duplicate` | Deep-copies categories/items/fixture-modes/source file into a new inventory, same owner (research.md R7) |
| GET | `/inventories/{id}/categories` | Moved from the old global `/inventory/categories` |
| PATCH | `/inventories/{id}/categories/{categoryID}` | Picker-role edit — same shape as today |
| GET | `/inventories/{id}/items` | Moved from the old global `/inventory/items` |
| POST | `/inventories/{id}/import-xlsx` | **Changed shape**: multipart file upload (was: no body, read a fixed server path) — research.md R1 |
| GET/POST | `/inventories/{id}/items/{itemID}/fixture-modes` | Moved from the old global path |
| PATCH/DELETE | `/inventories/{id}/fixture-modes/{modeID}` | Moved from the old global path |

## Reading an inventory through an event — any role (`RequireEventAccess`, GET-only)

Under the existing `/events/{eventID}` group — **no new middleware**,
reuses Slice 15's rule that any role may GET.

| Method | Path | Notes |
|---|---|---|
| GET | `/events/{eventID}/inventory/categories` | Resolves the event's bound `inventory_id` server-side, returns its categories |
| GET | `/events/{eventID}/inventory/items` | Same, for items — **this is what every existing planning picker now calls** instead of the old global `/inventory/items` |

## Event creation — extended body

`POST /events` now requires `inventoryId` (an inventory the caller
owns) in its body; 400 if omitted or not owned by the caller. Response
shape unchanged otherwise.

## Not in this contract

- No change to any of the 11 existing tables' own endpoints
  (`/events/{id}/stageboxes`, `/lighting-rigs/...`, etc.) beyond the new
  cross-inventory validation (research.md R6) applied to their existing
  request bodies — same routes, same shapes, just a new 400 case when the
  picked item belongs to a different inventory than the event is bound to.
- No endpoint to change an event's `inventory_id` after creation (spec.md
  Assumptions — permanent, matching Slice 15's permanent ownership rule).
