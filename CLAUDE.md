# CLAUDE.md

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/036-phone-canvas/plan.md`

The overall implementation roadmap (all feature slices, their order, and
dependencies) is in `ROADMAP.md` at the repository root.
<!-- SPECKIT END -->

## Development Workflow

This project uses Spec-Driven Development with Spec Kit.

### General workflow

For every feature or change:

1. Understand the user's request.
2. Determine whether the change affects the user-facing frontend.
3. If the change affects the frontend, follow the **Frontend Design Workflow** below.
4. After any required frontend approval, use the Spec Kit workflow to:
   * Create or update the specification.
   * Create or update the implementation plan.
   * Generate or update implementation tasks.
5. Analyze task dependencies.
6. Implement tasks autonomously where possible.
7. Run appropriate tests, linters, type checks, and builds.
8. Review the implementation against the specification and acceptance criteria.
9. Fix issues found during review.
10. Only report the feature as complete after validation succeeds.
11. Always work on spec-specific branch and commit after each stage. Merge to main or push to PR is a decision for the user.

---

## Frontend Design Workflow

If a task introduces, modifies, or substantially changes a user-facing frontend:

1. **You MUST use the `/frontend-design` skill before implementing the frontend.**
2. Use the skill to create a visual mockup or prototype of the proposed UI.
3. Present the result to the user for approval.
4. **STOP and wait for explicit user approval.**
5. Do not begin production frontend implementation until the user approves the design.
6. After approval, incorporate the approved design into the Spec Kit specification and implementation plan.
7. Continue autonomously through implementation and validation.

The frontend design approval is the primary human checkpoint in the development workflow.

If the user explicitly says the frontend design is already approved or provides an existing approved design, do not unnecessarily create another mockup. Proceed to the Spec Kit workflow.

---

## Autonomous Execution

After the user approves the frontend design, or when no frontend approval is required, work autonomously.

Do not ask the user for confirmation for routine implementation decisions.

Continue through:

* specification
* planning
* task generation
* implementation
* testing
* review
* bug fixing

Only stop and ask the user when:

* requirements are genuinely ambiguous and cannot reasonably be inferred;
* two requirements conflict;
* a destructive or irreversible action is required;
* a significant product decision is required that is not covered by the specification;
* a security-sensitive decision requires human judgment.

When making reasonable implementation decisions, document important decisions in the appropriate project artifacts rather than interrupting the user.

---

## Agent Delegation

Use sub-agents when they reduce context size, enable safe parallel work, or provide independent review.

Do not delegate trivial tasks unnecessarily.

### Explorer

Use the `explorer` sub-agent when:

* the relevant code is not obvious;
* the task spans an unfamiliar subsystem;
* repository exploration would otherwise consume significant context.

The explorer should be read-only and return:

* relevant files;
* relevant tests;
* relevant architecture documentation;
* dependencies;
* risks;
* recommended files for the implementation agent to read.

The explorer should not implement changes.

### Reviewer

Use the `reviewer` sub-agent before declaring a non-trivial feature complete.

The reviewer should evaluate:

* the specification;
* acceptance criteria;
* the implementation diff;
* test results;
* architectural consistency;
* obvious regressions;
* security concerns.

The reviewer should not make changes. It should return either:

* `PASS`
* `NEEDS_CHANGES`

If it returns `NEEDS_CHANGES`, fix the identified issues and run the relevant validation again.

---

## Context Management

Optimize context aggressively.

Agents should receive the smallest context that is sufficient to complete their task.

Prefer:

* relevant specification sections;
* relevant plan sections;
* the current task;
* relevant architecture documentation;
* relevant source files;
* relevant tests;
* recent test failures;
* relevant git diffs.

Avoid automatically including:

* unrelated specifications;
* unrelated plans;
* unrelated tasks;
* complete repository contents;
* complete conversation history;
* large generated files;
* irrelevant tool output.

Do not use conversation history as persistent project memory.

Important decisions should be recorded in project artifacts so that future agents can retrieve them when needed.

When a task is complete, summarize the result concisely so that downstream agents can consume the result without reading the full implementation conversation.

---

## Parallel Work

When the task graph contains independent tasks, consider executing them in parallel using separate sub-agents.

Parallelize only when:

* tasks have no conflicting file ownership;
* dependencies are satisfied;
* the resulting integration work is smaller than the cost of coordinating the agents.

Good candidates for parallel execution include:

* independent backend and frontend work;
* independent services;
* independent test suites;
* documentation and implementation;
* read-only analysis tasks.

Avoid parallelizing multiple agents that modify the same files or tightly coupled code.

The primary agent remains responsible for integration and final validation.

---

## Completion Criteria

A feature is complete only when:

1. The implementation satisfies the specification.
2. Acceptance criteria are met.
3. Tests pass.
4. Relevant linting and type checks pass.
5. The final diff has been reviewed.
6. Any required frontend implementation matches the approved design.
7. No known blocking issues remain.

## Frontend design language

Before building or changing any UI, read `design/`. It is the canonical target
visual language for the whole application, taken from the audio Inputs/Outputs
tabs (sheet, flow, and the Rig/Buses drawers).

- `design/principles.md` — the rules that settle an argument about a screen
- `design/tokens.md` — colour roles, the two density tiers, type, radii
- `design/components.md` — which building block to reach for
- `design/patterns.md` — how a whole surface is assembled
- `design/audit.md` — where the app diverges today, and the convergence order
- `design/design-language.html` — the same language drawn as specimens, for
  human review; published as an Artifact, revised by editing the file

Look values up in `design/`, not in `specs/*/contracts/*.md`. The slice contracts
record why a value was chosen at the time and stay accurate as history; `design/`
is what the code must match now. A slice that changes a value updates `design/` in
the same commit.
