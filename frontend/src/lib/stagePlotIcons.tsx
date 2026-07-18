import type { ReactElement } from 'react'
import type { StagePlotView } from '../types'

// Built-in stage plot icon registry (research.md R9). Every glyph is
// drawn in a normalized 0–100 box and stretched to the element's cm
// footprint by the canvas (preserveAspectRatio="none"), so the icon
// always fills exactly the element's real-world outline. Strokes use
// currentColor (the layer tint) and non-scaling-stroke so stretching
// never fattens lines. Front/side variants land with US6 (T037/T038);
// until then lookup falls back to the top-down glyph.

export interface StagePlotIconDef {
  id: string
  label: string
  group: 'resource' | 'instrument' | 'lighting'
  /** Sensible real-world size applied when the icon is first placed. */
  defaults: { width_cm: number; depth_cm: number; height_cm: number }
  glyphs: Partial<Record<StagePlotView, ReactElement>>
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 4,
  vectorEffect: 'non-scaling-stroke',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const STAGE_PLOT_ICONS: StagePlotIconDef[] = [
  // ---- Core resources ----
  {
    id: 'person',
    label: 'Person',
    group: 'resource',
    defaults: { width_cm: 60, depth_cm: 40, height_cm: 180 },
    glyphs: {
      top: (
        <g>
          <ellipse {...stroke} cx="50" cy="55" rx="42" ry="30" />
          <circle {...stroke} cx="50" cy="45" r="16" />
        </g>
      ),
    },
  },
  {
    id: 'mic',
    label: 'Mic',
    group: 'resource',
    defaults: { width_cm: 30, depth_cm: 30, height_cm: 160 },
    glyphs: {
      top: (
        <g>
          <circle {...stroke} cx="50" cy="35" r="18" />
          <path {...stroke} d="M50 53 L50 88 M30 88 L70 88" />
        </g>
      ),
    },
  },
  {
    id: 'speaker',
    label: 'Speaker',
    group: 'resource',
    defaults: { width_cm: 40, depth_cm: 35, height_cm: 70 },
    glyphs: {
      top: (
        <g>
          <rect {...stroke} x="8" y="8" width="84" height="84" />
          <path {...stroke} d="M20 80 A38 38 0 0 1 80 80" />
          <circle {...stroke} cx="50" cy="42" r="10" />
        </g>
      ),
    },
  },
  {
    id: 'monitor',
    label: 'Monitor',
    group: 'resource',
    defaults: { width_cm: 50, depth_cm: 40, height_cm: 35 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M12 20 L88 20 L72 85 L28 85 Z" />
          <path {...stroke} d="M28 38 L72 38" />
        </g>
      ),
    },
  },
  {
    id: 'rack',
    label: 'Rack',
    group: 'resource',
    defaults: { width_cm: 60, depth_cm: 60, height_cm: 100 },
    glyphs: {
      top: (
        <g>
          <rect {...stroke} x="10" y="10" width="80" height="80" />
          <path {...stroke} d="M22 10 L22 90 M78 10 L78 90" />
          <path {...stroke} d="M34 35 L66 35 M34 50 L66 50 M34 65 L66 65" />
        </g>
      ),
    },
  },
  {
    id: 'truss',
    label: 'Truss',
    group: 'lighting',
    defaults: { width_cm: 200, depth_cm: 30, height_cm: 30 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M4 25 L96 25 M4 75 L96 75" />
          <path {...stroke} d="M4 25 L20 75 L36 25 L52 75 L68 25 L84 75 L96 25" />
        </g>
      ),
    },
  },
  {
    id: 'fixture',
    label: 'Fixture',
    group: 'lighting',
    defaults: { width_cm: 30, depth_cm: 25, height_cm: 35 },
    glyphs: {
      top: (
        <g>
          <rect {...stroke} x="25" y="15" width="50" height="55" rx="8" />
          <path {...stroke} d="M25 82 A34 20 0 0 1 75 82" />
          <path {...stroke} d="M14 15 L14 45 M86 15 L86 45" />
        </g>
      ),
    },
  },
  // ---- Instruments (FR-008: one distinct icon per instrument) ----
  {
    id: 'drums',
    label: 'Drums',
    group: 'instrument',
    defaults: { width_cm: 200, depth_cm: 150, height_cm: 120 },
    glyphs: {
      top: (
        <g>
          <circle {...stroke} cx="50" cy="62" r="20" />
          <circle {...stroke} cx="22" cy="38" r="13" />
          <circle {...stroke} cx="50" cy="26" r="11" />
          <circle {...stroke} cx="78" cy="38" r="13" />
          <circle {...stroke} cx="14" cy="70" r="9" />
          <circle {...stroke} cx="86" cy="70" r="11" />
        </g>
      ),
    },
  },
  {
    id: 'piano_grand',
    label: 'Grand piano',
    group: 'instrument',
    defaults: { width_cm: 150, depth_cm: 250, height_cm: 100 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M15 8 L85 8 L85 40 C85 75 70 92 45 92 L15 92 Z" />
          <path {...stroke} d="M15 20 L85 20" />
        </g>
      ),
    },
  },
  {
    id: 'piano_upright',
    label: 'Upright piano',
    group: 'instrument',
    defaults: { width_cm: 150, depth_cm: 60, height_cm: 125 },
    glyphs: {
      top: (
        <g>
          <rect {...stroke} x="6" y="15" width="88" height="70" />
          <path {...stroke} d="M6 55 L94 55" />
          <path {...stroke} d="M20 55 L20 85 M35 55 L35 85 M50 55 L50 85 M65 55 L65 85 M80 55 L80 85" />
        </g>
      ),
    },
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    group: 'instrument',
    defaults: { width_cm: 130, depth_cm: 40, height_cm: 95 },
    glyphs: {
      top: (
        <g>
          <rect {...stroke} x="4" y="25" width="92" height="50" />
          <path {...stroke} d="M17 25 L17 75 M30 25 L30 75 M43 25 L43 75 M56 25 L56 75 M69 25 L69 75 M82 25 L82 75" />
        </g>
      ),
    },
  },
  {
    id: 'guitar_acoustic',
    label: 'Acoustic guitar',
    group: 'instrument',
    defaults: { width_cm: 45, depth_cm: 40, height_cm: 110 },
    glyphs: {
      top: (
        <g>
          <circle {...stroke} cx="42" cy="68" r="24" />
          <circle {...stroke} cx="42" cy="38" r="16" />
          <circle {...stroke} cx="42" cy="55" r="6" />
          <path {...stroke} d="M52 25 L82 -4 M75 3 L82 -4" transform="translate(0,10)" />
        </g>
      ),
    },
  },
  {
    id: 'guitar_electric',
    label: 'Electric guitar',
    group: 'instrument',
    defaults: { width_cm: 40, depth_cm: 35, height_cm: 100 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M30 88 C14 88 10 72 22 64 C10 58 16 42 32 46 C38 48 44 52 46 58 L52 74 C54 84 44 88 30 88 Z" />
          <path {...stroke} d="M50 60 L88 10" />
          <path {...stroke} d="M82 4 L94 16" />
        </g>
      ),
    },
  },
  {
    id: 'bass',
    label: 'Bass',
    group: 'instrument',
    defaults: { width_cm: 45, depth_cm: 35, height_cm: 120 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M26 90 C12 90 8 76 18 68 C8 62 14 48 28 51 C34 53 40 57 42 63 L46 78 C48 87 38 90 26 90 Z" />
          <path {...stroke} d="M44 64 L92 4" />
        </g>
      ),
    },
  },
  {
    id: 'cello',
    label: 'Cello',
    group: 'instrument',
    defaults: { width_cm: 50, depth_cm: 45, height_cm: 130 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M50 18 C64 18 70 26 70 34 C70 40 66 44 66 50 C66 58 74 62 74 72 C74 85 64 92 50 92 C36 92 26 85 26 72 C26 62 34 58 34 50 C34 44 30 40 30 34 C30 26 36 18 50 18 Z" />
          <path {...stroke} d="M50 18 L50 4" />
          <path {...stroke} d="M42 50 L42 62 M58 50 L58 62" />
        </g>
      ),
    },
  },
  {
    id: 'trumpet',
    label: 'Trumpet',
    group: 'instrument',
    defaults: { width_cm: 55, depth_cm: 20, height_cm: 15 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M4 42 L58 42 M4 58 L58 58" />
          <path {...stroke} d="M58 42 C74 42 78 24 92 24 L92 76 C78 76 74 58 58 58" />
          <path {...stroke} d="M26 42 L26 58 M36 42 L36 58 M46 42 L46 58" />
        </g>
      ),
    },
  },
  {
    id: 'saxophone',
    label: 'Saxophone',
    group: 'instrument',
    defaults: { width_cm: 30, depth_cm: 40, height_cm: 80 },
    glyphs: {
      top: (
        <g>
          <path {...stroke} d="M66 6 C60 6 58 10 58 16 L58 62 C58 78 48 88 34 88 C22 88 14 80 14 68 C14 58 20 51 30 50" />
          <path {...stroke} d="M66 6 L76 6" />
          <path {...stroke} d="M58 28 L52 28 M58 40 L52 40 M58 52 L52 52" />
        </g>
      ),
    },
  },
]

const iconById = new Map(STAGE_PLOT_ICONS.map((icon) => [icon.id, icon]))

export function getStagePlotIcon(id: string): StagePlotIconDef | undefined {
  return iconById.get(id)
}

/** Placeholder for unknown ids: a labeled box, never a crash. */
const placeholderGlyph = (
  <g>
    <rect {...stroke} x="6" y="6" width="88" height="88" strokeDasharray="8 6" />
    <path {...stroke} d="M30 70 L50 30 L70 70 M38 56 L62 56" />
  </g>
)

/**
 * The glyph to draw for an icon id in a view. Falls back per view →
 * top-down → labeled placeholder, so an unknown or not-yet-drawn
 * variant renders visibly instead of breaking the canvas.
 */
export function iconGlyph(id: string, view: StagePlotView): ReactElement {
  const icon = iconById.get(id)
  if (!icon) return placeholderGlyph
  return icon.glyphs[view] ?? icon.glyphs.top ?? placeholderGlyph
}
