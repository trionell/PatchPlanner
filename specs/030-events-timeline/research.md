# Phase 0 · Research

Seven questions were open when planning began. Each is recorded as decision, rationale, and
what was rejected — the rejections are the useful half, because three of them were the
obvious answer.

---

## R1 · How is the column renamed on SQLite?

**Decision.** `ALTER TABLE events RENAME COLUMN date TO start_date` in migration
`045_event_start_date_rename`, and the reverse in its `.down.sql`. One statement each way.

**Rationale.** SQLite has supported `RENAME COLUMN` since 3.25 (2018) and
`modernc.org/sqlite` tracks a far newer version. The rename preserves every row, every
index and the table's identity, so nothing referencing `events(id)` is disturbed. The
migration is exactly reversible, which the project's convention asks of every `.down.sql`.

**Alternatives considered.**

- *Rebuild the table* — create `events_new`, copy, drop, rename. This is the classic SQLite
  workaround from before 3.25 and is still the right move when changing a constraint. Here
  it would drop and recreate every foreign key pointing at `events` for a column name, with
  `PRAGMA foreign_keys` enforced on every pooled connection (Slice 0). Rejected as strictly
  more dangerous for no gain.
- *Keep `date` and add a `start_date` view/alias* — two names for one value is the problem
  the rename exists to solve.
- *Skip the rename* — considered and put to the user during mockup review; they chose the
  rename. FR-005.

**Consequence for delivery.** The rename touches the domain struct, three SQL statements,
the TS type and eight frontend call sites, and nothing else. It ships as commit 1 alone so
its diff can be read by pattern rather than by reasoning.

---

## R2 · Which date decides that an event is past?

**Decision.** `loadOutDate ?? endDate ?? startDate < today`. The **load-out** date, not the
last show day.

**Rationale.** This was the first draft's mistake and it is worth recording. Using the last
show day looks right — the show is over — but an event whose last band played last night
and whose truck loads out this morning is not something the dashboard should have stopped
talking about. The user is standing in the venue. The whole point of recording load-out is
that the commitment extends past the applause.

The same reasoning runs backwards and is why `running` starts at load-in rather than at the
first show day: on rig day you are working the show, so the show is what the dashboard
should be about.

**Alternatives considered.**

- *`endDate ?? startDate`* — rejected above.
- *`startDate` (today's behaviour)* — this is the defect. A three-day festival is "past" on
  its second morning.
- *A grace period (past + 1 day)* — invents a rule with no basis in what the user recorded,
  and would still be wrong for a two-day strike.

---

## R3 · Where does an undated event sit, and can it collide?

**Decision.** Last on the page, under its own `No date` heading. It is never next, never
running, never past, and never collides.

**Rationale.** Revision 1 of the mockup put undated events first, on the theory that an
undated event is a fresh draft you just made. On a chronological spine that placement is a
claim that they happened before the oldest dated event. An event with no date has not been
placed in time, so it sits after time.

It cannot collide because a collision is an intersection of intervals and it has no
interval. Treating "unknown" as "collides with everything" or "collides with nothing at a
particular date" would both be inventions.

**Alternatives considered.** Sorting undated events by creation date among the dated ones
using `created_at` as a proxy — rejected: the proxy is invisible to the user, so the
resulting order is unexplainable.

---

## R4 · How are collisions found, and how are the track's lanes packed?

**Decision.** **One sweep, producing both.** Sort events by first on-site day; walk once,
maintaining the set of intervals still open; an event that intersects any open interval
joins that group and takes the first free lane. The group membership is the collision; the
lane index is the track's row.

**Rationale.** The first design had two functions — `findCollisions` and `packLanes` — and
they would have been two implementations of "do these two events share a day". That is the
failure mode `design/principles.md` P6 names and the one Wave 4 avoided by refusing a
summary endpoint: two implementations of one claim eventually disagree, and the disagreement
shows up as a row braced on the spine whose marks do not stack on the track.

Sharing the sweep also makes the discriminant cheap: once a pair is known to share on-site
days, deciding *overlap* versus *on-site clash* is one further interval test on the show
spans, done only for pairs that already collided.

**Complexity.** O(n log n) for the sort, O(n · lanes) for the walk. With a realistic upper
bound of a few hundred events per year and lanes in the low single digits, this is not worth
optimising further.

**Alternatives considered.**

- *Pairwise O(n²)* — fine at this scale and simpler to write, but it produces the collision
  set without producing the lanes, so the lanes would need the sweep anyway.
- *An interval tree* — a data structure for a problem this size is exactly the speculative
  infrastructure Principle V forbids.

---

## R5 · How does the year track position a mark?

**Decision.** `left = dayOfYear(start) / daysInYear`, `width = max(span / daysInYear, 3px)`,
both as percentages of the track, with the 3 px floor applied by CSS `min-width` rather than
by clamping the computed percentage.

**Rationale.** Using the real `daysInYear` (365 or 366) rather than a constant 365 keeps the
December marks from drifting past the right edge in a leap year — a one-day error nobody
would report and everybody would half-notice. Applying the floor in CSS rather than in the
arithmetic keeps the *position* honest while making the *mark* clickable: clamping the
percentage would push a one-day event in late December visibly off its date.

The mockup states this as "the smallest lie available", and it is the only place the track
is not to scale.

**Alternatives considered.**

- *A 12-column month grid with events placed within a month cell* — simpler, but a 3-day
  event straddling a month boundary has nowhere to go.
- *SVG* — a single `<svg>` would draw this fine, but it needs its own hit-testing, its own
  focus handling and its own tooltip mechanism, all of which divs get from the platform.

---

## R6 · How does the unfold animate to an unknown height?

**Decision.** A wrapper with `display: grid` transitioning `grid-template-rows` from `0fr`
to `1fr` over 160 ms, with the content in an `overflow: hidden` child, all inside
`@media (prefers-reduced-motion: no-preference)`.

**Rationale.** `height: auto` is not animatable. The alternatives are measuring the content
in JavaScript and animating to a pixel height, or animating `max-height` to a guessed
ceiling. The grid-fraction technique is the only one that animates to the content's actual
height with no measurement and no guess, and it degrades to an instant open when the
media query does not match — which is exactly the required reduced-motion behaviour, for
free.

`tokens.md` §6 permits `transition-colors` plus the one named pulse, and requires any new
animation to carry the same wrapper. This is a new animation, so §6 gains an entry naming
it (FR-044).

**Alternatives considered.**

- *`max-height` to a guessed value* — either clips a tall summary or produces a visibly
  wrong easing on a short one, because the transition runs over the guess rather than the
  content.
- *Measuring with `ResizeObserver`* — correct, and it puts layout measurement into a page
  whose entire point is that it is cheap to render.
- *No animation at all* — defensible, and the fallback if the transition proves distracting
  in field testing. The reduced-motion path already is this.

---

## R7 · Does the summary need a server endpoint?

**Decision.** No. Four existing queries — audio patch, lighting rig, rental summary, stage
plots — for the one opened event, under the cache keys `Dashboard` and `OverviewTab` already
use.

**Rationale.** This question was settled in Wave 4 (Slice 28) and the answer has not
changed: the numbers here are *derivations*, not counts. `2 gaps` is a walk over the cable
graph and `addressed` is a partition of identical spans. A Go implementation would be a
second implementation whose failure mode is the timeline disagreeing with the tab it links
to — the same class of bug R4 avoids by sharing a sweep. `lib/eventSummary.ts` calls the
owning functions, and 23 tests assert the agreement rather than hoping for it.

The cost is bounded by fetching only on open: a page of two hundred events issues one
request until a row is clicked, and a re-opened row issues none.

**Alternatives considered.**

- *`GET /events/{id}/summary`* — rejected here for the reason it was rejected in Wave 4, and
  recorded in `design/audit.md`.
- *Prefetching the next show's summary on page load* — it is already in cache from the
  dashboard in the common case, and prefetching on a page whose job is scanning spends
  bandwidth on a row the user may never open.
