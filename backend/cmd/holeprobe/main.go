package main

import (
	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/service/plotglyph"
)

func main() {
	pdf := fpdf.New("P", "mm", "A5", "")
	pdf.AddPage()
	pdf.SetFillColor(0, 0, 0)
	pdf.SetDrawColor(0, 0, 0)
	// Left: inner subpath wound opposite the body — expect a hole.
	// Right: inner subpath wound the same way — expect solid.
	marks := []plotglyph.Mark{
		{Kind: "path", Fill: true, D: "M10 10 L90 10 L90 90 L10 90 Z M30 30 L30 70 L70 70 L70 30 Z"},
	}
	same := []plotglyph.Mark{
		{Kind: "path", Fill: true, D: "M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z"},
	}
	t := plotglyph.Transform{ScaleX: 0.6, ScaleY: 0.6, OriginX: 10, OriginY: 10}
	if err := plotglyph.Draw(pdf, marks, t, 0.3); err != nil {
		panic(err)
	}
	t.OriginX = 80
	if err := plotglyph.Draw(pdf, same, t, 0.3); err != nil {
		panic(err)
	}
	if err := pdf.OutputFileAndClose("/tmp/holeprobe.pdf"); err != nil {
		panic(err)
	}
}
