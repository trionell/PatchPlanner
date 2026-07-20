# API Contract: Per-Event Settings from a Personal Template (Slice 17)

Two separate route groups with different authorization gates
(research.md R3) — do not confuse them, mirroring the same split Slice
16 introduced for inventories.

## Personal template — any signed-in user, own template only (`RequireAuth`)

All under `/api/v1/reference-templates`. No path param at all — always
resolved from the authenticated request context, since a template is
singular per user (unlike inventories, which are plural per owner).

| Method | Path | Notes |
|---|---|---|
| GET | `/reference-templates` | Returns the caller's template, same `ReferenceData` shape (`{vocabulary: [{id, value, label}]}`) as today's global `GET /reference-data` |
| POST | `/reference-templates/{vocabulary}/values` | Add a value to the caller's own template (`{"value", "label"}`) |
| PATCH | `/reference-templates/{vocabulary}/values/{valueID}` | Rename (label only) — 404 if `valueID` doesn't belong to the caller |
| DELETE | `/reference-templates/{vocabulary}/values/{valueID}` | **Always succeeds** if the value exists and belongs to the caller — no in-use check (FR-009); 404 if it doesn't belong to the caller |

## Event vocabulary — owner/contributor edit, any role reads (`RequireEventAccess`, existing)

Under the existing `/events/{eventID}` group — **no new middleware**,
reuses the same rule every other mutating event-scoped resource already
follows: GET for any role, POST/PATCH/DELETE for owner/contributor only,
403 (or the caller-invisible controls per FR-011) for a viewer.

| Method | Path | Notes |
|---|---|---|
| GET | `/events/{eventID}/reference-data` | Replaces today's global `GET /reference-data` — same `ReferenceData` shape, now the event's own copy |
| POST | `/events/{eventID}/reference-data/{vocabulary}/values` | Add a value to this event's vocabulary |
| PATCH | `/events/{eventID}/reference-data/{vocabulary}/values/{valueID}` | Rename — 404 if `valueID` doesn't belong to this event |
| DELETE | `/events/{eventID}/reference-data/{vocabulary}/values/{valueID}` | **409** if any planning row in this event still uses the value (FR-008, research.md R6) |

## Event creation — no body change

`POST /events` is unchanged in shape. The one-time template-to-event copy
(spec.md User Story 2) happens server-side, inside the same transaction
as event creation, with no new request field — unlike Slice 16's
`inventoryId`, a personal template is singular per user, so there is
nothing for the client to pick.

## Not in this contract

- No endpoint to view or edit *another* user's personal template — it is
  never exposed by id, only ever resolved from the caller's own session
  (FR-012).
- No endpoint to re-sync an already-created event's vocabulary back to
  the creator's current template — the copy is permanent and one-way
  (spec.md FR-006/FR-007); the only way to change an event's vocabulary
  after creation is to edit it directly through the event-scoped routes
  above.
- `fixture_modes` routes (`/inventories/{id}/items/{itemID}/fixture-modes`
  etc.) are entirely out of scope — untouched, Slice 16's concern
  (spec.md FR-014).
