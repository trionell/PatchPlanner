.PHONY: build sync-glyphs

build:
	cd frontend && npm run build
	rm -rf backend/cmd/dist
	cp -r frontend/dist backend/cmd/dist
	cd backend && go build -o patchplanner ./cmd

# The stage plot's glyphs are one description with two renderers — the canvas
# and the PDF. The frontend copy is canonical, because that is where a glyph is
# authored and looked at. A Go test fails while the two differ, so this is how
# the mirror is brought back into line after editing a shape.
sync-glyphs:
	cp frontend/src/lib/stagePlotGlyphs.json backend/internal/service/plotglyph/glyphs.json
