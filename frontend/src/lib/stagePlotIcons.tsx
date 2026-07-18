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
      front: (
        <g>
          <circle {...stroke} cx="50" cy="14" r="11" />
          <path {...stroke} d="M50 25 L50 62 M50 34 L28 52 M50 34 L72 52 M50 62 L36 96 M50 62 L64 96" />
        </g>
      ),
      side: (
        <g>
          <circle {...stroke} cx="54" cy="14" r="11" />
          <path {...stroke} d="M52 25 L48 62 M50 36 L60 54 M48 62 L42 96 M48 62 L56 96" />
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
      front: (
        <g>
          <rect {...stroke} x="42" y="4" width="16" height="26" rx="8" />
          <path {...stroke} d="M34 22 A16 16 0 0 0 66 22 M50 38 L50 88 M32 96 L68 96 M50 88 L32 96 M50 88 L68 96" />
        </g>
      ),
      side: (
        <g>
          <rect {...stroke} x="44" y="4" width="14" height="24" rx="7" />
          <path {...stroke} d="M51 28 L51 88 M36 96 L66 96 M51 88 L36 96 M51 88 L66 96" />
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
      front: (
        <g>
          <rect {...stroke} x="14" y="4" width="72" height="92" />
          <circle {...stroke} cx="50" cy="66" r="20" />
          <circle {...stroke} cx="50" cy="24" r="10" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M20 4 L80 4 L80 96 L34 96 L20 60 Z" />
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
      front: (
        <g>
          <path {...stroke} d="M8 96 L92 96 L78 52 L22 52 Z" />
          <circle {...stroke} cx="50" cy="76" r="12" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M10 96 L90 96 L90 66 L30 30 Z" />
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
      front: (
        <g>
          <rect {...stroke} x="12" y="4" width="76" height="92" />
          <path {...stroke} d="M12 26 L88 26 M12 48 L88 48 M12 70 L88 70" />
          <circle {...stroke} cx="22" cy="15" r="2" />
          <circle {...stroke} cx="22" cy="37" r="2" />
        </g>
      ),
      side: (
        <g>
          <rect {...stroke} x="18" y="4" width="64" height="92" />
          <path {...stroke} d="M18 26 L82 26" />
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
      front: (
        <g>
          <path {...stroke} d="M4 30 L96 30 M4 70 L96 70" />
          <path {...stroke} d="M4 30 L20 70 L36 30 L52 70 L68 30 L84 70 L96 30" />
        </g>
      ),
      side: (
        <g>
          <rect {...stroke} x="20" y="20" width="60" height="60" />
          <path {...stroke} d="M20 20 L80 80 M80 20 L20 80" />
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
      front: (
        <g>
          <path {...stroke} d="M30 4 L70 4 M50 4 L50 16" />
          <rect {...stroke} x="32" y="16" width="36" height="44" rx="6" />
          <path {...stroke} d="M32 74 A26 14 0 0 1 68 74 M26 60 L74 60" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M40 4 L76 4 M58 4 L58 16" />
          <rect {...stroke} x="42" y="16" width="30" height="42" rx="6" transform="rotate(18 57 37)" />
          <path {...stroke} d="M36 66 L64 84" />
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
      front: (
        <g>
          <circle {...stroke} cx="50" cy="60" r="24" />
          <path {...stroke} d="M26 60 L74 60" />
          <rect {...stroke} x="16" y="26" width="22" height="16" rx="3" />
          <rect {...stroke} x="62" y="26" width="22" height="16" rx="3" />
          <path {...stroke} d="M14 12 L38 18 M86 12 L62 18" />
          <path {...stroke} d="M34 84 L28 96 M66 84 L72 96" />
        </g>
      ),
      side: (
        <g>
          <rect {...stroke} x="26" y="42" width="40" height="38" rx="4" />
          <path {...stroke} d="M20 18 L52 26 M46 42 L46 80" />
          <path {...stroke} d="M34 80 L28 96 M60 80 L68 96" />
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
      front: (
        <g>
          <rect {...stroke} x="8" y="34" width="84" height="24" />
          <path {...stroke} d="M8 34 L8 10 L92 10 L92 34" />
          <path {...stroke} d="M22 34 L22 58 M36 34 L36 58 M50 34 L50 58 M64 34 L64 58 M78 34 L78 58" />
          <path {...stroke} d="M16 58 L16 96 M84 58 L84 96 M50 58 L50 96" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M10 44 L64 44 L92 16 L92 44 L90 58 L14 58 Z" />
          <path {...stroke} d="M20 58 L20 96 M82 58 L82 96" />
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
      front: (
        <g>
          <rect {...stroke} x="10" y="8" width="80" height="54" />
          <path {...stroke} d="M10 62 L90 62 L90 74 L10 74 Z" />
          <path {...stroke} d="M24 62 L24 74 M38 62 L38 74 M52 62 L52 74 M66 62 L66 74 M80 62 L80 74" />
          <path {...stroke} d="M16 74 L16 96 M84 74 L84 96" />
        </g>
      ),
      side: (
        <g>
          <rect {...stroke} x="30" y="8" width="34" height="66" />
          <path {...stroke} d="M64 60 L82 60 L82 74 L64 74" />
          <path {...stroke} d="M36 74 L36 96 M76 74 L76 96" />
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
      front: (
        <g>
          <rect {...stroke} x="6" y="40" width="88" height="18" />
          <path {...stroke} d="M20 40 L20 58 M34 40 L34 58 M48 40 L48 58 M62 40 L62 58 M76 40 L76 58" />
          <path {...stroke} d="M18 58 L12 96 M82 58 L88 96 M14 82 L86 82" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M26 44 L74 40 L76 56 L28 60 Z" />
          <path {...stroke} d="M50 60 L46 96 M38 96 L58 96" />
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
      front: (
        <g>
          <path {...stroke} d="M50 40 C66 40 70 52 68 64 C66 82 58 92 50 92 C42 92 34 82 32 64 C30 52 34 40 50 40 Z" />
          <circle {...stroke} cx="50" cy="62" r="8" />
          <rect {...stroke} x="45" y="6" width="10" height="34" />
          <path {...stroke} d="M42 6 L58 6" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M44 40 L56 40 L58 92 L42 92 Z" />
          <path {...stroke} d="M47 40 L45 6 L57 6 L53 40" />
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
      front: (
        <g>
          <path {...stroke} d="M50 44 C62 44 66 54 62 62 C70 66 68 80 58 86 C54 90 46 90 42 86 C32 80 30 66 38 62 C34 54 38 44 50 44 Z" />
          <rect {...stroke} x="46" y="4" width="8" height="40" />
          <path {...stroke} d="M42 4 L58 4" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M46 46 L54 46 L56 88 L44 88 Z" />
          <path {...stroke} d="M48 46 L47 4 L56 4 L52 46" />
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
      front: (
        <g>
          <path {...stroke} d="M50 48 C60 48 64 56 61 63 C68 67 66 80 57 86 C53 90 47 90 43 86 C34 80 32 67 39 63 C36 56 40 48 50 48 Z" />
          <rect {...stroke} x="46.5" y="2" width="7" height="46" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M46 50 L54 50 L55 88 L45 88 Z" />
          <path {...stroke} d="M49 50 L48 2 L54 2 L51 50" />
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
      front: (
        <g>
          <path {...stroke} d="M50 26 C61 26 66 33 66 40 C66 45 62 48 62 53 C62 60 69 63 69 71 C69 82 60 90 50 90 C40 90 31 82 31 71 C31 63 38 60 38 53 C38 48 34 45 34 40 C34 33 39 26 50 26 Z" />
          <path {...stroke} d="M50 26 L50 6 M44 6 L56 6 M50 90 L50 98" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M44 28 L52 28 L56 88 L42 88 Z" />
          <path {...stroke} d="M48 28 L48 6 M49 88 L52 98" />
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
      front: (
        <g>
          <path {...stroke} d="M6 46 L54 46 M6 58 L54 58" />
          <path {...stroke} d="M54 46 C70 46 72 28 88 28 L88 76 C72 76 70 58 54 58" />
          <path {...stroke} d="M22 46 L22 36 M32 46 L32 36 M42 46 L42 36" />
        </g>
      ),
      side: (
        <g>
          <circle {...stroke} cx="50" cy="52" r="22" />
          <circle {...stroke} cx="50" cy="52" r="9" />
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
      front: (
        <g>
          <path {...stroke} d="M60 4 C56 4 54 8 54 12 L54 62 C54 76 46 86 36 86 C26 86 18 78 18 68 C18 60 24 54 32 54" />
          <path {...stroke} d="M60 4 L72 2" />
          <path {...stroke} d="M54 24 L48 24 M54 36 L48 36 M54 48 L48 48" />
        </g>
      ),
      side: (
        <g>
          <path {...stroke} d="M56 4 L52 60 C52 76 44 86 36 86 C28 86 24 78 26 70" />
          <path {...stroke} d="M56 4 L66 2" />
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
