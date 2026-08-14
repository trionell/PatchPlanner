#!/usr/bin/env python3
"""Render stage plot glyphs to a PNG contact sheet.

Reads frontend/src/lib/stagePlotGlyphs.json and draws every icon in every
view exactly as the canvas does — same marks, same viewBox, same
non-scaling stroke — so the sheet can be looked at instead of the JSON.

  python3 scripts/render_glyphs.py out.png            # all icons
  python3 scripts/render_glyphs.py out.png mic,cello  # a subset
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


def cell_svg(icon, view, x0, y0):
    """One icon-view, fitted uniformly into a CELL box (undistorted, as a
    default-sized element renders), with a label under it."""
    marks = icon["glyphs"].get(view)
    label = f'{icon["id"]} · {view}'
    out = [
        f'<rect x="{x0}" y="{y0}" width="{CELL}" height="{CELL + LABEL_H}" '
        f'fill="none" stroke="#3f3f46" stroke-width="{UPSCALE}"/>'
    ]
    if marks:
        bw, bh = box_for(icon, view)
        pad = CELL * 0.10
        s = min((CELL - 2 * pad) / bw, (CELL - 2 * pad) / bh)
        w, h = bw * s, bh * s
        ox, oy = x0 + (CELL - w) / 2, y0 + (CELL - h) / 2
        # Stroke is constant in screen px: undo the fit scale in glyph units.
        body = "".join(mark_svg(m, STROKE / s) for m in marks)
        out.append(
            f'<svg x="{ox}" y="{oy}" width="{w}" height="{h}" '
            f'viewBox="0 0 {bw} {bh}" preserveAspectRatio="none" overflow="visible" '
            f'color="#e4e4e7">{body}</svg>'
        )
        # The footprint the glyph is drawn into, so overflow is visible.
        out.append(
            f'<rect x="{ox}" y="{oy}" width="{w}" height="{h}" fill="none" '
            f'stroke="#52525b" stroke-width="{UPSCALE}" stroke-dasharray="{4*UPSCALE} {4*UPSCALE}"/>'
        )
    else:
        out.append(
            f'<text x="{x0 + CELL/2}" y="{y0 + CELL/2}" fill="#71717a" '
            f'font-size="{14*UPSCALE}" text-anchor="middle" font-family="sans-serif">no glyph</text>'
        )
    out.append(
        f'<text x="{x0 + CELL/2}" y="{y0 + CELL + LABEL_H*0.65}" fill="#a1a1aa" '
        f'font-size="{13*UPSCALE}" text-anchor="middle" font-family="sans-serif">{escape(label)}</text>'
    )
    return "".join(out)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    out_png = sys.argv[1]
    wanted = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None

    data = json.load(open(GLYPHS))
    icons = [i for i in data["icons"] if wanted is None or i["id"] in wanted]
    if not icons:
        raise SystemExit("no icons matched")

    rows = len(icons)
    width = COLS_PER_ICON * CELL
    height = rows * (CELL + LABEL_H)
    parts = [f'<rect width="{width}" height="{height}" fill="#18181b"/>']
    for r, icon in enumerate(icons):
        for c, view in enumerate(VIEWS):
            parts.append(cell_svg(icon, view, c * CELL, r * (CELL + LABEL_H)))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{"".join(parts)}</svg>'
    )
    svg_path = out_png.rsplit(".", 1)[0] + ".svg"
    with open(svg_path, "w") as fh:
        fh.write(svg)
    subprocess.run(["rsvg-convert", "-o", out_png, svg_path], check=True)
    print(f"{out_png}  ({width}x{height}, {rows} icons)")


if __name__ == "__main__":
    main()
