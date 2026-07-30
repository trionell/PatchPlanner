# D5 — Plan

Stack, gates, layout and the design-language routing table are in `CLAUDE.md`;
nothing here departs from them. This is a frontend-only change: eleven files in
`frontend/src`, one section of `design/components.md`, no backend, no migration.

## The decision the brief left open

**`noteId` is an explicit prop, required by the type whenever `info` is passed.**

The alternative was deriving identity from something structural the call site
already has — a component name, a route, a `useId()`. All three fail the same
way: they are stable only until someone renames or moves a file, and none of them
is *visible* at the call site, so the *Pricing* collision would have been just as
invisible in the derived scheme as it was in the title one. An explicit name is
the only form where the identity is written down next to the sentence it
remembers.

Required-with-`info` is what makes it a fix rather than a convention:

```ts
type DrawerProps = DrawerBase &
  ({ info: ReactNode; noteId: string } | { info?: undefined; noteId?: undefined })
```

A drawer that passes `info` and forgets `noteId` does not compile. A drawer that
passes `noteId` and no `info` does not compile either, which keeps the prop from
drifting into a general-purpose id that some future feature reads for something
else. This is the whole reason to spend a type on it: the fault being fixed was
undetectable by reading either call site, and it is now undetectable only if
`tsc -b` never runs — and `tsc -b` is a gate.

## The second, smaller decision

**The `pp-info:drawer:<Title>` keys already in browsers are left where they are.**

There is no user data in them — each is the string `open` or `closed` — and no
migration path worth writing: `localStorage` cannot be enumerated from the server,
the mapping from old title to new `noteId` would have to be a hardcoded table
shipped to every client to run once, and the worst outcome of skipping it is that
one note re-opens once at whatever it was last set to, and is then put away for
good. That is a smaller cost than the code that would avoid it. Said out loud
here because it is a decision, not an oversight.

The `drawer:` prefix stays inside the component, so the key is
`pp-info:drawer:<noteId>` and drawer notes remain one namespace, separate from the
panel notes (`flow-desk-job`, `plot-desk-job`) that name themselves. No new
`noteId` can collide with an orphan: every one is kebab-case and every orphan is a
capitalised title or a catalog name.

## Approach

1. **`ui/Drawer.tsx`** — split `DrawerProps` into the base and the two-member
   union above, destructure `noteId`, feed it to `useInfoNote`. The doc comment on
   `info` gains the sentence about identity; the one on the component does not
   change, because none of its reasoning does.
2. **The eight call sites** — one prop each, per spec FR-003. The two `Pricing`
   drawers are named for the thing they price, which is the distinction their
   titles never carried: `event-pricing` (what a hire costs) and `catalog-pricing`
   (what a supplier charges).
3. **`ui/Drawer.test.tsx`** — the existing `flush` suite is untouched; a second
   suite pins the type rule with `@ts-expect-error` in both directions, and pins
   that a rendered `info` still produces one toggle and one panel. Persistence
   itself is not testable here and is not tested: these tests render with
   `renderToStaticMarkup` and no `window`, which is exactly the guard
   `useInfoNote` already has its own reasoning for.
4. **`design/components.md` §4** — `noteId` stated where `Drawer`'s props are
   stated. §4 already carries the footer/`info` rule that sent Slice 31 back; this
   is the sentence after it, about which of the two the drawer remembers you read.

## Complexity Tracking

No constitutional deviation. The mockup step is waived under the ROADMAP D5
decision of 2026-07-30 — asked and answered before the work started — on the
grounds that the `design/` edit adds a prop to a table and moves no pixel. The
spec → plan → tasks apparatus runs in full, which is the part D4 skipped and the
part that trigger exists for.
