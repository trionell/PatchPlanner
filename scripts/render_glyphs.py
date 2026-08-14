#!/usr/bin/env python3
"""Render stage plot glyphs to a PNG contact sheet.

Reads frontend/src/lib/stagePlotGlyphs.json and draws every icon in every
view exactly as the canvas does — same marks, same viewBox, same
non-scaling stroke — so the sheet can be looked at instead of the JSON.

  python3 scripts/render_glyphs.py out.png                   # all icons
  python3 scripts/render_glyphs.py out.png --only mic,cello  # a subset
  python3 scripts/render_glyphs.py out.png --plan            # at plan scale
  python3 scripts/render_glyphs.py out.png --blind           # no labels
  python3 scripts/render_glyphs.py out.png --glyphs old.json # another version

--blind drops the labels and prints the answer key to stdout instead. An icon
is meant to be identified from its drawing, and a reviewer who can read the
word "saxophone" under a cell is no longer testing that.

Two scales, because they ask different questions.

  fitted (default)  Each glyph fitted to a 120 px box. Is this drawing of a
                    cello a cello? Detail is visible; nothing is decided here
                    about whether it survives.

  --plan            Each glyph at its true footprint at 0.7 px/cm, the scale a
                    12 m stage sits at in an 800 px viewport, then magnified
                    with nearest-neighbour so the real pixels can be counted.
                    A hole that closes up closes up here. This is the sheet
                    that matters; the fitted one only says what was intended.
"""
import json
import os
import subprocess
import sys
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHS = os.path.join(ROOT, "frontend/src/lib/stagePlotGlyphs.json")

# One cell is a 120 px icon box drawn at 3x, i.e. what a retina screen
# shows when an element is zoomed to about 120 px across. STROKE is the
# canvas's 3.5 px non-scaling stroke at the same 3x.
UPSCALE = 3
CELL = 120 * UPSCALE
STROKE = 3.5 * UPSCALE
LABEL_H = 26 * UPSCALE
COLS_PER_ICON = 3
VIEWS = ("top", "front", "side")

# pxPerCm is the zoom, so a 12 m stage across an 800 px viewport is this.
PLAN_PX_PER_CM = 0.7


def mark_svg(mark, stroke_w):
    style = (
        f'fill="currentColor" stroke="none"'
        if mark.get("fill")
        else f'fill="none" stroke="currentColor" stroke-width="{stroke_w}"'
        ' stroke-linecap="round" stroke-linejoin="round"'
    )
    extra = ""
    if mark.get("rotate"):
        extra += ' transform="rotate({})"'.format(" ".join(str(v) for v in mark["rotate"]))
    if mark.get("dash"):
        extra += ' stroke-dasharray="{}"'.format(" ".join(str(v) for v in mark["dash"]))
    kind = mark["kind"]
    if kind == "path":
        return f'<path {style} d="{escape(mark["d"])}"{extra}/>'
    if kind == "circle":
        return f'<circle {style} cx="{mark["cx"]}" cy="{mark["cy"]}" r="{mark["r"]}"{extra}/>'
    if kind == "rect":
        rx = f' rx="{mark["rx"]}"' if mark.get("rx") is not None else ""
        return (
            f'<rect {style} x="{mark["x"]}" y="{mark["y"]}" '
            f'width="{mark["w"]}" height="{mark["h"]}"{rx}{extra}/>'
        )
    raise SystemExit(f"unknown mark kind {kind!r}")


def box_for(icon, view):
    d = icon["defaults"]
    if view == "top":
        return d["width_cm"], d["depth_cm"]
    if view == "front":
        return d["width_cm"], d["height_cm"]
    return d["depth_cm"], d["height_cm"]


def cell_svg(icon, view, x0, y0, cell, upscale, stroke, label_h, px_per_cm=None):
    """One icon-view drawn into a cell, with a label under it.

    Without px_per_cm the glyph is fitted uniformly to the cell. With it the
    glyph is drawn at its true footprint at that scale — what the canvas
    actually shows — and left small in the middle of the cell."""
    marks = icon["glyphs"].get(view)
    label = f'{icon["id"]} · {view}'
    out = [
        f'<rect x="{x0}" y="{y0}" width="{cell}" height="{cell + label_h}" '
        f'fill="none" stroke="#3f3f46" stroke-width="{upscale}"/>'
    ]
    if marks:
        bw, bh = box_for(icon, view)
        if px_per_cm is None:
            pad = cell * 0.10
            s = min((cell - 2 * pad) / bw, (cell - 2 * pad) / bh)
        else:
            s = px_per_cm
        w, h = bw * s, bh * s
        ox, oy = x0 + (cell - w) / 2, y0 + (cell - h) / 2
        # Stroke is constant in screen px: undo the fit scale in glyph units.
        body = "".join(mark_svg(m, stroke / s) for m in marks)
        out.append(
            f'<svg x="{ox}" y="{oy}" width="{w}" height="{h}" '
            f'viewBox="0 0 {bw} {bh}" preserveAspectRatio="none" overflow="visible" '
            f'color="#e4e4e7">{body}</svg>'
        )
        # The footprint the glyph is drawn into, so overflow is visible.
        out.append(
            f'<rect x="{ox}" y="{oy}" width="{w}" height="{h}" fill="none" '
            f'stroke="#52525b" stroke-width="{upscale}" stroke-dasharray="{4*upscale} {4*upscale}"/>'
        )
    else:
        out.append(
            f'<text x="{x0 + cell/2}" y="{y0 + cell/2}" fill="#71717a" '
            f'font-size="{14*upscale}" text-anchor="middle" font-family="sans-serif">no glyph</text>'
        )
    if label_h:
        out.append(
            f'<text x="{x0 + cell/2}" y="{y0 + cell + label_h*0.65}" fill="#a1a1aa" '
            f'font-size="{13*upscale}" text-anchor="middle" font-family="sans-serif">{escape(label)}</text>'
        )
    return "".join(out)


def sheet(icons, cell, upscale, stroke, label_h, px_per_cm=None):
    width = COLS_PER_ICON * cell
    height = len(icons) * (cell + label_h)
    parts = [f'<rect width="{width}" height="{height}" fill="#18181b"/>']
    for r, icon in enumerate(icons):
        for c, view in enumerate(VIEWS):
            parts.append(
                cell_svg(icon, view, c * cell, r * (cell + label_h),
                         cell, upscale, stroke, label_h, px_per_cm)
            )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{"".join(parts)}</svg>'
    ), width, height


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        raise SystemExit(__doc__)
    out_png = args.pop(0)
    plan = "--plan" in args
    if plan:
        args.remove("--plan")
    blind = "--blind" in args
    if blind:
        args.remove("--blind")
    wanted = None
    if "--only" in args:
        wanted = set(args[args.index("--only") + 1].split(","))
    # --glyphs renders a different copy of the file, which is how a redraw is
    # put beside what it replaced.
    source = GLYPHS
    if "--glyphs" in args:
        source = args[args.index("--glyphs") + 1]

    data = json.load(open(source))
    icons = [i for i in data["icons"] if wanted is None or i["id"] in wanted]
    if not icons:
        raise SystemExit("no icons matched")

    if plan:
        # Drawn at the real thing's real size: 1x, 0.7 px/cm, a 3.5 px stroke.
        # Nothing is upscaled before rasterising — the magnification afterwards
        # is nearest-neighbour, so what is counted is the pixels the canvas has.
        svg, width, height = sheet(icons, cell=150, upscale=1, stroke=3.5,
                                   label_h=0 if blind else 16, px_per_cm=PLAN_PX_PER_CM)
    else:
        svg, width, height = sheet(icons, cell=CELL, upscale=UPSCALE,
                                   stroke=STROKE, label_h=0 if blind else LABEL_H)

    svg_path = out_png.rsplit(".", 1)[0] + ".svg"
    with open(svg_path, "w") as fh:
        fh.write(svg)
    subprocess.run(["rsvg-convert", "-o", out_png, svg_path], check=True)
    if plan:
        subprocess.run(["magick", out_png, "-filter", "point", "-resize", "300%",
                        out_png], check=True)
        width, height = width * 3, height * 3
    print(f"{out_png}  ({width}x{height}, {len(icons)} icons"
          f"{', plan scale' if plan else ''})")
    if blind:
        print("answer key, rows top to bottom: " + ", ".join(i["id"] for i in icons))


if __name__ == "__main__":
    main()
