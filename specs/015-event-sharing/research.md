# Research: Event Ownership & Sharing (Slice 15)

All items below were resolved through direct reading of the current
codebase (post-Slice-14) and the roadmap-planning conversation — no
unknowns remain in the Technical Context.

## R1 — Per-event route grouping restructure

**Decision**: Introduce one real nested chi group, `r.Route("/events/{eventID}", func(er chi.Router) {...})`, declared once in `router.go`, with `middleware.RequireEventAccess` applied via `er.Use(...)`. Every handler that currently registers its own flat `/events/{eventID}/X` routes (`audio_patch.go`, `lighting.go`, `rental.go`, `owned.go`'s event-equipment routes, `stage_plots.go`, `plot_trusses.go`) has that literal prefix stripped from its route strings and is called with `er` instead of the top-level router. `EventsHandler` splits into `Register(r)` (kept: `/events` list + create, unauthenticated-per-event since there's no specific event yet) and a new `RegisterEvent(er)` (get/update/delete, moved into the new group). `OwnedHandler` splits into `Register(r)` (`/owned-items` catalog, not event-scoped) and `RegisterEventEquipment(er)` (`/owned-equipment`).

**Rationale**: Confirmed by reading every handler's `Register` method — six files declare `/events/{eventID}/...` patterns directly on the router passed into them (`grep '"/events/{eventID}'` across `internal/api/*.go`: `owned.go` ×3, `stage_plots.go` ×1 nested, `lighting.go` ×6, `rental.go` ×5, `audio_patch.go` ×35, `plot_trusses.go` ×1 nested). chi's `r.Use()` only applies to routes registered on that specific (sub)router after the `Use()` call — there is no way to attach a scoped middleware to routes registered directly on a flat parent router without either (a) real nesting or (b) `.With(middleware)` prepended to every individual route call. `stage_plots.go` and `plot_trusses.go` already use their own internal `r.Route("/events/{eventID}/X", ...)` nesting and already have precedent for a handler struct exposing multiple registration methods (`Register` + `registerTrussRoutes`) — this plan extends that exact precedent to `EventsHandler` and `OwnedHandler` rather than inventing a new pattern.

**Alternatives considered**:
- `.With(middleware.RequireEventAccess(db))` prepended to every individual route call — rejected: ~50 call sites across 5 files (35 in `audio_patch.go` alone) is far more error-prone (one missed call site silently ships an unauthenticated endpoint) than one shared group declared once.
- A brand-new top-level router per event-scoped handler — rejected: duplicates chi's own nesting primitive for no benefit.

## R2 — 404 vs 403 semantics

**Decision**: `RequireEventAccess` returns **404** when the requesting user is neither the owner nor a member at all (event does not exist *for them*), and **403** only when a resolved **viewer** attempts a mutating method (`POST`/`PUT`/`PATCH`/`DELETE`) on an event they can already see.

**Rationale**: Spec.md's FR-008 says a non-member's event must be "completely invisible" — a 403 would confirm the event's existence to someone who shouldn't even know it's there, while 404 reveals nothing. A viewer who already appears on the event's member list has no such concealment need; telling them plainly "you can view but not edit" (403) is more honest and useful than pretending the event vanished.

**Alternatives considered**:
- 403 for all access-denied cases — rejected: leaks event existence to people who should see nothing at all, directly contradicting FR-008's wording.

## R3 — Bootstrapping ownership for pre-existing events

**Decision**: `db.ClaimOwnerlessEvents(database, userID)` runs `UPDATE events SET owner_user_id = ? WHERE owner_user_id IS NULL` unconditionally after **every** successful login (called from `auth.go`'s callback handler, right after the session is created). No "is this the very first user ever" check is needed.

**Rationale**: The `WHERE owner_user_id IS NULL` clause is itself the atomic guard — after the first person to log in post-launch claims every ownerless event, the same statement is a guaranteed no-op (0 rows) for every subsequent login, by anyone. This achieves the roadmap's original "first user ever" framing with less code and no separate check-then-act race window; the only theoretical race (two people's very first logins landing at the exact same instant) is naturally serialized by SQLite's single-writer model, and is an accepted, undefended edge case given this app's tiny expected user count.

**Alternatives considered**:
- Counting existing users before insert to detect "am I the first" — rejected as unnecessary complexity once the `WHERE` clause was recognized as sufficient on its own; also would have introduced exactly the check-then-act race it was meant to avoid.

## R4 — Frontend viewer-mode UI scope

**Decision**: The frontend adds a role-aware "View only" banner on the event detail page and hides the new Invite/members-management UI for viewers. It does **not** audit or individually hide/disable every existing add/edit/delete control across the app's eight event-detail tabs. Backend enforcement (R2's 403) is the actual, complete security boundary; a blocked mutation surfaces through each component's **existing** per-component inline-error pattern (confirmed via `AudioOutputsTab.tsx`: `onError = (e) => setError(...)`, no global toast system exists) — the 403's error message flows straight through `client.ts`'s existing error-message extraction into that same inline display, with no new plumbing.

**Rationale**: Eight tabs' worth of controls, accumulated over 13 prior slices, is a large, easy-to-miss surface area; auditing it exhaustively risks a false sense of completeness (a missed button is a silent gap) more than it risks the alternative (a viewer occasionally sees a control that then correctly fails with an inline error). A blanket CSS-disable wrapper around each tab's content was also considered and rejected (R4 alternatives) since Print buttons live inside the same tab components and must keep working for viewers per FR-006 — a naive `pointer-events-none` wrapper would disable printing along with everything else.

**Alternatives considered**:
- Full per-component audit hiding every mutating control — rejected: large, error-prone surface area for a marginal UX gain over "the action fails with a clear message," given backend enforcement is already complete.
- A blanket disabled-overlay around each tab's content — rejected: would also disable each tab's Print button, which must keep working for viewers (FR-006).

## R5 — Members list & invite semantics

**Decision**: `GET .../members` returns the owner (role `"owner"`, not editable/removable) unioned with every `event_memberships` row, one flat list. `POST .../members` is an idempotent upsert (`INSERT ... ON CONFLICT(event_id, user_id) DO UPDATE SET role = excluded.role`) — re-inviting an existing collaborator with a different role just changes their role, matching the `UpsertEventOwnedEquipment` precedent already in `owned.go`. `PATCH`/`DELETE .../members/{userID}` reject (400) if `userID` is the event's owner (FR-011), checked in the handler via `db.GetEventRole` — this is a resource-specific business rule, not something the generic `RequireEventAccess` middleware (which only judges the *actor's* role) should encode.

**Rationale**: Reuses an established idempotent-upsert pattern already in the codebase rather than inventing a new one; keeps the generic per-event middleware focused purely on "can this actor act at all," leaving "is this specific target protected" (the owner) to the handler that actually knows what a member-management request is trying to do.

## R6 — Invite picker data source

**Decision**: `GET /api/v1/users` returns every known user (id, name, email, pictureUrl) with no server-side filtering; the frontend's invite dialog filters out people already on the current event's member list client-side.

**Rationale**: Simpler than a server-side "exclude already-invited" query parameter for a list that will realistically stay small (personal-scale allow-list); avoids a second, event-scoped query shape for the same data.

## Constitution check

No amendment needed. Principle V's Slice-14 auth line (Google OAuth + DB-backed sessions) is unaffected; Principle I's AVL-domain-modeling requirement doesn't forbid non-equipment administrative entities (already established by `users`/`sessions` in Slice 14 without objection). `internal/api/middleware/event_access.go` is a second file in the `middleware` subpackage the v0.3.0 amendment already canonicalized — no further constitution text changes required.
