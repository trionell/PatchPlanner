# CLAUDE.md

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/037-flow-canvas-plane/plan.md`

The overall implementation roadmap (all feature slices, their order, and
dependencies) is in `ROADMAP.md` at the repository root.
<!-- SPECKIT END -->

Everything below the marker is durable and survives the block's regeneration.
Read it first; it answers most of what a slice needs without opening another file.

## Stack

| | |
|---|---|
| Backend | Go 1.25+ — standard library + chi router, SQLite via `modernc.org/sqlite`, `golang-migrate` |
| Frontend | React 18 + TypeScript 5 + Vite + Tailwind, TanStack React Query, react-hook-form + zod, react-router-dom |
| Tests (BE) | Go `testing` + `httptest` |
| Tests (FE) | Vitest with `renderToStaticMarkup` from `react-dom/server`. **No DOM, no React Testing Library.** |
| Phone | The branch is `useIsMobile()` — `(max-width: 767px)`. Tap targets ≥ 44 px |
| Docs | `xuri/excelize` for spreadsheets; a pure-Go (CGO-free) PDF writer |
| Production | One Go binary — `make build` embeds the frontend via `go:embed` |

## Gates

All must pass before a slice is done. Verified green 2026-07-30.

```
cd backend  && gofmt -l . && go vet ./... && go test ./...
cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build
```

`tsc -b`, **never** `tsc --noEmit` — the root `tsconfig.json` is references-only,
so `--noEmit` type-checks nothing and passes unconditionally.

`golangci-lint` is named as a merge gate by the constitution but is not installed
on this machine. Run it if it is available; do not block on it if it is not.

Never touch `backend/patchplanner.db`. To verify against real data, copy it to
`/tmp` and point `PATCHPLANNER_DB` at the copy.

## Where things are

```
backend/internal/{api,db,domain,service}/   backend/migrations/
frontend/src/{components,pages,hooks,lib,api}/
```

`lib/` is pure functions (graph and signal-flow logic). `domain/` is plain structs
with no DB tags. A schema change means a migration file — never `ALTER TABLE` in
application code.

## Design language

`design/` is the canonical visual language for the whole application, taken from
the audio Inputs/Outputs tabs. **Look values up; do not read the directory.**

| Question | Where |
|---|---|
| A value — colour role, density tier, type, radius, border | grep `design/tokens.md` |
| Which building block to reach for | `design/components.md` (§5 is the phone) |
| How a whole surface is assembled | `design/patterns.md` (§7 is the phone) |
| Settling an argument about a screen | `design/principles.md` — the one read-through, 218 lines |
| Why the app looks as it does | `design/audit.md` — **history. Part 1 is empty; every finding is closed.** Read only Part 3 before changing a value. Never read it whole |
| The language drawn rather than described | `design/design-language.html` — for human review; 2,203 lines, never read it whole |

`design/README.md` routes between them if this table does not.

Look values up in `design/`, not in `specs/*/contracts/*.md`. The slice contracts
record why a value was chosen at the time and stay accurate as history; `design/`
is what the code must match now. A slice that changes a value updates `design/` in
the same commit — never in a documentation phase at the end.

The `specs/*/mockup.html` files run to thousands of lines. Grep them; never read
one whole.

## Authority

`.specify/memory/constitution.md` is the one authority above everything here and
above `design/`. Where a rule and a constitutional principle appear to conflict,
the constitution wins. Any deviation is justified in that slice's `plan.md` under
Complexity Tracking.

## Workflow

Spec-Driven Development with Spec Kit. For every feature or change:

1. Understand the request, and whether it touches the user-facing frontend.
2. If it does, follow **Frontend Design Workflow** below and stop for approval.
3. Then, via the Spec Kit skills: specification → plan → tasks. Write these
   yourself — they are the brief you implement from, and they carry questions
   for the user. Keep them lean: state what is true of *this slice*, not what is
   already true of the project and written above.
4. Run the `analyze` subagent over spec/plan/tasks before implementing.
5. Implement, then run the Gates above.
6. Review against the specification and acceptance criteria; fix what review finds.
7. Report complete only after validation succeeds.

Always work on the spec-specific branch and commit after each stage. **Merging to
main or pushing a PR is the user's decision, not yours.**

Delegate when it reduces context or gives independent review; the briefs live in
`.claude/agents/`.

| Agent | For |
|---|---|
| `explorer` | finding the relevant code when it is not obvious |
| `mockup` | building and publishing a slice's design mockup |
| `analyze` | cross-artifact consistency before implementing |
| `validator` | running the Gates — returns failures only |
| `reviewer` | independent review before declaring a slice complete |

Do **not** delegate the spec, the plan or the tasks. Their output is the working
context for everything after them, so sending it away only means reading it back.

### Defects

A defect listed in `ROADMAP.md` under *Known defects* already carries its own
brief — the cause traced to a line, what a fix has to cover, and the decision the
fix has to make first. **That section is the spec; do not transcribe it into a
`specs/` directory.** Work on a `dN-short-name` branch, fix it, and write the
outcome back into its ROADMAP section under **Fixed**, with the decisions worth
keeping. Mark the heading ✅ and the date.

A defect becomes a full slice — spec → plan → tasks — when it edits `design/`,
needs a migration, or spreads past a handful of files. D4 was the first kind and
was not run as one: it amended `components.md` §4, changed `patterns.md` and
`tokens.md`, and deleted `ui/Table`, with no design approval anywhere. That is
the case this rule and the second trigger below both exist to catch.

**Never add a defect on your own.** When you find one, report it — the
reproduction, the line, and what a fix would have to cover — and **stop and ask**
before writing a section into `ROADMAP.md`. Recording one schedules future work
and promotes a symptom to a traced fault; both are the user's call. Once
approved, an open defect also takes a row in the **What remains** index, which it
loses when fixed.

## Frontend Design Workflow

Two triggers. The first is a judgment call; the second is not.

- A task **introduces, modifies, or substantially changes a user-facing frontend.**
- A change **edits `design/`.** Editing `tokens.md`, `components.md`,
  `patterns.md` or `principles.md` *is* changing the design, whatever the task was
  called — a defect fix that amends the language is still amending the language.
  Deleting a component from `ui/` counts. If you are about to make that edit,
  stop: the design is approved first and written second.

Then:

1. Delegate the mockup to the **`mockup` subagent**. It loads the
   `/frontend-design` skill, builds `specs/<slice>/mockup.html`, publishes it as
   an Artifact, and returns the URL plus the decisions it made. The ~1,600 lines
   of markup stay out of this context; the review is visual anyway.
2. Present the artifact URL and the returned decisions to the user.
3. **STOP and wait for explicit user approval.**
4. Do not begin production frontend implementation until the user approves.
5. Send revision feedback back to the **same** agent with `SendMessage`, so it
   revises rather than rebuilds. It republishes to the same URL.
6. After approval, fold the approved design into the spec and the plan — the
   agent's decision list is written to become the functional requirements.
7. Then continue autonomously through implementation and validation.

This approval is the primary human checkpoint in the workflow. The subagent
builds the mockup; **it never approves it, and neither do you.**

Build the mockup inline instead when the design is the hard part of the slice and
you need the understanding in this thread to write the spec — several slices here
drew the mockup *before* the spec for exactly that reason.

If the user says the design is already approved, or supplies an approved design,
do not build another mockup — go straight to the Spec Kit workflow. That hatch
covers *applying* an approved language. It does not cover *amending* one: the
moment the work needs a rule `design/` does not already state, the second trigger
fires and the hatch is shut.

## Autonomy

After design approval — or when no approval is required — work autonomously
through spec, plan, tasks, implementation, testing, review and fixes. Do not ask
for confirmation on routine implementation decisions; record the important ones in
the slice's artifacts instead.

Stop and ask only when:

- requirements are genuinely ambiguous and cannot reasonably be inferred;
- two requirements conflict;
- a destructive or irreversible action is required;
- a significant product decision is not covered by the specification;
- a security-sensitive decision requires human judgment;
- a defect is about to be recorded in `ROADMAP.md` — see *Defects* above.
