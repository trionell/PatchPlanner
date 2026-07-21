# Quickstart: Verifying the mobile-friendly redesign locally

## 1. Run the app

```bash
cd backend && go run ./cmd/main.go &
cd frontend && npm run dev
```

## 2. Switch to a phone-width viewport

In Chrome/Firefox DevTools, open device toolbar (`Cmd+Shift+M` / `Ctrl+Shift+M`) and pick a phone preset (e.g. iPhone 12, 390px) — anything under the 768px `md` breakpoint from `research.md` R1. Resize back above 768px at any point to confirm the desktop layout is pixel-identical to `main` (SC-004) — this is the most important manual check in this feature, since nothing here should regress desktop.

## 3. Walk the capability matrix

Sign in, open an event with existing audio channels and lighting fixtures, and work through `contracts/mobile-ui-contract.md`'s table top to bottom:

- **Overview / Settings**: edit a field, confirm it saves (compare against desktop after reloading at full width).
- **Audio Inputs/Outputs**: search for a channel, open it, change its color and stagebox input, save, confirm the change shows up in the desktop patch graph.
- **Lighting Rig**: open a fixture, change its DMX address, save, confirm it shows in the desktop table. Add a fixture from mobile.
- **Stage Plots / Signal Flow**: pinch-zoom and pan; confirm no element can be moved, resized, or deleted from mobile.
- **Equipment / Rental Order**: confirm both render as dense, read-only lists with no add/edit affordance.

## 4. Role check

Switch to (or invite a test account as) a `viewer`-role member of the event and repeat step 3 — every section listed as "editable" above must render read-only for that user, matching desktop's existing viewer restriction (FR-015).

## 5. Automated checks

```bash
cd frontend && npm run typecheck && npm run lint && npm test
cd backend && go vet ./... && go test ./...
```

No backend changes are expected in this feature, so `go test ./...` should be a no-op pass — a failure there signals scope creep, not a real regression to fix here.
