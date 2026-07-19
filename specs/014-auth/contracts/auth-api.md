# API Contract: Authentication (Slice 14)

All routes are mounted under `/api/v1/auth`. The login/callback/logout
routes are full-page browser navigations (never called via `fetch`), so
none of them need CORS handling; `/auth/me` is called via the frontend's
normal JSON API client.

## `GET /api/v1/auth/google/login`

- **Auth required**: no
- Generates a random CSRF `state` value, sets it as a short-lived
  `pp_oauth_state` cookie, and responds with `302 Found` to Google's OAuth
  consent screen (`Location` header built via `oauth2.Config.AuthCodeURL(state)`).

## `GET /api/v1/auth/google/callback`

- **Auth required**: no
- Query params: `code`, `state` (from Google's redirect).
- Validates `state` against the `pp_oauth_state` cookie (clears it either
  way); on mismatch, `302` to `${FRONTEND_URL}/login?error=state_mismatch`.
- Exchanges `code` for a token (server-to-server), fetches the profile from
  Google's userinfo endpoint.
- Checks `email` against `PATCHPLANNER_ALLOWED_EMAILS` (case-insensitive)
  **before** any `users` write.
  - **Not allowed**: no `users` row created, no session created, `302` to
    `${FRONTEND_URL}/login?error=not_allowed&email=<addr>`.
  - **Allowed**: upserts the `users` row (keyed on `google_sub`), creates a
    `sessions` row, sets the `pp_session` cookie
    (`HttpOnly`, `SameSite=Lax`, `Secure` iff the request came in over TLS,
    `Max-Age` = `PATCHPLANNER_SESSION_TTL`), `302` to `${FRONTEND_URL}/`.

## `GET /api/v1/auth/me`

- **Auth required**: yes (sits behind `RequireAuth`; the middleware's own
  401 *is* "not logged in" — no separate check needed in the handler)
- **200 OK**
  ```json
  {
    "id": 1,
    "email": "person@example.com",
    "name": "Person Name",
    "pictureUrl": "https://..."
  }
  ```
- **401 Unauthorized** (no/invalid/expired session) — `{"error": "not authenticated"}`

## `POST /api/v1/auth/logout`

- **Auth required**: no (idempotent — a repeat call or a call with no
  session is not an error)
- Deletes the `sessions` row matching the current cookie's hash, if any;
  clears the `pp_session` cookie (`Max-Age: -1`).
- **204 No Content** always.

## Error format

Matches the project's existing convention (`writeError` helper already used
by every other handler): `{"error": "<message>"}` with an appropriate
status code.

## Not in this contract (later slices)

- Any endpoint under `/api/v1/events/...` gains no new *shape* here — this
  slice only wraps the existing route group in `RequireAuth`, turning
  today's "no session → still 200" into "no session → 401." Per-event
  ownership/role checks, `GET /api/v1/users` (invite picker), and
  `/events/{id}/members` are Slice 15.
