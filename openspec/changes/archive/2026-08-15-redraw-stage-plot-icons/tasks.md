## 1. Harness

- [x] 1.1 `scripts/render_glyphs.py` — read `stagePlotGlyphs.json`, emit the SVG the canvas builds (same marks, same box, `preserveAspectRatio="none"`, non-scaling stroke), rasterise into a labelled contact sheet
- [x] 1.2 `--plan` mode: elements at ~0.7 px/cm, the scale a whole stage sits at, magnified without smoothing so the real pixels can be counted
- [x] 1.3 `--blind` mode: no labels, answer key to stdout — a reviewer who can read "saxophone" under a cell is not testing whether the drawing says it
- [x] 1.4 `--measure`: ink extent against coordinate box, read off the raster, so under-fill and overflow are found by measuring rather than by looking
- [x] 1.5 Render the original set as the baseline every later sheet is shown against

## 2. Prove the fill convention before drawing to it

- [x] 2.1 A throwaway glyph with a reverse-wound inner subpath, rendered through the harness — the hole appears
- [x] 2.2 The same glyph through the Go document renderer — the hole appears there too, so screen and paper agree with no renderer change
- [x] 2.3 `winding_test.go`: each subpath must be wound against its immediate container, which is the rule at any nesting depth. It caught three inverted holes during the drawing, which is why it was written first

## 3. Three rounds of drawing from description

- [x] 3.1 All seventeen icons redrawn as filled bodies with detail cut out of them
- [x] 3.2 Blind identification by a subagent that had not seen the work; every cell it could not name was redrawn
- [x] 3.3 Second pass from that review — the loudspeaker's plan, the rack's side, the truss cross-section, the fixture, the person's plan
- [x] 3.4 Third pass from the user's own review of the contact sheet
- [x] 3.5 **Outcome: not good enough.** "Barely any improvement. Just give me the svg files and I will fix them manually." The right call, and the reason for section 4

## 4. Hand the pencil over

- [x] 4.1 `scripts/export_glyphs.py` — one SVG per icon per view, `viewBox` = the element's real footprint, drawing rules in a header comment
- [x] 4.2 `scripts/import_glyphs.py` — a drawing program's output into the mark vocabulary: relative commands, transforms, quadratics, rounded rects, ellipses, even-odd fills
- [x] 4.3 Rebuild winding by nesting depth, so nonzero agrees with even-odd and the author never thinks about direction
- [x] 4.4 Skip hidden shapes — a drawing program hides an old version rather than deleting it, and importing one drew the previous person on top of the new one
- [x] 4.5 Turn background-colour paint into geometry: render the file as the drawing program shows it and trace the ink back out (marching squares; no geometry library needed)
- [x] 4.6 Verify every glyph against the SVG it came from, with a measure that discounts a pixel of edge — two identical drawings disagree along every contour by about that much
- [x] 4.7 Reconcile the views on the axes they share before fitting them, least-squares in log space; exempt the icons whose views are one drawing by design
- [x] 4.8 Refuse an artboard that disagrees with the icon's declared footprint

## 5. What the drawings then asked for

- [x] 5.1 Stage monitor: the side view aimed the baffle at the audience while its plan aimed upstage — mirrored in the SVG, so the source got fixed
- [x] 5.2 Grand piano: 250 cm deep against a plan drawing 165 cm deep. Depth set to 170, and the side profile squeezed along that axis rather than scaled whole
- [x] 5.3 Person: plan enlarged, front figure's arms spread to match it, footprint depth 40 → 31 so the box stops being a shape a person is not

## 6. Land it

- [x] 6.1 `make sync-glyphs`, so the Go mirror matches
- [x] 6.2 Gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`
- [x] 6.3 Gates: `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`
- [x] 6.4 A real stage plot exported to PDF from a copy of the database, and looked at — the icons are drawn twice and only one renderer had been reviewed by eye
- [x] 6.5 Two older tests rewritten: both pinned a drawing rather than a renderer property, and failed the moment an icon changed
- [x] 6.6 D7 recorded — resizing an element writes two dimensions and leaves the third, which is what the reported distortion actually was. Not an icon fault; its own branch
- [x] 6.7 Contact sheet published and approved
- [ ] 6.8 Merge to main — the user's decision, not mine
