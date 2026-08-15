#!/usr/bin/env python3
"""Read hand-edited SVG files back into the stage plot glyph file.

  python3 scripts/import_glyphs.py icons-svg/            # import and verify
  python3 scripts/import_glyphs.py icons-svg/ --dry-run  # verify only

The files come out of a drawing program, so they arrive with relative path
commands, transforms on groups, quadratic curves, rounded rects, ellipses and
even-odd fills. The glyph file holds none of that: absolute M/L/C/Z paths in
one flat coordinate space, filled by the nonzero winding rule. Everything
between those two is this script's job.

Two things it does NOT do silently:

  Verify.  Every imported glyph is rasterised beside the SVG it came from and
  compared pixel for pixel. A drawing that does not survive the conversion is
  reported, not shipped.

  Fit.  A drawing that overflows its artboard, or sits well inside it, or sits
  off-centre, is scaled uniformly and centred so the ink matches the element's
  real footprint. Uniform, so the shape is untouched — and reported per file,
  because it is the one change here that alters what gets drawn.
"""
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHS = os.path.join(ROOT, "frontend/src/lib/stagePlotGlyphs.json")
NS = "{http://www.w3.org/2000/svg}"
VIEWS = ("top", "front", "side")
NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")

# How far the ink may sit from filling its artboard before the fit steps in,
# and how far off centre before it is recentred. Below these the drawing is
# left exactly as it was drawn.
FILL_FLOOR = 0.90
OFFSET_TOLERANCE = 0.02


# ---------------------------------------------------------------- transforms

def mat_mul(a, b):
    """Compose two [a b c d e f] affine matrices: apply b, then a."""
    return [a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
            a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
            a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5]]


def parse_transform(text):
    m = [1, 0, 0, 1, 0, 0]
    if not text:
        return m
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", text):
        v = [float(x) for x in NUM.findall(args)]
        if name == "matrix":
            t = v[:6]
        elif name == "translate":
            t = [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
        elif name == "scale":
            sx = v[0]
            sy = v[1] if len(v) > 1 else sx
            t = [sx, 0, 0, sy, 0, 0]
        elif name == "rotate":
            r = math.radians(v[0])
            c, s = math.cos(r), math.sin(r)
            t = [c, s, -s, c, 0, 0]
            if len(v) > 2:
                t = mat_mul([1, 0, 0, 1, v[1], v[2]],
                            mat_mul(t, [1, 0, 0, 1, -v[1], -v[2]]))
        elif name == "skewX":
            t = [1, 0, math.tan(math.radians(v[0])), 1, 0, 0]
        elif name == "skewY":
            t = [1, math.tan(math.radians(v[0])), 0, 1, 0, 0]
        else:
            raise SystemExit(f"unsupported transform {name!r}")
        m = mat_mul(m, t)
    return m


def apply(m, x, y):
    return (m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5])


# --------------------------------------------------------------------- paths
# A subpath is (start, [segments], closed); a segment is ('L', p) or
# ('C', c1, c2, p). Everything is reduced to these two before anything else
# touches it, so there is one shape of data to transform, wind and emit.

KAPPA = 0.5522847498307936


def arc_to_cubics(p0, p1, rx, ry, phi_deg, large, sweep):
    """SVG endpoint arc to cubics, per the specification's F.6 notes."""
    if rx == 0 or ry == 0 or p0 == p1:
        return [("L", p1)]
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(phi_deg)
    cos_p, sin_p = math.cos(phi), math.sin(phi)
    dx2, dy2 = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1p = cos_p * dx2 + sin_p * dy2
    y1p = -sin_p * dx2 + cos_p * dy2
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        k = math.sqrt(lam)
        rx, ry = rx * k, ry * k
    num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p
    den = rx*rx*y1p*y1p + ry*ry*x1p*x1p
    f = math.sqrt(max(num / den, 0)) if den else 0.0
    if large == sweep:
        f = -f
    cxp, cyp = f * rx * y1p / ry, -f * ry * x1p / rx
    cx = cos_p * cxp - sin_p * cyp + (p0[0] + p1[0]) / 2
    cy = sin_p * cxp + cos_p * cyp + (p0[1] + p1[1]) / 2

    def angle(ux, uy, vx, vy):
        d = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        if n == 0:
            return 0.0
        a = math.acos(max(-1.0, min(1.0, d / n)))
        return -a if ux * vy - uy * vx < 0 else a

    t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry,
               (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    steps = max(1, int(math.ceil(abs(dt) / (math.pi / 2))))
    step = dt / steps
    alpha = 4.0 / 3.0 * math.tan(step / 4)

    def at(theta):
        ct, st = math.cos(theta), math.sin(theta)
        p = (cx + rx*ct*cos_p - ry*st*sin_p, cy + rx*ct*sin_p + ry*st*cos_p)
        d = (-rx*st*cos_p - ry*ct*sin_p, -rx*st*sin_p + ry*ct*cos_p)
        return p, d

    segs = []
    theta = t1
    cur, curd = at(theta)
    for _ in range(steps):
        nxt = theta + step
        end, endd = at(nxt)
        segs.append(("C",
                     (cur[0] + alpha*curd[0], cur[1] + alpha*curd[1]),
                     (end[0] - alpha*endd[0], end[1] - alpha*endd[1]), end))
        theta, cur, curd = nxt, end, endd
    return segs


def parse_path(d):
    """Any SVG path data into subpaths of lines and cubics."""
    tokens = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?", d)
    subs, cur, start = [], None, (0.0, 0.0)
    pos = (0.0, 0.0)
    last_c2 = last_q = None
    i, cmd = 0, None
    while i < len(tokens):
        if re.match(r"[A-Za-z]", tokens[i]):
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                if cur:
                    cur[2] = True
                    subs.append(cur)
                    cur = None
                pos = start
                continue
        elif cmd is None:
            raise SystemExit(f"path data starts with a number: {d[:40]!r}")
        elif cmd in "Mm":
            cmd = "L" if cmd == "M" else "l"

        def take(n):
            nonlocal i
            v = [float(x) for x in tokens[i:i + n]]
            i += n
            return v

        rel = cmd.islower()
        up = cmd.upper()
        if up == "M":
            x, y = take(2)
            pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
            if cur:
                subs.append(cur)
            cur = [pos, [], False]
            start = pos
            last_c2 = last_q = None
            continue
        if cur is None:
            cur = [pos, [], False]
            start = pos
        if up == "L":
            x, y = take(2)
            pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
            cur[1].append(("L", pos))
            last_c2 = last_q = None
        elif up == "H":
            x, = take(1)
            pos = (pos[0] + x, pos[1]) if rel else (x, pos[1])
            cur[1].append(("L", pos))
            last_c2 = last_q = None
        elif up == "V":
            y, = take(1)
            pos = (pos[0], pos[1] + y) if rel else (pos[0], y)
            cur[1].append(("L", pos))
            last_c2 = last_q = None
        elif up == "C":
            v = take(6)
            pts = [(pos[0] + v[j] if rel else v[j], pos[1] + v[j+1] if rel else v[j+1])
                   for j in (0, 2, 4)]
            cur[1].append(("C", pts[0], pts[1], pts[2]))
            last_c2, pos, last_q = pts[1], pts[2], None
        elif up == "S":
            v = take(4)
            pts = [(pos[0] + v[j] if rel else v[j], pos[1] + v[j+1] if rel else v[j+1])
                   for j in (0, 2)]
            c1 = (2*pos[0] - last_c2[0], 2*pos[1] - last_c2[1]) if last_c2 else pos
            cur[1].append(("C", c1, pts[0], pts[1]))
            last_c2, pos, last_q = pts[0], pts[1], None
        elif up in "QT":
            if up == "Q":
                v = take(4)
                q = (pos[0] + v[0] if rel else v[0], pos[1] + v[1] if rel else v[1])
                end = (pos[0] + v[2] if rel else v[2], pos[1] + v[3] if rel else v[3])
            else:
                v = take(2)
                q = (2*pos[0] - last_q[0], 2*pos[1] - last_q[1]) if last_q else pos
                end = (pos[0] + v[0] if rel else v[0], pos[1] + v[1] if rel else v[1])
            c1 = (pos[0] + 2/3*(q[0]-pos[0]), pos[1] + 2/3*(q[1]-pos[1]))
            c2 = (end[0] + 2/3*(q[0]-end[0]), end[1] + 2/3*(q[1]-end[1]))
            cur[1].append(("C", c1, c2, end))
            last_q, pos, last_c2 = q, end, None
        elif up == "A":
            v = take(7)
            end = (pos[0] + v[5] if rel else v[5], pos[1] + v[6] if rel else v[6])
            cur[1].extend(arc_to_cubics(pos, end, v[0], v[1], v[2], v[3] != 0, v[4] != 0))
            pos, last_c2, last_q = end, None, None
        else:
            raise SystemExit(f"unsupported path command {cmd!r}")
    if cur:
        subs.append(cur)
    return [s for s in subs if s[1]]


def ellipse_subpath(cx, cy, rx, ry):
    ox, oy = rx * KAPPA, ry * KAPPA
    return [(cx + rx, cy), [
        ("C", (cx+rx, cy+oy), (cx+ox, cy+ry), (cx, cy+ry)),
        ("C", (cx-ox, cy+ry), (cx-rx, cy+oy), (cx-rx, cy)),
        ("C", (cx-rx, cy-oy), (cx-ox, cy-ry), (cx, cy-ry)),
        ("C", (cx+ox, cy-ry), (cx+rx, cy-oy), (cx+rx, cy)),
    ], True]


def rounded_rect_subpath(x, y, w, h, rx, ry):
    if rx <= 0 and ry <= 0:
        return [(x, y), [("L", (x+w, y)), ("L", (x+w, y+h)), ("L", (x, y+h))], True]
    rx = min(rx or ry, w / 2)
    ry = min(ry or rx, h / 2)
    ox, oy = rx * KAPPA, ry * KAPPA
    return [(x + rx, y), [
        ("L", (x+w-rx, y)),
        ("C", (x+w-rx+ox, y), (x+w, y+ry-oy), (x+w, y+ry)),
        ("L", (x+w, y+h-ry)),
        ("C", (x+w, y+h-ry+oy), (x+w-rx+ox, y+h), (x+w-rx, y+h)),
        ("L", (x+rx, y+h)),
        ("C", (x+rx-ox, y+h), (x, y+h-ry+oy), (x, y+h-ry)),
        ("L", (x, y+ry)),
        ("C", (x, y+ry-oy), (x+rx-ox, y), (x+rx, y)),
    ], True]


def shape_subpaths(el):
    tag = el.tag.replace(NS, "")
    g = lambda k, d=0.0: float(el.get(k, d) or d)
    if tag == "path":
        return parse_path(el.get("d") or "")
    if tag == "rect":
        return [rounded_rect_subpath(g("x"), g("y"), g("width"), g("height"),
                                     g("rx"), g("ry"))]
    if tag == "circle":
        return [ellipse_subpath(g("cx"), g("cy"), g("r"), g("r"))]
    if tag == "ellipse":
        return [ellipse_subpath(g("cx"), g("cy"), g("rx"), g("ry"))]
    if tag == "line":
        return [[(g("x1"), g("y1")), [("L", (g("x2"), g("y2")))], False]]
    if tag in ("polygon", "polyline"):
        v = [float(x) for x in NUM.findall(el.get("points") or "")]
        pts = list(zip(v[0::2], v[1::2]))
        if len(pts) < 2:
            return []
        return [[pts[0], [("L", p) for p in pts[1:]], tag == "polygon"]]
    return []


def transform_subpaths(subs, m):
    out = []
    for start, segs, closed in subs:
        ns = []
        for seg in segs:
            if seg[0] == "L":
                ns.append(("L", apply(m, *seg[1])))
            else:
                ns.append(("C", apply(m, *seg[1]), apply(m, *seg[2]), apply(m, *seg[3])))
        out.append([apply(m, *start), ns, closed])
    return out


# -------------------------------------------------------------- winding

def sample(sub, per_curve=8):
    pts = [sub[0]]
    cur = sub[0]
    for seg in sub[1]:
        if seg[0] == "L":
            pts.append(seg[1])
            cur = seg[1]
        else:
            p0, c1, c2, p3 = cur, seg[1], seg[2], seg[3]
            for k in range(1, per_curve + 1):
                t = k / per_curve
                u = 1 - t
                pts.append((u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0],
                            u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1]))
            cur = p3
    return pts


def signed_area(pts):
    return sum(pts[i][0]*pts[(i+1) % len(pts)][1] - pts[(i+1) % len(pts)][0]*pts[i][1]
               for i in range(len(pts))) / 2


def point_in(p, poly):
    inside = False
    for i in range(len(poly)):
        a, b = poly[i], poly[(i+1) % len(poly)]
        if (a[1] > p[1]) != (b[1] > p[1]):
            x = a[0] + (p[1]-a[1]) / (b[1]-a[1]) * (b[0]-a[0])
            if p[0] < x:
                inside = not inside
    return inside


def reverse_subpath(sub):
    """Same outline, drawn the other way round."""
    start, segs, closed = sub
    pts = [start]
    kinds = []
    for seg in segs:
        if seg[0] == "L":
            kinds.append(("L", None, None))
            pts.append(seg[1])
        else:
            kinds.append(("C", seg[1], seg[2]))
            pts.append(seg[3])
    new_start = pts[-1]
    new_segs = []
    for i in range(len(kinds) - 1, -1, -1):
        k = kinds[i]
        target = pts[i]
        if k[0] == "L":
            new_segs.append(("L", target))
        else:
            new_segs.append(("C", k[2], k[1], target))
    return [new_start, new_segs, closed]


def normalise_winding(subs):
    """Wind each subpath by how deeply it is nested.

    The glyph file is filled by the nonzero rule in both renderers. Alternating
    direction with nesting depth makes nonzero agree with even-odd, which is
    what a drawing program emits — so a hole stays a hole and an island inside
    a hole stays solid, whichever rule the source used.
    """
    polys = [sample(s) for s in subs]
    areas = [signed_area(p) for p in polys]
    out = []
    for i, sub in enumerate(subs):
        depth = 0
        for j, other in enumerate(polys):
            if i == j or abs(areas[j]) <= abs(areas[i]):
                continue
            if point_in(polys[i][0], other):
                depth += 1
        want_positive = (depth % 2 == 0)
        if (areas[i] > 0) != want_positive:
            sub = reverse_subpath(sub)
        out.append(sub)
    return out


# ------------------------------------------------------------------ emitting

# Two decimals on a box measured in centimetres is a hundredth of a
# centimetre: far below a pixel at any zoom the canvas allows, and it takes a
# fifth off the file. The verification pass renders what is emitted, so the
# precision is checked rather than assumed.
def fmt(v):
    return f"{round(v, 2):g}"


def to_d(subs):
    parts = []
    for start, segs, closed in subs:
        parts.append(f"M{fmt(start[0])} {fmt(start[1])}")
        for seg in segs:
            if seg[0] == "L":
                parts.append(f"L{fmt(seg[1][0])} {fmt(seg[1][1])}")
            else:
                parts.append("C{} {} {} {} {} {}".format(
                    fmt(seg[1][0]), fmt(seg[1][1]), fmt(seg[2][0]), fmt(seg[2][1]),
                    fmt(seg[3][0]), fmt(seg[3][1])))
        if closed:
            parts.append("Z")
    return " ".join(parts)


# -------------------------------------------------------------------- reading

def style_of(el, inherited):
    s = dict(inherited)
    style = el.get("style") or ""
    for k in ("fill", "stroke", "stroke-width", "fill-rule"):
        v = el.get(k)
        m = re.search(rf"(?:^|;)\s*{k}\s*:\s*([^;]+)", style)
        if m:
            v = m.group(1).strip()
        if v is not None:
            s[k] = v
    return s


def read_svg(path):
    """Every visible shape in the file, flattened, as (subpaths, filled, width)."""
    tree = ET.parse(path)
    root = tree.getroot()
    vb = [float(x) for x in NUM.findall(root.get("viewBox") or "")]
    if len(vb) != 4:
        raise SystemExit(f"{path}: no viewBox")
    out = []

    def walk(el, ctm, inherited):
        tag = el.tag.replace(NS, "")
        if tag in ("defs", "namedview", "metadata", "title", "desc"):
            return
        # A drawing program hides an old shape rather than deleting it, and a
        # hidden shape is not part of the drawing.
        style = el.get("style") or ""
        if (el.get("display") == "none" or "display:none" in style
                or el.get("visibility") == "hidden" or "visibility:hidden" in style
                or re.search(r"(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)", style)):
            return
        ctm = mat_mul(ctm, parse_transform(el.get("transform")))
        st = style_of(el, inherited)
        if tag in ("path", "rect", "circle", "ellipse", "line", "polygon", "polyline"):
            subs = shape_subpaths(el)
            if not subs:
                return
            subs = transform_subpaths(subs, ctm)
            fill = st.get("fill", "black")
            stroke = st.get("stroke", "none")
            has_fill = fill not in ("none", "transparent")
            has_stroke = stroke not in ("none", "transparent")
            width = st.get("stroke-width")
            try:
                width = float(re.sub(r"[a-z%]+$", "", width)) if width else 1.0
            except ValueError:
                width = 1.0
            # Scale a stroke width by the transform, so verification draws the
            # same line the source did.
            scale = math.sqrt(abs(ctm[0]*ctm[3] - ctm[1]*ctm[2])) or 1.0
            if has_fill:
                out.append((normalise_winding(subs), True, None))
            if has_stroke:
                out.append((subs, False, width * scale))
            return
        for child in el:
            walk(child, ctm, st)

    walk(root, [1, 0, 0, 1, 0, 0], {})
    # The artboard may be offset or scaled by the viewBox; normalise to it.
    if vb[0] or vb[1]:
        shift = [1, 0, 0, 1, -vb[0], -vb[1]]
        out = [(transform_subpaths(s, shift), f, w) for s, f, w in out]
    return out, (vb[2], vb[3])


# ------------------------------------------------------------------ tracing
# A drawing may paint in the background colour — a white stroke laid over two
# overlapping black shapes to hold them apart is the usual way of it, and the
# usual way of drawing the gap this icon language calls for. One colour cannot
# carry that: on import the gap has to stop being paint and become geometry.
#
# Rather than intersect and offset the outlines, which needs a geometry library
# this machine does not have, the file is rendered exactly as the drawing
# program would show it and the black regions are traced back out. The result
# is what the eye was shown, by construction — which is the only definition of
# "the same" that matters here.

def paints_background(path):
    """Does the file paint anything in a colour that is not the ink?"""
    text = open(path).read()
    return bool(re.search(r"(?:fill|stroke)\s*[:=]\s*[\"']?\s*(#f{3,8}\b|white)",
                          text, re.I))


def _mask(path, box, scale, margin):
    """The drawing as a boolean grid, with room around it for any overflow."""
    from PIL import Image
    bw, bh = box
    vb = (-margin, -margin, bw + 2 * margin, bh + 2 * margin)
    src = open(path).read()
    # Re-state the viewBox so nothing that spills past the artboard is clipped
    # away before it can be traced.
    src = re.sub(r'viewBox\s*=\s*"[^"]*"',
                 f'viewBox="{vb[0]:g} {vb[1]:g} {vb[2]:g} {vb[3]:g}"', src, count=1)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as fh:
        fh.write(src)
        tmp = fh.name
    png = tmp[:-4] + ".png"
    subprocess.run(["rsvg-convert", "-b", "white",
                    "-w", str(round(vb[2] * scale)), "-h", str(round(vb[3] * scale)),
                    "-o", png, tmp], check=True)
    import numpy as np
    grid = np.asarray(Image.open(png).convert("L"), dtype=np.int16) < 128
    os.unlink(tmp)
    os.unlink(png)
    return grid


# Marching squares, with the ink kept on the right of every segment so the
# pieces link head to tail into closed loops.
_CASES = {
    1: [("L", "T")], 2: [("T", "R")], 3: [("L", "R")], 4: [("R", "B")],
    5: [("L", "T"), ("R", "B")], 6: [("T", "B")], 7: [("L", "B")],
    8: [("B", "L")], 9: [("B", "T")], 10: [("T", "R"), ("B", "L")],
    11: [("B", "R")], 12: [("R", "L")], 13: [("R", "T")], 14: [("T", "L")],
}


def _contours(grid):
    import numpy as np
    m = np.pad(grid, 1, constant_values=False)
    a, b = m[:-1, :-1], m[:-1, 1:]
    c, d = m[1:, 1:], m[1:, :-1]
    idx = (a.astype(np.uint8) | (b.astype(np.uint8) << 1)
           | (c.astype(np.uint8) << 2) | (d.astype(np.uint8) << 3))
    edges = {}
    ys, xs = np.nonzero((idx != 0) & (idx != 15))
    for y, x in zip(ys.tolist(), xs.tolist()):
        pt = {"T": (x + 0.5, float(y)), "R": (x + 1.0, y + 0.5),
              "B": (x + 0.5, y + 1.0), "L": (float(x), y + 0.5)}
        for u, v in _CASES[int(idx[y, x])]:
            edges.setdefault(pt[u], []).append(pt[v])
    loops = []
    while edges:
        start = next(iter(edges))
        loop, node = [], start
        while True:
            nxts = edges.get(node)
            if not nxts:
                break
            nxt = nxts.pop()
            if not nxts:
                del edges[node]
            loop.append(node)
            node = nxt
            if node == start:
                break
        if len(loop) > 2:
            loops.append(loop)
    return loops


def _simplify(points, tol):
    """Douglas-Peucker, iterative so a long contour cannot blow the stack."""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        worst, wi = -1.0, None
        for k in range(i + 1, j):
            px, py = points[k]
            if norm == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > worst:
                worst, wi = dist, k
        if worst > tol:
            keep[wi] = True
            stack.append((i, wi))
            stack.append((wi, j))
    return [p for p, k in zip(points, keep) if k]


def trace_file(path, box, scale=18, margin=4.0, tol_units=0.09):
    """The file's ink, as filled polygons in artboard coordinates."""
    grid = _mask(path, box, scale, margin)
    subs = []
    for loop in _contours(grid):
        pts = [((x - 1) / scale - margin, (y - 1) / scale - margin) for x, y in loop]
        pts = _simplify(pts + [pts[0]], tol_units)[:-1]
        if len(pts) < 3:
            continue
        subs.append([pts[0], [("L", p) for p in pts[1:]], True])
    if not subs:
        return []
    return [(normalise_winding(subs), True, None)]


# ------------------------------------------------------------------ geometry

def box_for(icon, view):
    """The coordinate box a view is drawn in, from the icon's real size."""
    d = icon["defaults"]
    if view == "top":
        return d["width_cm"], d["depth_cm"]
    if view == "front":
        return d["width_cm"], d["height_cm"]
    return d["depth_cm"], d["height_cm"]


def ink_bounds(shapes):
    xs, ys = [], []
    for subs, filled, width in shapes:
        for sub in subs:
            for p in sample(sub, 12):
                xs.append(p[0])
                ys.append(p[1])
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


# Which real-world axis each view's x and y measure. This is the whole basis
# for reconciling the three: front and side both measure the object's height,
# top and front both measure its width, top and side both measure its depth.
AXES_OF = {"top": ("W", "D"), "front": ("W", "H"), "side": ("D", "H")}

# Icons whose three views are one drawing rather than three projections. A
# guitar seen truly from above is an unreadable sliver, so the plan carries a
# picture of the instrument instead; the trumpet lies flat and shows the same
# picture whichever way you look at it. For these the views cannot be
# reconciled — the same picture would have to measure 55 cm along the box that
# is 55 cm and along the box that is 20 cm — so each view is simply fitted to
# its own footprint, and the fact that they disagree is the point of them.
ONE_DRAWING = {"guitar_acoustic", "guitar_electric", "bass", "cello",
               "saxophone", "trumpet", "mic"}


def fit_views_separately(views, boxes):
    """Each view scaled uniformly to fill its own footprint, and centred."""
    out, factors = dict(views), {}
    for view, shapes in views.items():
        b = ink_bounds(shapes)
        if b is None or b[2] - b[0] <= 0 or b[3] - b[1] <= 0:
            continue
        bw, bh = boxes[view]
        k = min(bw / (b[2] - b[0]), bh / (b[3] - b[1])) * 0.995
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        m = mat_mul([1, 0, 0, 1, bw / 2, bh / 2],
                    mat_mul([k, 0, 0, k, 0, 0], [1, 0, 0, 1, -cx, -cy]))
        out[view] = [(transform_subpaths(sub, m), f, (w0 * k if w0 else None))
                     for sub, f, w0 in shapes]
        factors[view] = k
    if not factors or all(abs(v - 1.0) <= 0.02 for v in factors.values()):
        return views, None
    return out, (factors, 1.0, 0.0)


def fit_icon(views, boxes, icon_id=""):
    """Reconcile an icon's three views, then scale them into their footprints.

    Two separate problems, in order.

    First, the views may disagree about the object. A saxophone drawn to fill
    the width of both elevations comes out a third taller in one than the
    other, because those boxes are 30 cm and 40 cm wide but both 80 cm tall.
    Any single multiplier preserves that disagreement, so each view gets its
    own factor, chosen so the axes the views share end up measuring the same
    thing. Three views give three shared-axis equations for two free ratios,
    so the fit is least-squares in log space: no drawing is taken as correct
    and each is moved as little as the others allow.

    Second, once they agree, one common factor scales all three so the drawing
    is as large as the footprint permits and no view spills over its edge.
    """
    import numpy as np

    if icon_id in ONE_DRAWING:
        return fit_views_separately(views, boxes)

    ink = {}
    for view, shapes in views.items():
        b = ink_bounds(shapes)
        if b is None or b[2] - b[0] <= 0 or b[3] - b[1] <= 0:
            continue
        ink[view] = {AXES_OF[view][0]: b[2] - b[0], AXES_OF[view][1]: b[3] - b[1]}
    if len(ink) < 1:
        return views, None

    order = [v for v in VIEWS if v in ink]
    index = {v: i for i, v in enumerate(order)}
    rows, rhs = [], []
    for axis in ("W", "D", "H"):
        holders = [v for v in order if axis in ink[v]]
        for a, b in zip(holders, holders[1:]):
            row = [0.0] * len(order)
            row[index[a]] = 1.0
            row[index[b]] = -1.0
            rows.append(row)
            rhs.append(math.log(ink[b][axis] / ink[a][axis]))
    # Gauge: without this the system only fixes the ratios, not the size.
    rows.append([1.0] * len(order))
    rhs.append(0.0)
    scales = np.exp(np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)[0])
    k = {v: float(scales[index[v]]) for v in order}

    # Now the common factor: the tightest view fills, none overflow.
    common = None
    for view in order:
        bw, bh = boxes[view]
        b = ink_bounds(views[view])
        w, h = (b[2] - b[0]) * k[view], (b[3] - b[1]) * k[view]
        here = min(bw / w, bh / h)
        common = here if common is None else min(common, here)
    common *= 0.995
    for view in order:
        k[view] *= common

    spread = max(k.values()) / min(k.values())
    worst_off = 0.0
    for view in order:
        bw, bh = boxes[view]
        b = ink_bounds(views[view])
        worst_off = max(worst_off,
                        abs((b[0] + b[2]) / 2 - bw / 2) / bw,
                        abs((b[1] + b[3]) / 2 - bh / 2) / bh)
    if all(abs(v - 1.0) <= 0.02 for v in k.values()) and worst_off <= OFFSET_TOLERANCE:
        return views, None

    out = dict(views)
    for view in order:
        b = ink_bounds(views[view])
        bw, bh = boxes[view]
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        m = mat_mul([1, 0, 0, 1, bw / 2, bh / 2],
                    mat_mul([k[view], 0, 0, k[view], 0, 0], [1, 0, 0, 1, -cx, -cy]))
        out[view] = [(transform_subpaths(sub, m), f, (w0 * k[view] if w0 else None))
                     for sub, f, w0 in views[view]]
    return out, (k, spread, worst_off)


# --------------------------------------------------------------- verification

def render(shapes, box, png, scale=8):
    bw, bh = box
    w, h = round(bw * scale), round(bh * scale)
    body = []
    for subs, filled, width in shapes:
        d = to_d(subs)
        if filled:
            body.append(f'<path fill="#000" stroke="none" d="{d}"/>')
        else:
            body.append(f'<path fill="none" stroke="#000" stroke-width="{width:g}" '
                        f'stroke-linecap="round" stroke-linejoin="round" d="{d}"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">'
           f'<rect width="{w}" height="{h}" fill="#fff"/>'
           f'<svg width="{w}" height="{h}" viewBox="0 0 {bw:g} {bh:g}" '
           f'preserveAspectRatio="none" overflow="visible">{"".join(body)}</svg></svg>')
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as fh:
        fh.write(svg)
        tmp = fh.name
    subprocess.run(["rsvg-convert", "-o", png, tmp], check=True)
    os.unlink(tmp)


def render_source(path, box, png, scale=8):
    bw, bh = box
    subprocess.run(["rsvg-convert", "-b", "white", "-w", str(round(bw * scale)),
                    "-h", str(round(bh * scale)), "-o", png, path], check=True)


def difference(a, b, radius=2):
    """How much two renderings really disagree, ignoring the edge.

    Counting differing pixels outright measures anti-aliasing: two identical
    drawings still disagree along every contour by about a pixel, and an icon
    with a lot of perimeter for its area scores badly for no reason. So the
    disagreement is eroded first — a pixel counts only if its whole
    neighbourhood also disagrees. A missing hole or a shifted shape survives
    that; a boundary a pixel out does not.
    """
    import numpy as np
    from PIL import Image
    ia = np.asarray(Image.open(a).convert("L"), dtype=np.int16) < 128
    ib = np.asarray(Image.open(b).convert("L"), dtype=np.int16) < 128
    if ia.shape != ib.shape:
        return 1.0
    x = ia ^ ib
    eroded = x.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            eroded &= np.roll(np.roll(x, dy, axis=0), dx, axis=1)
    return float(eroded.sum()) / x.size


# --------------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    args = [a for a in args if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    src_dir = args[0]

    data = json.load(open(GLYPHS))
    tmpdir = tempfile.mkdtemp()
    worst = 0.0
    failures, fits, missing, traces = [], [], [], []

    for icon in data["icons"]:
        views, boxes = {}, {}
        for view in VIEWS:
            path = os.path.join(src_dir, f'{icon["id"]}-{view}.svg')
            if not os.path.exists(path):
                missing.append(f'{icon["id"]}-{view}')
                continue
            shapes, box = read_svg(path)
            # The artboard is the footprint. If the two ever drift apart the
            # glyph lands in the wrong coordinate space and draws at the wrong
            # size, silently — so a mismatch is an error, not a warning.
            want = box_for(icon, view)
            if abs(box[0] - want[0]) > 0.01 or abs(box[1] - want[1]) > 0.01:
                failures.append((f'{icon["id"]}-{view}',
                                 f"artboard {box[0]:g}x{box[1]:g} but the icon's "
                                 f"footprint says {want[0]:g}x{want[1]:g}"))
                continue
            traced = False
            if paints_background(path):
                shapes = trace_file(path, box)
                traced = True
            if not shapes:
                failures.append((f'{icon["id"]}-{view}', "no visible shapes"))
                continue

            # Verify the parse before anything is allowed to change the drawing.
            a = os.path.join(tmpdir, "a.png")
            b = os.path.join(tmpdir, "b.png")
            render_source(path, box, a)
            render(shapes, box, b)
            diff = difference(a, b)
            worst = max(worst, diff)
            if diff > 0.004:
                failures.append((f'{icon["id"]}-{view}', f"{diff:.2%} disagrees"))
            if traced:
                traces.append(f'{icon["id"]}-{view}: painted a background-colour gap; '
                              f'traced back to geometry ({diff:.2%} off)')
            views[view] = shapes
            boxes[view] = box

        views, adj = fit_icon(views, boxes, icon["id"])
        if adj:
            k, spread, off = adj
            per = ", ".join(f"{v} x{k[v]:.2f}" for v in VIEWS if v in k)
            note = f'{icon["id"]}: {per}'
            if spread > 1.05:
                note += f" — views disagreed by {spread - 1:.0%}, reconciled"
            if off > OFFSET_TOLERANCE:
                note += f"; recentred (was {off:.0%} off)"
            fits.append(note)
        for view, shapes in views.items():
            icon["glyphs"][view] = [{"kind": "path", "d": to_d(sub), "fill": bool(f)}
                                    for sub, f, _ in shapes]

    print(f"parse check: worst disagreement {worst:.3%} of the artboard "
          f"(edge jitter discounted)")
    if missing:
        print(f"missing files ({len(missing)}): {', '.join(missing)}")
    if traces:
        print(f"\ntraced ({len(traces)}):")
        for t in traces:
            print("  " + t)
    if fits:
        print(f"\nfitted ({len(fits)}):")
        for f in fits:
            print("  " + f)
    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for name, why in failures:
            print(f"  {name}: {why}")
        raise SystemExit(1)
    if dry:
        print("\ndry run: nothing written")
        return
    write(data)
    print(f"\nwrote {GLYPHS}")


def write(d):
    def mark(m):
        return json.dumps(m, separators=(", ", ": "))
    out = ['{', '  "version": %d,' % d["version"], '  "icons": [']
    for n, icon in enumerate(d["icons"]):
        out += ['    {',
                '      "id": %s,' % json.dumps(icon["id"]),
                '      "label": %s,' % json.dumps(icon["label"]),
                '      "group": %s,' % json.dumps(icon["group"]),
                '      "defaults": %s,' % json.dumps(icon["defaults"], separators=(", ", ": ")),
                '      "glyphs": {']
        views = list(icon["glyphs"].items())
        for vi, (view, marks) in enumerate(views):
            out.append('        %s: [' % json.dumps(view))
            for mi, m in enumerate(marks):
                out.append('          %s%s' % (mark(m), "," if mi < len(marks) - 1 else ""))
            out.append('        ]%s' % ("," if vi < len(views) - 1 else ""))
        out += ['      }', '    }%s' % ("," if n < len(d["icons"]) - 1 else "")]
    out += ['  ],', '  "placeholder": {',
            '    "box": %s,' % json.dumps(d["placeholder"]["box"]),
            '    "marks": [']
    pm = d["placeholder"]["marks"]
    for mi, m in enumerate(pm):
        out.append('      %s%s' % (mark(m), "," if mi < len(pm) - 1 else ""))
    out += ['    ]', '  }', '}']
    open(GLYPHS, "w").write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
