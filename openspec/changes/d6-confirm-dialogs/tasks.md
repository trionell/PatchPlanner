Branch: `d6-confirm-dialogs`. **One commit per surface** (design.md, Goals).

Each site keeps its sentence. The *Sentence today* column is the recorded original —
review compares the JSX against this column, not against memory. Every conversion is the
same four moves, so they are stated once here and not repeated per task:

1. `useState<T | null>(null)` in the component that owns the list — the record, never a
   boolean.
2. The control's handler sets the record instead of calling `window.confirm`.
3. `<ConfirmDialog>` as a **sibling, last** in the returned fragment (design.md, Decision 2).
4. The sentence becomes children: subject in `<span className="text-zinc-200">`, trailing
   `?`/`Continue?` dropped, `title` a noun phrase.

## 1. Ordered simplest-first — flat lists, no enclosing overlay

- [x] 1.1 `event/StagePlotInspector.tsx:181` — layer delete. Sentence today: *"Delete layer
      "{name}" and every element on it?"* Raised from a `.map()` over layers inside the
      inspector; state goes on the inspector, not the row.
- [x] 1.2 `event/StagePlotTab.tsx:610` — plot delete. Sentence today: *"Delete stage plot
      "{name}" and everything on it?"* Single subject, no `.map()`.
- [x] 1.3 `event/InputDeviceSection.tsx:60` — device delete. Sentence today: *"Delete
      "{name}"? Any cable connected to it is removed with it."*
- [x] 1.4 `event/ProcessingDeviceSection.tsx:71` — same sentence, same shape. Named in D6's
      original eight.
- [x] 1.5 `event/TrueOutputDeviceSection.tsx:70` — same sentence, same shape.
- [x] 1.6 After 1.3–1.5: confirm the three are **not** byte-identical apart from a type
      parameter (design.md, Decision 1 *revisit if*). **They were.** The answer is not a
      hook: all three delegate to `DeviceSection`, which already owns the list, so the
      confirm lives there once and `onDelete` becomes the post-confirmation callback.
      Recorded in design.md, Decision 1. Fifteen call sites, thirteen files.

## 2. Counted sentences — the count must survive

- [x] 2.1 `event/StageboxSection.tsx:197` — *"Delete {name}? Every cable patched to it is
      removed with it ({n} {jack|jacks} in use)."* The pending record carries the box so
      `used` is recomputed for **that** box.
- [x] 2.2 `event/StageMultiSection.tsx:191` — *"Delete {name}? Every cable patched to it is
      removed with it ({n} {channel|channels} in use)."* Same shape as 2.1.
- [x] 2.3 `OwnedGearManager.tsx:161` — two sentences, chosen on `planned_on_events > 0`:
      *""{name}" is planned on {n} event(s). Deleting it removes it from those plans too."*
      / *"Delete "{name}" from your owned gear?"* The branch moves into the children.
      Raised from inside a `RowEditor` inside a `<tr>` — check z-order (task 5.2), and keep
      `editor.close()` firing after the mutation as it does today.

## 3. Sheets and sections with an enclosing surface

- [x] 3.1 `event/ConsoleSection.tsx:228` — *"Delete {name}? Cables patched to its local jacks
      are cleared; channels and outputs are kept."*
- [x] 3.2 `event/InputSheet.tsx:229` — *"Delete channel {n} {name}? Any cable landing on it is
      removed with it."*
- [x] 3.3 `event/OutputSheet.tsx:223` — *"Delete output {n} {name}? Any cable leaving it is
      removed with it."*
- [x] 3.4 `event/LightingSheet.tsx:344` — *"Delete {label}? This cannot be undone."* The
      consequence here is generic; leave it as it is — rewriting it is a product change,
      not this substitution.
- [x] 3.5 `inventory/InventorySheet.tsx:151` — *"Delete "{name}" from this inventory?"*
- [x] 3.6 `inventory/InventoryDrawers.tsx:174` — *"Delete the category "{name}"?"* Raised
      from inside a `Drawer`; the z-order check (task 5.2) applies hardest here.

## 4. The structurally different one, last

- [x] 4.1 `event/LightingTab.tsx:96` — bulk move. Sentence today: *"{verb} {n} fixture(s)?"*
      plus, when universes are skipped, *"Universe {list} needs more than {UNIVERSE_SIZE}
      channels, and will be left exactly as it is."* Pending record is
      `{ plan, verb } | null`; `confirmLabel` is the caller's verb; the `\n\n` suffix
      becomes a second block, not a literal newline. Called from four sites across the
      phone and desktop branches — all four must route through the new state.
- [x] 4.2 If 4.1's state shape differs in **kind** rather than in the record it carries,
      **stop** and put the escalate-to-a-slice question to the user (design.md, Risks).
      **It does not.** The record is `{ plan, verb, confirmLabel }` — bigger than a row,
      but still the subject the sentence is about. No escalation. `run` gained a fourth
      argument because `ConfirmDialog` needs a button word and `window.confirm` only ever
      had *OK*: *Re-address* and *Close the gaps*, since the sentence verb
      (*Close the gaps around*) does not stand up as a button.
- [x] 4.3 `window.alert` at `LightingTab.tsx:90` and `:100` is **out of scope** — leave both
      untouched and unchanged. See task 6.4.

## 5. Verification

- [x] 5.1 `grep -rn "window\.confirm" frontend/src` returns **zero live calls**. Four
      matches remain, all prose: the two originals plus two new comments explaining what
      the conversion changed (`DeviceSection.tsx:53`, `StagePlotTab.tsx:111`).
- [ ] 5.2 **Browser walk, the z-order check — NOT RUN.** No browser automation was
      available in this session. A dev server is the only thing missing; the fault this
      check exists for was found by reading the CSS instead (design.md, Decision 2
      correction), but reading is not looking. **Outstanding.**
      Original text: Open each confirm raised from inside an
      overlay — 2.3 (`RowEditor` in a table row), 3.1–3.6, and any of §1 nested in an
      inspector — and verify the dialog renders **above** it with both buttons reachable.
      Repeat at a phone viewport (≤767 px). This is the failure mode design.md Decision 2
      exists for and it does not show in tests.
- [ ] 5.3 Browser walk, the aim check — **NOT RUN**, same reason. The one real re-aim
      fault found (the stage plot) was caught by reading the mutation, and is fixed.
      Original text: with six near-identical rows, open a confirm on the
      third, cause the list to re-render, and verify it still names the third and destroys
      only it.
- [x] 5.4 Gates — all green. Backend `gofmt`/`vet`/`test` clean; frontend `tsc -b`,
      `eslint src`, `vitest run` (48 files, 619 tests) and `vite build` all pass. Run
      directly rather than delegated.
      Original text: `cd backend && gofmt -l . && go vet ./... && go test ./...` and
      `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`.
      Delegate to the `validator` agent.
- [x] 5.5 Review done inline over the full diff rather than delegated.
      Original text: via the `reviewer` agent, against `specs/destructive-confirmation/spec.md`.

## 6. Close-out

- [x] 6.1 `inventory/InventoryDrawer.tsx:21` — **no change needed.** The comment says this
      drawer *replaced* a `window.prompt` and a `window.confirm` in Slice 32. That is a
      statement about what was removed then, and it stays true.
- [x] 6.2 Correct D6's brief in `ROADMAP.md`: eight → fifteen, with the seven omitted sites
      named, per the user's decision of 2026-08-05.
- [x] 6.3 Write D6's **Fixed** section — mark the heading ✅ with the date, record the three
      decisions the brief asked to be settled (per-site state, sibling-last mounting, one
      commit per surface), and drop D6's row from the **What remains** index.
- [ ] 6.4 **Report to the user, do not record:** the two `window.alert` calls in
      `LightingTab.tsx` are the last browser-native modals left in the application. Give the
      reproduction and what a fix would cover, and **stop and ask** before writing anything
      into `ROADMAP.md` — `CLAUDE.md` forbids adding a defect unasked.
- [ ] 6.5 `openspec validate d6-confirm-dialogs --strict`, then `/opsx:archive`.
