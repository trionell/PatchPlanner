# Data Model: Authentication (Slice 14)

Migration `036_auth` — purely additive (two new tables), no data
conversion, no entry needed in `db.go`'s staged-`Migrate(N)` sequencing
list; picked up by the final unconditional `m.Up()`.

## `users`

Represents a person who has signed in at least once (spec.md's "User
Account" entity). This is the FK target Slice 15's per-event membership
table will reference.

| Column          | Type     | Notes                                                     |
|-----------------|----------|------------------------------------------------------------|
| `id`            | INTEGER  | PRIMARY KEY AUTOINCREMENT                                  |
| `google_sub`    | TEXT     | NOT NULL UNIQUE — Google's stable, immutable account ID    |
| `email`         | TEXT     | NOT NULL UNIQUE COLLATE NOCASE — case-insensitive matching |
| `name`          | TEXT     | NOT NULL DEFAULT ''                                        |
| `picture_url`   | TEXT     | nullable                                                    |
| `created_at`    | DATETIME | DEFAULT CURRENT_TIMESTAMP                                  |
| `last_login_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP — bumped on every login          |

Upsert is keyed on `google_sub` (FR-005: recognize a returning person as the
same account); `email`/`name`/`picture_url` refresh from Google's profile on
every login (edge case: profile changes between visits are picked up, not
frozen at first sign-in).

## `sessions`

Represents one active signed-in period (spec.md's "Session" entity).

| Column        | Type     | Notes                                                        |
|---------------|----------|----------------------------------------------------------------|
| `token_hash`  | TEXT     | PRIMARY KEY — SHA-256 of the opaque cookie value; the raw token is never stored |
| `user_id`     | INTEGER  | NOT NULL REFERENCES users(id) ON DELETE CASCADE               |
| `created_at`  | DATETIME | DEFAULT CURRENT_TIMESTAMP                                     |
| `expires_at`  | DATETIME | NOT NULL — fixed TTL at creation, `PATCHPLANNER_SESSION_TTL` (default 720h) |

Index: `idx_sessions_user_id` on `user_id` (supports a future "sign out
everywhere" without a table scan, though not exposed as a feature in this
slice).

Deleting a session row is sign-out (FR-007); an expired but undeleted row
is simply rejected on lookup (`expires_at < now`), matching the edge case
of a session lapsing mid-use.

## Non-persisted concept: Approved Sign-in List

Spec.md's "Approved Sign-in List" entity is **not** a table in this slice —
it is `PATCHPLANNER_ALLOWED_EMAILS`, a comma-separated env var parsed once
at process startup into an in-memory, case-insensitive set (R4). It gates
whether a `users` row is ever created, but has no schema of its own; FR-010
("update a configuration list, no code changes") is satisfied by an env var
edit + restart, not a database write.
