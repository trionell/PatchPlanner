#!/usr/bin/env python3
"""Write each stage plot glyph out as its own SVG file, for editing by hand.

  python3 scripts/export_glyphs.py out_dir/

One file per icon per view, named <icon>-<view>.svg. Each view has its own
coordinate box in real centimetres — a person's plan is 60x40, its front is
60x180 — so three views cannot share one canvas. One file per view makes the
viewBox the footprint: the artboard edge is the element's real size.

The companion is import_glyphs.py, which reads the edited files back into
frontend/src/lib/stagePlotGlyphs.json.
"""
import json
import os
import sys
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHS = os.path.join(ROOT, "frontend/src/lib/stagePlotGlyphs.json")
VIEWS = ("top", "front", "side")

HEADER = """<!--
  {label} — {view} view
  Box is {bw:g} x {bh:g} cm: {axes}. The artboard IS the element's footprint.

  Drawing rules
  - One colour. Everything is repainted in the layer's tint on import, so draw
    in any colour you like; only fill-vs-stroke is read.
  - A filled shape is a filled mark. A shape with fill:none and a stroke stays
    a stroked line — use that only where the object really is a line (a stand's
    shaft, a cymbal stand, an endpin). Stroke width here is preview only; the
    app always draws strokes at a constant width on screen.
  - Detail inside a filled body must be a HOLE, not a lighter shape on top:
    same colour on same colour is invisible. Cut it with a subpath, or with
    fill-rule="evenodd" — winding is fixed automatically on import.
  - Fill the artboard. Space left around the drawing draws the element smaller
    than the size the user gave it.

  Anything is fine as geometry: relative commands, quadratic curves, transforms,
  groups, rect/circle/ellipse/line/polygon/polyline. Not fine: text (outline it
  first), images, gradients, clip paths, masks, filters.
-->
"""

AXES = {
    "top": "width across, depth down the page (front of the object is downward)",
    "front": "width across, height down the page (top of the object is upward)",
    "side": "depth across (front of the object is rightward), height down the page",
}


def box_for(icon, view):
    d = icon["defaults"]
    if view == "top":
        return d["width_cm"], d["depth_cm"]
    if view == "front":
        return d["width_cm"], d["height_cm"]
    return d["depth_cm"], d["height_cm"]


def mark_svg(mark, stroke_w):
    if mark.get("fill"):
        style = 'fill="#111111" stroke="none"'
    else:
        style = (f'fill="none" stroke="#111111" stroke-width="{stroke_w:g}" '
                 'stroke-linecap="round" stroke-linejoin="round"')
    extra = ""
    if mark.get("rotate"):
        extra += ' transform="rotate({})"'.format(" ".join(str(v) for v in mark["rotate"]))
    if mark.get("dash"):
        extra += ' stroke-dasharray="{}"'.format(" ".join(str(v) for v in mark["dash"]))
    kind = mark["kind"]
    if kind == "path":
        return f'  <path {style} d="{escape(mark["d"])}"{extra}/>'
    if kind == "circle":
        return f'  <circle {style} cx="{mark["cx"]}" cy="{mark["cy"]}" r="{mark["r"]}"{extra}/>'
    if kind == "rect":
        rx = f' rx="{mark["rx"]}"' if mark.get("rx") is not None else ""
        return (f'  <rect {style} x="{mark["x"]}" y="{mark["y"]}" '
                f'width="{mark["w"]}" height="{mark["h"]}"{rx}{extra}/>')
    raise SystemExit(f"unknown mark kind {kind!r}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)

    data = json.load(open(GLYPHS))
    written = 0
    for icon in data["icons"]:
        for view in VIEWS:
            marks = icon["glyphs"].get(view)
            if not marks:
                continue
            bw, bh = box_for(icon, view)
            # Stroke width is cosmetic in the file: pick what looks about right
            # when the box is shown at roughly 120 px.
            stroke_w = round(3.5 * max(bw, bh) / 120, 2)
            body = "\n".join(mark_svg(m, stroke_w) for m in marks)
            svg = (HEADER.format(label=icon["label"], view=view, bw=bw, bh=bh,
                                 axes=AXES[view])
                   + f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {bw:g} {bh:g}"\n'
                   f'     width="{bw:g}" height="{bh:g}">\n{body}\n</svg>\n')
            path = os.path.join(out_dir, f'{icon["id"]}-{view}.svg')
            with open(path, "w") as fh:
                fh.write(svg)
            written += 1
    print(f"{written} files in {out_dir}")


if __name__ == "__main__":
    main()
