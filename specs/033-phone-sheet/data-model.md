# Phase 1 — Data model

**There is none, and that is the finding rather than an omission.**

This phase adds no table, no column, no migration, no endpoint, no query and no
field on any payload. `git diff --stat -- backend/ frontend/src/api/` is empty
for the whole slice, and that is a task rather than a claim
([tasks.md](tasks.md), [research.md](research.md) R8.1).

What follows is what *would* have been in this document, so that the absence is
legible rather than looking like a step someone skipped.

## What the phase touches instead

| Layer | Change |
|---|---|
| Schema | none |
| Migration | none |
| API surface | none |
| Client types (`types/index.ts`) | none |
| Client types (`types/mobile.ts`) | **one type deleted** — below |
| Component contract | one added, two extended — [contracts/overlay-components.md](contracts/overlay-components.md) |

## The one type that changes

`types/mobile.ts` today holds a fixed table grading all nine event sections:

```ts
export type MobileCapability = 'editable' | 'read-only' | 'viewer'

export interface MobileSectionCapability {
  section: 'overview' | 'audio-inputs' | … | 'settings'
  label: string
  capability: MobileCapability          // ← deleted
}
```

**`MobileCapability` and the `capability` field go**, along with the nine values
that populate it. What remains is `section` and `label` — nine destinations and
their names.

This is not a rename. The field described a state the application does not
otherwise have a word for, and described the state of the *build* rather than
the state of the *show* — it told a viewer-role user that Audio Inputs was
"Editable". Its own type comment admitted as much: *"informational only; never
overrides a user's actual role-based permission."* A field whose doc comment
says it may not be believed is a field with no reader.

Deleting it is also the only place in this phase where Principle II moves: it is
the frontend's one hard-coded table grading a domain surface by name.

**Downstream:** `MOBILE_SECTION_CAPABILITIES` keeps its name and its nine
entries. Renaming the constant would touch `EventDetail`'s import for no gain,
and the name is still accurate about what it lists — the sections. That call is
worth stating because the opposite one (rename it to `MOBILE_SECTIONS`) is
defensible; it is declined only because a rename in the same commit as a
deletion makes the deletion harder to read in review.

## What has no state at all

`ui/Sheet` holds none. `open` belongs to its caller, exactly as `Drawer`'s and
`Dialog`'s do, and the sheet renders `null` when closed. It owns no draft, no
selection and no scroll position — [patterns.md](../../design/patterns.md) §7d
is explicit that the three jobs commit differently, which is only expressible if
the container has no opinion about any of them.

The one piece of ephemeral state in the phase is the element focus was on before
the sheet opened, held in a ref so it can be restored on close (FR-011). It is
not state anyone else can read.
