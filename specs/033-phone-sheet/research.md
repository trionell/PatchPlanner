# Phase 0 — Research

Eight questions. Six were answered by reading `design/` and the tree; two — R3
and R6 — are the only places this phase makes a call that no document had
already made.

---

## R1 · Does `Drawer` branch, or does every drawer call site?

**Decision: `ui/Drawer` reads `useIsMobile()` and returns a `Sheet`.**

`Drawer` and `Sheet` have the same shape — title, subtitle, body, footer,
backdrop-and-`Escape` to close, nothing rendered when closed. The only prop
`Drawer` carries that a sheet cannot use is `width`, and a phone has one width.
So the branch is a two-line early return whose props pass through unchanged.

**Rationale.** Six drawers exist today — Rig, Buses, Universes, Categories,
Import, and Slice 32's manage drawer — and none has a phone form. Branching in
the component gives all six one, in one place, before 6c reaches any of them.
Branching at the call sites asks the same question six times, which is precisely
how `NodeShell`, `PortDot` and `PortRow` ended up with two copies each and cost
Slice 25 to undo.

**Alternatives considered.**

- *One component with an `anchor` prop.* Rejected:
  [components.md](../../design/components.md) §5 already names two components
  sharing a header, the way `Drawer` and `Dialog` already share one. A single
  component would also have to carry `width`, which is meaningless at one of its
  two anchors — the API-that-must-never-be-used problem A11 rejected a
  `tier` prop on `FieldStack` for.
- *Each call site branches.* Rejected as above.
- *`Drawer` renders bottom-anchored itself, no `Sheet`.* Rejected: three phone
  surfaces need the sheet and have no desktop drawer (the section list, the
  category filter, the nav's More), so the shell has to be reachable on its own.

**Consequence for the desktop:** `Drawer`'s desktop return must move verbatim
below the new early return. Nothing inside it changes, which is reviewable as a
diff.

---

## R2 · What does withholding the scrim actually mean?

**Decision: `scrim={false}` renders no backdrop element at all.**

[patterns.md](../../design/patterns.md) §7f grants the canvas inspector one
exception, and gives the reason: *it is the one sheet read against what is
behind it — you tapped the node to find out about the node, and dimming it
answers the wrong question.*

Setting the backdrop's colour to transparent would satisfy the sentence and miss
the point. A transparent full-screen element still swallows every touch, so the
canvas behind it would be frozen: no panning, no tapping the next node. The
honest reading is **structural** — no backdrop, the outer wrapper
`pointer-events-none` with the panel `pointer-events-auto`, and the canvas stays
live underneath.

Three things follow, and they are why this is worth deciding in 6a rather than
in 6d:

1. **The sheet is then not modal.** `aria-modal` follows `scrim` rather than
   being hard-coded `true`, and focus is not trapped.
2. **There is no tap-outside-to-close**, because there is nothing outside to
   tap. The close control and `Escape` are the ways out. Tapping another node
   re-points the sheet, which is the behaviour the exception implies.
3. **6d does not reopen this file.** The canvases are the last phase; the seam
   they need exists now.

---

## R3 · `svh`, `dvh`, or `vh`?

**Decision: `max-h-[85svh]`.**

This is the first of the two calls no document had made. All three units resolve
differently on a phone whose browser chrome collapses as you scroll:

| Unit | Resolves to | What that does to a sheet |
|---|---|---|
| `vh` | the **largest** viewport — chrome collapsed | With the address bar showing, `85vh` is taller than 85 % of what is actually visible. The confirm can start below the fold. |
| `dvh` | the **current** viewport, live | The sheet's maximum height changes while the user scrolls inside it, so a long form resizes under the thumb. |
| `svh` | the **smallest** viewport — chrome showing | The sheet never exceeds the screen, at any chrome state, and never resizes while being read. |

`svh` is the conservative one, and a sheet is exactly the case it was
standardised for: a fixed overlay that must be fully visible in the worst chrome
state. The cost is that with the chrome collapsed the sheet could have been
slightly taller and is not — which nobody can perceive, because there is no
second sheet beside it to compare against.

**Alternatives considered.** `dvh` with a transition to damp the resize —
rejected: [tokens.md](../../design/tokens.md) §6 permits three animations and
names them, and "the overlay resizing itself while you read it" is the opposite
of what that section is protecting.

**Support.** `svh` is baseline in every browser this project targets. There is
no fallback layer, deliberately: a browser old enough to ignore the unit drops
`max-height` entirely and renders the sheet at its content height, which is
correct for every sheet short enough to matter and merely tall for the rest.

---

## R4 · Where does the label-above-control wrapper come from?

**Decision: `FieldStack` gains one width — `full` → `w-full`.**

M12's requirement is the *voice*: mono, uppercase, `tracking-[0.14em]`, the
label `FieldStack` already renders. The obstacle is that `FieldStack`'s four
existing widths are all wrong for a phone: `default` pins 160 px, `count` 80 px,
`short` 112 px, and `grow` is `min-w-40 flex-1` — whose `flex-1` grows the
*height* inside the `flex-col` a phone sheet stacks its fields in.

One entry in an existing map is the whole change:

```
default: 'w-40'   grow: 'min-w-40 flex-1'   count: 'w-20'   short: 'w-28'
full:    'w-full'                                                    ← new
```

**Rationale.** Three phone edit sheets need the identical wrapper, which is past
the threshold `xs` was added at (A2: nineteen buttons overriding one size). A new
`SheetField` component would be a second thing that renders a `MicroLabel` above
a control — which is the A1 and A12 failure exactly, a synonym no grep would
catch. Reusing `FieldStack` also fixes something nobody filed: `FieldLabel` is
used as a *sibling* of its control in all three phone sheets, so it labels
nothing; `FieldStack` **wraps** the control in its own `<label>`, so the phone's
forms acquire real label association as a side effect of the tier fix.

**Alternatives considered.** A `SheetField` export from `ui/Sheet.tsx` —
rejected as above, and because it would put a field primitive inside a shell
component whose whole claim is that it decides nothing about its contents.

---

## R5 · Does the `Escape` handler become a hook?

**Decision: yes — `hooks/useEscapeToClose.ts`, six lines.**

`Drawer` has had this effect since Slice 23. `Dialog` and `Sheet` both need it
now, which makes three callers. Principle V forbids abstracting *ahead* of a
second caller; it does not ask for a third copy. This is `PanelRail`'s situation
from Wave 5 with the argument already settled — except that here all three
callers exist in the same commit, so there is no "extracted before its second
caller" exception to justify.

The hook takes `(active: boolean, onClose: () => void)` and no more. It does not
own focus, scroll locking or the backdrop, because only one of the three callers
wants those the same way.

---

## R6 · What can actually be done about the keyboard?

**Decision: two viewport keys, and no JavaScript.**

This is the second call no document had made, and researching it turned up a
defect nobody had filed.

**`viewport-fit=cover` is missing, and without it the safe-area insets are
zero.** On iOS the page is laid out inside the safe area unless the viewport
opts into covering it, and `env(safe-area-inset-*)` evaluates to `0` in that
mode. `MobileNav` has carried `pb-[env(safe-area-inset-bottom)]` since Slice 21
and `pb-[calc(env(safe-area-inset-bottom)+12px)]` on its inline sheet — **both
inert, on the device they were written for, since the day they landed.** Nothing
about this is visible in a desktop browser at 375 px, which is why five waves of
review did not catch it. It is [audit.md](../../design/audit.md) A5 once more: a
value a sibling positions against has to be a value that exists.

**`interactive-widget=resizes-content` helps on one engine and is ignored on the
other.** It makes the virtual keyboard resize the *layout* viewport rather than
only the visual one, so a bottom-anchored footer lands above the keyboard.
Chromium honours it; WebKit does not. So it goes in as an improvement where it
works, and **the sheet must not depend on it**.

**What the sheet does instead, and what it deliberately does not do.** The body
scrolls, so the focused field is inside a scroll container and every browser
already brings it into view on focus. Calling `scrollIntoView` ourselves was
considered and rejected: it fights the browser's own scroll-anchoring and lands
the field in a different place on each engine. The sheet's own defence is that
it *has* a scroll container at all, which is the half of M8 that is genuinely
ours.

**Verification.** Neither key can be verified in this toolchain — there is no
browser in it, let alone two mobile ones. This is Wave 1's stage-plot canvas
again, and the quickstart names it as the one thing needing a handset rather
than pretending a gate covers it.

---

## R7 · Does `Layout`'s bottom padding change here?

**Decision: yes, and M10 is closed whole rather than in half.**

`Layout`'s phone return is `pb-20` — 80 px, chosen to clear a bar whose height
is the sum of a `py-2.5`, an `h-5` icon and an 11 px label, plus an inset that
varies by device. R6 makes that inset real for the first time, which turns a
dormant guess into a live one: the moment the inset stops being `0`, `pb-20`
under-clears the nav on exactly the devices the inset exists for.

So the nav states its height — `h-14`, [tokens.md](../../design/tokens.md) §7's
own value and the desktop header's — and the body derives from it:

```
MobileNav   h-14 + pb-[env(safe-area-inset-bottom)]
Layout      pb-[calc(3.5rem+env(safe-area-inset-bottom))]
```

The phone header takes `h-14` in the same breath, because it is the same
sentence in the same file and `patterns.md` §7a already states it. Nothing
positions against the header yet, which is precisely why it is cheap now and
expensive later — `StagePlotTab`'s `top-[73px]` is what "later" looked like on
the other edge of the screen.

**This is one finding wider than the spec's FR-072 as first written**, which
covered only the body's padding. The spec is amended rather than the plan
quietly doing more: closing half a finding, in the file that holds the other
half, is the deferral-stops-being-visible failure `audit.md` Part 3 names.

**Stated visual delta:** the phone's nav becomes 56 px tall where it was ~66 px,
and the phone's header 56 px where it was ~53 px. Both are the numbers the
document already specified.

---

## R8 · What proves the desktop did not move?

**Decision: three gates, none of them "we looked at it".**

1. **`git diff --stat -- backend/` is empty.** The same assertion Slice 26 and
   Slice 28 made, run as a task rather than claimed in prose.
2. **The touched-file list is closed.** Every file this phase may modify is
   enumerated in `plan.md`; a diff naming any other file fails review.
3. **Class strings are compared through `twMerge`**, not read. Wave 0's
   accounting was only exact because it computed `twMerge` on the before and
   after of each converted element rather than eyeballing them — which is what
   caught four deltas the wave had believed were zero. `Drawer`'s desktop
   return, and every `Dialog` shorter than the viewport, get the same treatment.

**And one thing gets a real test.** The spec claimed there is nothing pure here
because a shell has no logic. That is wrong in the way `OverviewBands.test.tsx`
is the counter-example to: `renderToStaticMarkup` needs no DOM, and the claims
this phase most wants pinned are **structural** — the footer is a sibling of the
body rather than inside it, the delete is inside the body rather than in the
footer, a withheld scrim emits no backdrop element, `flush` removes the body's
padding. None of that is visible in a screenshot; all of it is visible in the
element order. `Sheet` is a pure presentational component and takes the same
treatment.

What cannot be tested that way is `Drawer`'s branch: `useIsMobile` reads
`window.matchMedia`, which does not exist in this test environment. Adding a DOM
to the suite for one boolean would be a larger change than the phase, so the
branch is covered by the diff of R8.2 and by the quickstart.
