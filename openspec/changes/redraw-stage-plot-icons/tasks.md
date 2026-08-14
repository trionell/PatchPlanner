## 1. Harness

- [ ] 1.1 `scripts/render_glyphs.py` — read `stagePlotGlyphs.json`, emit the SVG the canvas builds (same marks, same box, `preserveAspectRatio="none"`, non-scaling stroke), rasterise with `rsvg-convert` into a labelled contact sheet
- [ ] 1.2 Add a true-plan-scale mode to the harness (elements drawn at ~0.7 px/cm, the scale a whole stage sits at), so a hole that closes at size is visible before it is printed
- [ ] 1.3 Render the current set as a baseline for the before/after review

## 2. Prove the fill convention before drawing to it

- [ ] 2.1 Draw one throwaway glyph with a reverse-wound inner subpath, render it through the harness, and confirm the hole appears
- [ ] 2.2 Render the same glyph through the Go document renderer and confirm the hole appears there too — the convention is worthless if the two disagree
- [ ] 2.3 Add a Go test in `plotglyph` asserting a hole stays a hole, so a later edit that reverses the winding fails instead of quietly filling in

## 3. Redraw — resources

- [ ] 3.1 `person` — top: shoulder mass with the head a filled disc inside a ring gap. Front and side: the accepted pose, filled
- [ ] 3.2 `mic` — top: capsule disc with three tapered legs. Front and side share one drawing (both boxes are 30×160): tripod feet, stroked shaft, capsule angled at the top
- [ ] 3.3 `speaker` — top: trapezoid narrowing to the back with the driver hole on the front edge. Front: driver hole low, horn slot high. Side: cabinet profile
- [ ] 3.4 `monitor` — side first (the wedge profile is what names it), then front and top
- [ ] 3.5 `rack` — front: ears and unit slots. Side and top: flight case, ball corners, handle slot
- [ ] 3.6 `truss` — top and front: two chords with diagonal bracing. Side: the end-on square, four corner tubes and a cross brace
- [ ] 3.7 `fixture` — lens and yoke in all three views; it is the most-drawn icon in a lighting plot, so it gets checked at 20 px as well

## 4. Redraw — instruments with a real plan

- [ ] 4.1 `drums` — convert the accepted top and front to fill; redraw side (bass drum, tom, cymbal on a stroked stand)
- [ ] 4.2 `piano_grand` — top: the wing with a key-comb hole. Front: slab, legs, raised lid. Side: profile with the lid up
- [ ] 4.3 `piano_upright` — top: cabinet with the keyboard band projecting. Front: cabinet, fallboard, keys, music desk. Side: cabinet with the keyboard shelf jutting forward
- [ ] 4.4 `keyboard` — top: slab with a key comb and a control-panel band behind it. Front: slab on an X-stand. Side: the accepted drawing, filled
- [ ] 4.5 Check 4.2–4.4 against each other in one render: an upright's plan, a grand's plan and a keyboard's plan must not be three rectangles with combs

## 5. Redraw — held instruments

- [ ] 5.1 `guitar_acoustic` — waisted body, soundhole and bridge as holes, slotted headstock; front and side share it; top is the same drawing laid diagonally
- [ ] 5.2 `guitar_electric` — double cutaway, pickguard hole, six-in-line headstock, no soundhole; same view arrangement
- [ ] 5.3 `bass` — offset body with the long horn, one pickup hole, four-in-line headstock, longer neck against the body; same view arrangement
- [ ] 5.4 `cello` — C-bouts, two f-holes, scroll, stroked endpin; same view arrangement
- [ ] 5.5 `saxophone` — the J: flared bell low, body rising, crook and mouthpiece at the top, a few key touches as holes
- [ ] 5.6 `trumpet` — top and front share the horizontal drawing (bell, three pistons, wrap, mouthpiece); side is the bell end-on
- [ ] 5.7 Check 5.1–5.3 against each other in one render: acoustic, electric and bass must differ by more than size

## 6. Review

- [ ] 6.1 Render the full set — fitted and at true plan scale — and read every cell; fix what does not name itself
- [ ] 6.2 Publish the contact sheet as an Artifact, before beside after
- [ ] 6.3 Independent review by a subagent that has not seen the drawing work: it names each icon from the render alone, and the ones it cannot name are redrawn
- [ ] 6.4 **Stop for the user's approval on the artifact.** Revise from their notes and republish to the same URL

## 7. Land it

- [ ] 7.1 `make sync-glyphs`, so the Go mirror matches; the mirror test fails until it does
- [ ] 7.2 Gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`
- [ ] 7.3 Gates: `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`
- [ ] 7.4 Generate a stage plot PDF from a copy of the database in /tmp and look at it — the icons are drawn twice, and only one of the two has been reviewed by eye up to here
- [ ] 7.5 Commit on `redraw-stage-plot-icons`; leave the merge to the user
