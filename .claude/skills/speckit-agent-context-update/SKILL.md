---
name: speckit-agent-context-update
description: Refresh the managed Spec Kit section in coding agent context file(s)
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: agent-context:commands/speckit.agent-context.update.md
---

# Update Coding Agent Context

Refresh the managed Spec Kit section inside the coding agent context/instruction
file(s) — here `CLAUDE.md` and `.github/copilot-instructions.md`.

## Behavior

The script reads `.specify/extensions/agent-context/agent-context-config.yml` to discover:

- `context_files` — project-relative paths of the context files to manage. When
  non-empty it takes precedence over `context_file`.
- `context_file` — single-file fallback when `context_files` is empty.
- `context_markers.start` / `.end` — the delimiters around the managed section.
  Defaults to `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->`.

It then creates, replaces, or appends the managed block so the section points at the
most recent `specs/<feature>/plan.md`.

The block is **generated in full each run**. Everything between the markers is
replaced, so nothing hand-written may live there — durable project instructions
belong below `<!-- SPECKIT END -->`.

Context file paths must stay project-relative; absolute paths, Windows drive paths,
backslash separators and `..` segments are rejected.

## Execution

Run from the project root:

```
.specify/extensions/agent-context/scripts/bash/update-agent-context.sh [plan_path]
```

When `plan_path` is omitted the script auto-detects the most recently modified
`specs/*/plan.md`. Pass an explicit path when the newest file by mtime is not the
active feature — `.specify/feature.json` holds the active `feature_directory`.

Requires Python 3 with PyYAML on `PATH`; if it is missing the script exits 0 without
changing anything, which is how this block silently goes stale.

## Reporting

Report the files updated and the plan path written, e.g.
`agent-context: updated CLAUDE.md → specs/039-plot-trusses-drawer/plan.md`.
