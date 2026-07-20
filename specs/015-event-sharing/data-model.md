# Data Model: Event Ownership & Sharing (Slice 15)

Migration `037_event_sharing` — additive: one nullable column on `events`,
one new table. No entry needed in `db.go`'s staged-`Migrate(N)` sequencing
(nothing destructive happens around it); picked up by the trailing `m.Up()`.

## `events` (extended)

| Column          | Type    | Notes                                                        |
|-----------------|---------|---------------------------------------------------------------|
| `owner_user_id` | INTEGER | REFERENCES users(id), nullable — every event created after this slice always has one; pre-existing rows start NULL and are claimed by `ClaimOwnerlessEvents` on the next login (research.md R3) |

## `event_memberships`

Represents one other person's access to a specific event (spec.md's
"Collaborator" entity). The owner is **not** a row here — it's the
`events.owner_user_id` column, kept separate since the owner can never be
demoted/removed (FR-011) and is always exactly one per event by
construction (a column, not a row that could be duplicated or deleted).

| Column               | Type     | Notes                                                    |
|----------------------|----------|-------------------------------------------------------------|
| `id`                 | INTEGER  | PRIMARY KEY AUTOINCREMENT                                    |
| `event_id`           | INTEGER  | NOT NULL REFERENCES events(id) ON DELETE CASCADE             |
| `user_id`            | INTEGER  | NOT NULL REFERENCES users(id) ON DELETE CASCADE              |
| `role`               | TEXT     | NOT NULL CHECK(role IN ('contributor','viewer'))             |
| `invited_by_user_id` | INTEGER  | REFERENCES users(id), nullable (who invited them)            |
| `created_at`         | DATETIME | DEFAULT CURRENT_TIMESTAMP                                    |

Unique constraint: `UNIQUE(event_id, user_id)` — one role per person per
event; re-inviting upserts the role rather than creating a duplicate row
(research.md R5). Index: `idx_event_memberships_user_id` on `user_id`
(supports the events-list scoping query's join).

## Derived, not stored: "your role"

An event's role for the *current* request's user (`"owner"` |
`"contributor"` | `"viewer"` | absent) is never persisted — it's computed
per request:
- The events-list query (`ListEventsForUser`) computes it inline via a
  `CASE` + `LEFT JOIN event_memberships` for every row in one query.
- Any single-event request already has it resolved once by
  `middleware.RequireEventAccess` (via `db.GetEventRole`) and available
  through `middleware.EventRoleFromContext` — handlers reuse that instead
  of re-querying.

## Response shape additions

- `domain.Event` gains `YourRole string \`json:"yourRole,omitempty"\`` —
  set by the API layer per request, never read from a DB column directly
  on the struct.
- New `domain.EventMembership` — the members-list response shape:
  `{ UserID, Email, Name, PictureURL, Role, InvitedByUserID, CreatedAt }`,
  denormalized with the joined user's profile fields (the project's
  established display-row convention, e.g. `ownedItemColumns` in
  `owned.go`) so the frontend never needs a second lookup per row.
