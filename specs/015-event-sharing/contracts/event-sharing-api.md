# API Contract: Event Ownership & Sharing (Slice 15)

All routes below sit behind the existing `middleware.RequireAuth` (Slice
14); the `/events/{eventID}/...` ones additionally sit behind the new
`middleware.RequireEventAccess`, which gates by HTTP method: **GET**
requires at least `viewer`; **POST/PUT/PATCH/DELETE** require `owner` or
`contributor`. A request for an event the caller has no role on at all
gets **404** (not 403 — research.md R2); a viewer's mutating request gets
**403**.

## `GET /api/v1/events`

Unchanged shape, changed scope: returns only events the caller owns or is
a member of (was: all events). Each object gains `yourRole`.

## `POST /api/v1/events`

Unchanged body; the created event's `owner_user_id` is set to the caller
automatically (no field for this in the request body — it cannot be set
by the client).

## `GET /api/v1/events/{eventID}`

Unchanged shape, gains `yourRole` for the caller.

## `PATCH /api/v1/events/{eventID}` / `DELETE /api/v1/events/{eventID}`

Unchanged bodies; now require `owner` or `contributor` (previously
unauthenticated-but-open).

## `GET /api/v1/events/{eventID}/members`

- **Auth**: any role (owner/contributor/viewer) may list members.
- **200 OK**
  ```json
  [
    { "userId": 1, "email": "owner@example.com", "name": "Owner Name", "pictureUrl": "...", "role": "owner", "invitedBy": null, "createdAt": "..." },
    { "userId": 2, "email": "collab@example.com", "name": "Collab Name", "pictureUrl": "...", "role": "contributor", "invitedBy": 1, "createdAt": "..." }
  ]
  ```

## `POST /api/v1/events/{eventID}/members`

- **Auth**: owner or contributor.
- **Body**: `{ "userId": 2, "role": "contributor" }` (role: `"contributor"` | `"viewer"`).
- Upserts the membership (research.md R5) — re-inviting an existing
  collaborator with a different role changes their role.
- **400** if `userId` doesn't refer to a known user (someone who has
  never signed in — FR-007), or if `userId` is the event's own owner.
- **201 Created** with the resulting membership row (same shape as the
  list endpoint's entries).

## `PATCH /api/v1/events/{eventID}/members/{userID}`

- **Auth**: owner or contributor.
- **Body**: `{ "role": "viewer" }`.
- **400** if `userID` is the event's owner (FR-011 — the owner's access
  cannot be changed through this endpoint).
- **200 OK** with the updated membership row.

## `DELETE /api/v1/events/{eventID}/members/{userID}`

- **Auth**: owner or contributor.
- **400** if `userID` is the event's owner (FR-011).
- **204 No Content** (idempotent — removing a non-member is not an error).

## `GET /api/v1/users`

- **Auth**: any signed-in user (not event-scoped).
- Returns every known user (id, name, email, pictureUrl) for the invite
  picker — the frontend filters out people already on the current event's
  member list (research.md R6).
- **200 OK**: `[{ "id": 1, "email": "...", "name": "...", "pictureUrl": "..." }, ...]`

## Not in this contract

- No endpoint changes to any existing `/events/{eventID}/audio-patch`,
  `/lighting-rigs`, `/rentals`, `/stage-plots`, etc. route's request/response
  shape — only their authorization gate changes (they now sit behind
  `RequireEventAccess`, mounted at the same paths, prefix stripped
  internally per research.md R1 — externally invisible to API consumers).
