# Phase 1 · Data model

Four stored dates, two derived spans, one derived relationship. Nothing about a collision is
stored.

---

## 1 · `events` — the stored shape

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | INTEGER PK | no | unchanged |
| `name` | TEXT | no | unchanged |
| `start_date` | TEXT | yes | **renamed from `date`.** The first show day. |
| `load_in_date` | TEXT | yes | **new.** When you arrive. |
| `end_date` | TEXT | yes | **new.** The last show day. |
| `load_out_date` | TEXT | yes | **new.** When you leave. |
| `venue`, `notes`, `created_at`, `updated_at`, `owner_user_id`, `inventory_id` | | | unchanged |

All four dates are `YYYY-MM-DD` calendar days in local time, which is the form the existing
column already stores and the form `<input type="date">` produces. **There are no times and
no time zones**, which is why every comparison in this slice is a string comparison — ISO
dates sort lexicographically, and `lib/dashboard.ts` already relies on this.

**Every existing row is correct the moment the columns exist.** A row with only a
`start_date` is a one-day event you arrive at and leave on the day, which is what it has
always meant.

### Migrations

| | |
|---|---|
| `045_event_start_date_rename.up.sql` | `ALTER TABLE events RENAME COLUMN date TO start_date;` |
| `045_…​.down.sql` | the reverse rename |
| `046_event_spans.up.sql` | three `ALTER TABLE events ADD COLUMN … TEXT;` |
| `046_…​.down.sql` | three `DROP COLUMN`s |

`046`'s down migration loses data, which is unavoidable and correct: reversing the addition
of a column means the column's values go with it. Every other value survives.

---

## 2 · Derivation — filling the gaps

The four dates form a chain, and an absent value takes its neighbour's. Written as it will
be implemented:

```
loadIn  = load_in_date  ?? start_date
first   = start_date                        // the only one with no fallback
last    = end_date      ?? start_date
loadOut = load_out_date ?? end_date ?? start_date
```

Note that `loadOut` falls back **twice**: an event with a last show day but no load-out
loads out on its last show day, not on its first. Getting this wrong would silently shorten
every multi-day event that did not fill in load-out.

An event with no `start_date` at all resolves nothing. It is undated, and it participates in
no derivation below.

### The two spans

| Span | From | To | What it is for |
|---|---|---|---|
| **Show span** | `first` | `last` | Identifies the event to a reader. Distinguishes an overlap from an on-site clash. |
| **On-site span** | `loadIn` | `loadOut` | Decides past / running / upcoming. The interval collisions are computed on. |

Show span is always contained within on-site span, which the validation below guarantees.

### Derived quantities

| Name | Definition |
|---|---|
| `showDays` | `last − first + 1`, inclusive. A one-day event is `1`, never `0`. |
| `onSiteDays` | `loadOut − loadIn + 1`, inclusive. |
| `hasDistinctOnSite` | `loadIn ≠ first || loadOut ≠ last`. Governs whether the row states an on-site range at all. |

---

## 3 · Validation

One rule, enforced by the server on create and on update:

```
loadIn ≤ first ≤ last ≤ loadOut
```

applied to the **resolved** values, so an event supplying only `end_date` earlier than
`start_date` is caught, and an event supplying nothing is trivially valid.

Rejection is a `400` naming the offending pair — not a generic "invalid dates" — because the
form has four fields and the user needs to know which two to look at. See
[contracts/events-api.md](contracts/events-api.md) for the exact messages.

**Nothing partial is stored**: validation runs before any write.

The client validates the same rule for immediate feedback, and the server validates it
because the client's validation is a convenience, not a guarantee.

---

## 4 · State machine

An event moves through four states as the clock advances. The transitions are computed, never
stored, and the boundaries are inclusive at both ends.

```
                  today < loadIn          upcoming
                  today = loadIn          load-in day   ┐
          loadIn < today ≤ last           running       ├─ "current"
             last < today ≤ loadOut       running       ┘
                  today > loadOut         past
```

| State | Test | Where it shows |
|---|---|---|
| `upcoming` | `today < loadIn` | Countdown `in 17 d`. The soonest one is *the next show*. |
| `load-in` | `today == loadIn` and `loadIn < first` | `load-in today`. Counted as current. |
| `running` | `loadIn ≤ today ≤ loadOut` | `day 2 of 3`, countdown `on now`. Counted as current. |
| `past` | `today > loadOut` | Dimmed row, `11 mo ago`. |
| `undated` | no `start_date` | None of the above. Listed last. |

`load-in` is a labelling refinement of `running`, not a fifth bucket: both are "current", and
`partitionEvents` returns one `running` array. The distinction exists only so the day-label
can say something true on rig day.

**This state machine is the defect fix.** Today the only test is `start_date < today`, which
puts a three-day festival into `past` on its second morning.

---

## 5 · Collisions — a derived relationship

A collision is between two events and is never stored. It is produced by the single sweep
described in [research.md](research.md) R4.

| Field | Meaning |
|---|---|
| `groupId` | Which set of mutually-touching events this belongs to. Rows sharing a `groupId` are braced together. |
| `kind` | `overlap` when the two **show** spans intersect; `on-site-clash` when only the **on-site** spans do. |
| `lane` | The row within the year track. Assigned by the same sweep. |

Rules:

- **Undated events never collide** — no interval.
- **Role is irrelevant.** An event where the user is a `viewer` collides exactly as an owned
  one does.
- **A collision never blocks a save**, is never red, and is never confirmed. It is a fact
  about a plan, not an error in it.
- Three or more mutually-touching events form one group, and each gets its own lane.
- Where a group contains both kinds of pair, each row states the strongest relationship it
  personally has — an event that overlaps one neighbour and merely clashes on-site with
  another says `overlaps`.

---

## 6 · Frontend types

```ts
interface Event {
  id: number
  name: string
  startDate?: string      // renamed from `date`
  loadInDate?: string     // new
  endDate?: string        // new
  loadOutDate?: string    // new
  venue?: string
  notes?: string
  created_at: string
  updated_at: string
  yourRole?: 'owner' | 'contributor' | 'viewer'
  inventoryId: number
}
```

Resolution, spans and collisions live in `lib/eventTimeline.ts` as pure functions over this
type. Nothing derived is added to the interface — a component that wants `onSiteDays` calls
for it, so there is no second place for it to be wrong.
