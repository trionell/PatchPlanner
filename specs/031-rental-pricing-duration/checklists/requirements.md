# Specification Quality Checklist: Rental pricing by duration

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Decisions taken with the user before the spec

- [x] The rate card steps **down** and clamps at both ends — not interpolated
- [x] The charged-days rule cascades user default → catalog (copied at import) → event
- [x] An import carrying a rate card **replaces** the whole table
- [x] The factor multiplies the **order**, not the line
- [x] VAT joins the same cascade, with a file's own rate beating the user's default
- [x] `total_ex_vat` → `subtotal_ex_vat` is a deliberate breaking rename
- [x] A catalog with no rate card says so in amber **words**; the strip's tint is unchanged
- [x] Owned gear is outside pricing entirely

## Cross-artifact analysis (2026-07-30)

Nine findings, all remediated before implementation. The three that mattered:

- [x] **The user's defaults seed a catalog at creation, not at import.** The
      columns are `NOT NULL`, so an import had no unset state to detect and would
      have undone the edit the drawer exists to allow. Imports apply only what the
      file states. (spec FR-012/FR-017, data-model, T025–T027)
- [x] **A catalog has no read-only role.** `/inventories/{id}` is owner-guarded,
      so US2's "a contributor or viewer reads the drawer" was untestable. The
      reachable read-only case is a viewer on an **event**. (spec US2, US3)
- [x] **VAT provenance is reported, not stored.** Both drawers claimed *read from
      LL.xlsx*; nothing stored it and it would have kept claiming it after an
      edit. It is a line in the import result. (spec FR-017a, mockup revision 3)

Plus: FR-016 and FR-032 gained verifying tasks, `BilledDays`' four cases were
named in T007, `pricing_note` became a list, and T002's down-migration was
pinned to the convention 040/041/046 already set.

## Design gate

- [x] Mockup built and published — [mockup.html](../mockup.html), revision 2
- [x] Approved by the user, 2026-07-30
- [x] No `design/` file is edited by this slice (FR-038, SC-006) — every
      construction is already in the language, so the second Frontend Design
      Workflow trigger does **not** fire
