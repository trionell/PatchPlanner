import type { ReactElement } from 'react'
import type { StagePlotView } from '../types'
import glyphData from './stagePlotGlyphs.json'

// Built-in stage plot icon registry (research.md R9). Every glyph is
// drawn in a per-view coordinate box matching the icon's DEFAULT
// real-world proportions — top: width×depth, front: width×height,
// side: depth×height, all in cm — and stretched to the element's actual
// footprint by the canvas (preserveAspectRatio="none"). Drawing in the
// true aspect means a default-sized element renders undistorted, and
// user resizing distorts proportionally, exactly like the outline
// itself. Strokes use currentColor (the layer tint) and
// non-scaling-stroke so stretching never fattens lines.
//
// The shapes themselves are NOT written here. They live in
// stagePlotGlyphs.json, which the Go renderer that draws these same
// icons onto paper reads verbatim (backend/internal/service/plotglyph).
// Two hand-written descriptions of one shape is the arrangement where a
// glyph edited for the screen quietly stops matching the print, so
// there is one description and two renderers. This file is the renderer
// for the screen; its exported API is unchanged.

export interface StagePlotIconDef {
  id: string
  label: string
  group: 'resource' | 'instrument' | 'lighting'
  /** Sensible real-world size applied when the icon is first placed. */
  defaults: { width_cm: number; depth_cm: number; height_cm: number }
  glyphs: Partial<Record<StagePlotView, ReactElement>>
}

/** One drawing instruction in an icon's own coordinate box. */
type GlyphMark =
  | { kind: 'path'; d: string; fill: boolean; dash?: number[]; rotate?: number[] }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: boolean; dash?: number[]; rotate?: number[] }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill: boolean; dash?: number[]; rotate?: number[] }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.5,
  vectorEffect: 'non-scaling-stroke',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const filled = {
  fill: 'currentColor',
  stroke: 'none',
} as const

function renderMark(mark: GlyphMark, key: number): ReactElement {
  const style = mark.fill ? filled : stroke
  const extra: { transform?: string; strokeDasharray?: string } = {}
  if (mark.rotate) extra.transform = `rotate(${mark.rotate.join(' ')})`
  if (mark.dash) extra.strokeDasharray = mark.dash.join(' ')
  switch (mark.kind) {
    case 'path':
      return <path key={key} {...style} d={mark.d} {...extra} />
    case 'circle':
      return <circle key={key} {...style} cx={mark.cx} cy={mark.cy} r={mark.r} {...extra} />
    case 'rect':
      return <rect key={key} {...style} x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx={mark.rx} {...extra} />
  }
}

const renderGlyph = (marks: GlyphMark[]): ReactElement => <g>{marks.map(renderMark)}</g>

export const STAGE_PLOT_ICONS: StagePlotIconDef[] = (glyphData.icons as Array<{
  id: string
  label: string
  group: string
  defaults: { width_cm: number; depth_cm: number; height_cm: number }
  glyphs: Record<string, GlyphMark[]>
}>).map((icon) => ({
  id: icon.id,
  label: icon.label,
  group: icon.group as StagePlotIconDef['group'],
  defaults: icon.defaults,
  glyphs: Object.fromEntries(
    Object.entries(icon.glyphs).map(([view, marks]) => [view, renderGlyph(marks)]),
  ) as Partial<Record<StagePlotView, ReactElement>>,
}))

const iconById = new Map(STAGE_PLOT_ICONS.map((icon) => [icon.id, icon]))

export function getStagePlotIcon(id: string): StagePlotIconDef | undefined {
  return iconById.get(id)
}

/**
 * The glyph coordinate box for an icon in a view, derived from the
 * icon's default real-world proportions (top: w×d, front: w×h,
 * side: d×h). Rendering with preserveAspectRatio="none" into the
 * element's actual footprint keeps a default-sized element undistorted
 * and scales user resizes proportionally.
 */
export function iconViewBox(id: string, view: StagePlotView): string {
  const icon = iconById.get(id)
  if (!icon) return `0 0 ${glyphData.placeholder.box[0]} ${glyphData.placeholder.box[1]}`
  const { width_cm, depth_cm, height_cm } = icon.defaults
  switch (view) {
    case 'top':
      return `0 0 ${width_cm} ${depth_cm}`
    case 'front':
      return `0 0 ${width_cm} ${height_cm}`
    case 'side':
      return `0 0 ${depth_cm} ${height_cm}`
  }
}

/** Placeholder for unknown ids: a labeled box, never a crash. */
const placeholderGlyph = renderGlyph(glyphData.placeholder.marks as GlyphMark[])

/**
 * The glyph to draw for an icon id in a view. Falls back per view →
 * top-down → labeled placeholder, so an unknown or not-yet-drawn
 * variant renders visibly instead of breaking the canvas. Pair with
 * iconViewBox(id, view) — the placeholder uses '0 0 100 100', which
 * iconViewBox also returns for unknown ids.
 */
export function iconGlyph(id: string, view: StagePlotView): ReactElement {
  const icon = iconById.get(id)
  if (!icon) return placeholderGlyph
  return icon.glyphs[view] ?? icon.glyphs.top ?? placeholderGlyph
}
