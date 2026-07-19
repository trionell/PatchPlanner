import type { ReactElement } from 'react'
import type { StagePlotView } from '../types'

// Built-in stage plot icon registry (research.md R9). Every glyph is
// drawn in a per-view coordinate box matching the icon's DEFAULT
// real-world proportions — top: width×depth, front: width×height,
// side: depth×height, all in cm — and stretched to the element's actual
// footprint by the canvas (preserveAspectRatio="none"). Drawing in the
// true aspect means a default-sized element renders undistorted, and
// user resizing distorts proportionally, exactly like the outline
// itself. Strokes use currentColor (the layer tint) and
// non-scaling-stroke so stretching never fattens lines.

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
  strokeWidth: 3.5,
  vectorEffect: 'non-scaling-stroke',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const filled = {
  fill: 'currentColor',
  stroke: 'none',
} as const

export const STAGE_PLOT_ICONS: StagePlotIconDef[] = [
  // ---- Core resources ----
  {
    id: 'person',
    label: 'Person',
    group: 'resource',
    defaults: { width_cm: 60, depth_cm: 40, height_cm: 180 },
    glyphs: {
      // Top (60×40): shoulders behind a solid head, nose toward downstage.
      top: (
        <g>
          <path {...stroke} d="M6 16 C6 8 16 6 30 6 C44 6 54 8 54 16 C54 22 48 25 44 25 L16 25 C12 25 6 22 6 16 Z" />
          <circle {...filled} cx="30" cy="22" r="8" />
          <path {...stroke} d="M27 31 L30 36 L33 31" />
        </g>
      ),
      // Front (60×180): stick figure.
      front: (
        <g>
          <circle {...stroke} cx="30" cy="16" r="11" />
          <path {...stroke} d="M30 27 L30 95 M30 44 L8 72 M30 44 L52 72 M30 95 L16 172 M30 95 L44 172" />
        </g>
      ),
      // Side (40×180): profile stick figure.
      side: (
        <g>
          <circle {...stroke} cx="24" cy="16" r="11" />
          <path {...stroke} d="M22 27 C20 50 20 70 20 95 M21 46 L32 74 M20 95 L13 172 M20 95 L28 172" />
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
      // Top (30×30): capsule + tripod legs from above.
      top: (
        <g>
          <circle {...stroke} cx="15" cy="15" r="7" />
          <path {...stroke} d="M15 15 L4 27 M15 15 L26 27 M15 15 L15 2" />
        </g>
      ),
      // Front (30×160): mic on a straight stand.
      front: (
        <g>
          <rect {...stroke} x="11" y="2" width="8" height="16" rx="4" />
          <path {...stroke} d="M15 18 L15 138 M15 138 L4 156 M15 138 L26 156 M15 138 L15 158" />
        </g>
      ),
      // Side (30×160): boom stand in profile.
      side: (
        <g>
          <rect {...stroke} x="19" y="4" width="8" height="14" rx="4" transform="rotate(35 23 11)" />
          <path {...stroke} d="M13 40 L24 16 M13 40 L13 138 M13 138 L3 156 M13 138 L23 156" />
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
      // Top (40×35): classic plan symbol — box with a cross.
      top: (
        <g>
          <rect {...stroke} x="2" y="2" width="36" height="31" />
          <path {...stroke} d="M2 2 L38 33 M38 2 L2 33" />
        </g>
      ),
      // Front (40×70): cabinet, woofer, tweeter.
      front: (
        <g>
          <rect {...stroke} x="2" y="2" width="36" height="66" />
          <circle {...stroke} cx="20" cy="46" r="13" />
          <circle {...stroke} cx="20" cy="16" r="6" />
        </g>
      ),
      // Side (35×70): plain cabinet with the grille at the front edge.
      side: (
        <g>
          <rect {...stroke} x="3" y="2" width="29" height="66" />
          <path {...stroke} d="M9 2 L9 68" />
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
      // Top (50×40): wedge from above.
      top: (
        <g>
          <path {...stroke} d="M4 6 L46 6 L38 36 L12 36 Z" />
          <path {...stroke} d="M11 14 L39 14" />
        </g>
      ),
      // Front (50×35): wedge face with driver.
      front: (
        <g>
          <path {...stroke} d="M2 33 L48 33 L41 10 L9 10 Z" />
          <circle {...stroke} cx="25" cy="23" r="7" />
        </g>
      ),
      // Side (40×35): the wedge profile.
      side: (
        <g>
          <path {...stroke} d="M3 33 L37 33 L37 20 L10 4 Z" />
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
      // Top (60×60): case with rails.
      top: (
        <g>
          <rect {...stroke} x="3" y="3" width="54" height="54" />
          <path {...stroke} d="M12 3 L12 57 M48 3 L48 57" />
          <path {...stroke} d="M12 21 L48 21 M12 39 L48 39" />
        </g>
      ),
      // Front (60×100): rack units.
      front: (
        <g>
          <rect {...stroke} x="3" y="2" width="54" height="96" />
          <path {...stroke} d="M3 22 L57 22 M3 42 L57 42 M3 62 L57 62 M3 82 L57 82" />
          <circle {...filled} cx="10" cy="12" r="1.6" />
          <circle {...filled} cx="50" cy="12" r="1.6" />
          <circle {...filled} cx="10" cy="32" r="1.6" />
          <circle {...filled} cx="50" cy="32" r="1.6" />
        </g>
      ),
      // Side (60×100): case profile with a handle.
      side: (
        <g>
          <rect {...stroke} x="6" y="2" width="48" height="96" />
          <path {...stroke} d="M22 14 L38 14" />
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
      // Top/front (200×30): chords + diagonal lacing.
      top: (
        <g>
          <path {...stroke} d="M2 5 L198 5 M2 25 L198 25" />
          <path {...stroke} d="M2 5 L22 25 L42 5 L62 25 L82 5 L102 25 L122 5 L142 25 L162 5 L182 25 L198 9" />
        </g>
      ),
      front: (
        <g>
          <path {...stroke} d="M2 5 L198 5 M2 25 L198 25" />
          <path {...stroke} d="M2 5 L22 25 L42 5 L62 25 L82 5 L102 25 L122 5 L142 25 L162 5 L182 25 L198 9" />
        </g>
      ),
      // Side (30×30): the square cross-section.
      side: (
        <g>
          <rect {...stroke} x="3" y="3" width="24" height="24" />
          <path {...stroke} d="M3 3 L27 27 M27 3 L3 27" />
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
      // Top (30×25): body + yoke arms, lens toward downstage.
      top: (
        <g>
          <rect {...stroke} x="7" y="3" width="16" height="13" rx="2" />
          <path {...stroke} d="M7 22 A11 5 0 0 1 23 22" />
          <path {...stroke} d="M2 3 L2 13 M28 3 L28 13" />
        </g>
      ),
      // Front (30×35): clamp, yoke, body, lens.
      front: (
        <g>
          <path {...stroke} d="M9 2 L21 2 M15 2 L15 7" />
          <rect {...stroke} x="8" y="7" width="14" height="18" rx="3" />
          <path {...stroke} d="M8 31 A9 5 0 0 1 22 31" />
        </g>
      ),
      // Side (25×35): tilted body throwing a beam.
      side: (
        <g>
          <path {...stroke} d="M6 2 L18 2 M12 2 L12 6" />
          <rect {...stroke} x="6" y="6" width="11" height="17" rx="3" transform="rotate(22 11.5 14.5)" />
          <path {...stroke} d="M6 27 L19 33" />
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
      // Top (200×150): kick center, snare/toms/floor around, cymbals out wide.
      top: (
        <g>
          <circle {...stroke} cx="100" cy="96" r="36" />
          <circle {...stroke} cx="46" cy="62" r="23" />
          <circle {...stroke} cx="79" cy="36" r="19" />
          <circle {...stroke} cx="121" cy="36" r="19" />
          <circle {...stroke} cx="153" cy="64" r="25" />
          <circle {...stroke} cx="19" cy="102" r="15" />
          <circle {...stroke} cx="180" cy="102" r="18" />
        </g>
      ),
      // Front (200×120): kick drum, rack toms, cymbals on stands.
      front: (
        <g>
          <circle {...stroke} cx="100" cy="78" r="34" />
          <circle {...stroke} cx="100" cy="78" r="6" />
          <rect {...stroke} x="48" y="20" width="38" height="24" rx="4" />
          <rect {...stroke} x="114" y="20" width="38" height="24" rx="4" />
          <path {...stroke} d="M8 8 L48 16 M28 12 L28 112 M192 8 L152 16 M172 12 L172 112" />
          <path {...stroke} d="M74 104 L60 116 M126 104 L140 116" />
        </g>
      ),
      // Side (150×120): kick in profile, snare + cymbal stands.
      side: (
        <g>
          <rect {...stroke} x="94" y="44" width="34" height="70" rx="8" />
          <rect {...stroke} x="38" y="58" width="34" height="14" rx="3" />
          <path {...stroke} d="M55 72 L55 114" />
          <path {...stroke} d="M14 28 L58 28 M36 28 L36 114" />
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
      // Top (150×250): the classic grand outline, keys upstage.
      top: (
        <g>
          <path {...stroke} d="M12 6 L138 6 L138 120 C138 200 104 242 58 242 L12 242 Z" />
          <path {...stroke} d="M12 30 L138 30" />
        </g>
      ),
      // Front (150×100): lid, keybed, legs.
      front: (
        <g>
          <rect {...stroke} x="6" y="10" width="138" height="28" />
          <rect {...stroke} x="6" y="38" width="138" height="16" />
          <path {...stroke} d="M20 54 L20 94 M75 54 L75 94 M130 54 L130 94" />
        </g>
      ),
      // Side (250×100): body wedge with the raised lid line.
      side: (
        <g>
          <path {...stroke} d="M12 36 L160 36 L238 8 L238 52 L12 52 Z" />
          <path {...stroke} d="M28 52 L28 94 M215 52 L215 94 M110 52 L110 78 L130 78" />
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
      // Top (150×60): body slab + protruding keybed.
      top: (
        <g>
          <rect {...stroke} x="4" y="4" width="142" height="34" />
          <rect {...stroke} x="14" y="38" width="122" height="16" />
          <path {...stroke} d="M38 38 L38 54 M63 38 L63 54 M87 38 L87 54 M112 38 L112 54" />
        </g>
      ),
      // Front (150×125): tall body, keybed, legs.
      front: (
        <g>
          <rect {...stroke} x="4" y="4" width="142" height="68" />
          <rect {...stroke} x="4" y="72" width="142" height="16" />
          <path {...stroke} d="M30 72 L30 88 M60 72 L60 88 M90 72 L90 88 M120 72 L120 88" />
          <path {...stroke} d="M14 88 L14 121 M136 88 L136 121" />
        </g>
      ),
      // Side (60×125): tall slab with the keybed sticking out.
      side: (
        <g>
          <rect {...stroke} x="14" y="4" width="30" height="70" />
          <path {...stroke} d="M44 60 L54 60 L54 74 L44 74" />
          <path {...stroke} d="M20 74 L20 121 M48 74 L48 121" />
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
      // Top (130×40): the keybed from above.
      top: (
        <g>
          <rect {...stroke} x="3" y="4" width="124" height="32" />
          <path {...stroke} d="M3 17 L127 17" />
          <path {...stroke} d="M19 17 L19 36 M35 17 L35 36 M51 17 L51 36 M67 17 L67 36 M83 17 L83 36 M99 17 L99 36 M115 17 L115 36" />
        </g>
      ),
      // Front (130×95): keyboard on an X-stand.
      front: (
        <g>
          <rect {...stroke} x="8" y="34" width="114" height="12" />
          <path {...stroke} d="M26 46 L26 34 M46 46 L46 34 M66 46 L66 34 M86 46 L86 34 M106 46 L106 34" />
          <path {...stroke} d="M35 46 L95 90 M95 46 L35 90 M24 90 L46 90 M84 90 L106 90" />
        </g>
      ),
      // Side (40×95): slab + X-stand profile.
      side: (
        <g>
          <rect {...stroke} x="7" y="36" width="26" height="8" />
          <path {...stroke} d="M11 44 L29 88 M29 44 L11 88" />
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
      // Top (45×40): body + neck at an angle (on a stand).
      top: (
        <g>
          <circle {...stroke} cx="16" cy="26" r="12" />
          <circle {...stroke} cx="23" cy="17" r="8" />
          <circle {...stroke} cx="19" cy="22" r="3.5" />
          <path {...stroke} d="M29 11 L43 2" />
        </g>
      ),
      // Front (45×110): standing on a stand.
      front: (
        <g>
          <circle {...stroke} cx="22" cy="82" r="19" />
          <circle {...stroke} cx="22" cy="57" r="13" />
          <circle {...stroke} cx="22" cy="68" r="5" />
          <path {...stroke} d="M19 4 L19 44 M25 4 L25 44 M16 4 L28 4" />
          <path {...stroke} d="M8 106 L17 94 M36 106 L27 94" />
        </g>
      ),
      // Side (40×110): thin body in profile.
      side: (
        <g>
          <path {...stroke} d="M17 50 L26 50 L28 100 L14 100 Z" />
          <path {...stroke} d="M21 4 L20 50" />
          <path {...stroke} d="M8 106 L15 96 M32 106 L27 98" />
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
      // Top (40×35): waisted body + neck at an angle.
      top: (
        <g>
          <path {...stroke} d="M8 30 C3 30 2 24 6 21 C2 18 4 12 9 13 C12 13 14 15 15 17 L18 22 C19 26 15 30 8 30 Z" />
          <path {...stroke} d="M17 18 L38 3" />
        </g>
      ),
      // Front (40×100): standing solid-body.
      front: (
        <g>
          <path {...stroke} d="M20 50 C29 50 33 58 29 64 C36 68 34 82 26 87 C22 91 18 91 14 87 C6 82 4 68 11 64 C7 58 11 50 20 50 Z" />
          <path {...stroke} d="M17 4 L17 50 M23 4 L23 50 M14 4 L26 4" />
          <path {...stroke} d="M7 96 L14 88 M33 96 L26 88" />
        </g>
      ),
      // Side (35×100): slim slab + neck.
      side: (
        <g>
          <path {...stroke} d="M15 52 L22 52 L24 88 L13 88 Z" />
          <path {...stroke} d="M18 4 L17 52" />
          <path {...stroke} d="M8 96 L14 89 M28 96 L23 90" />
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
      // Top (45×35): longer neck than the electric guitar.
      top: (
        <g>
          <path {...stroke} d="M8 30 C3 30 2 24 6 21 C3 18 5 13 10 14 C13 14 15 16 16 18 L18 23 C19 27 14 30 8 30 Z" />
          <path {...stroke} d="M17 19 L43 2" />
        </g>
      ),
      // Front (45×120): long-scale standing bass guitar.
      front: (
        <g>
          <path {...stroke} d="M22 66 C30 66 34 73 31 79 C37 83 35 95 27 100 C24 103 20 103 17 100 C9 95 7 83 13 79 C10 73 14 66 22 66 Z" />
          <path {...stroke} d="M19 4 L19 66 M25 4 L25 66 M16 4 L28 4" />
          <path {...stroke} d="M9 114 L16 102 M35 114 L28 102" />
        </g>
      ),
      // Side (35×120): slim slab + long neck.
      side: (
        <g>
          <path {...stroke} d="M15 68 L22 68 L24 102 L13 102 Z" />
          <path {...stroke} d="M18 4 L17 68" />
          <path {...stroke} d="M8 114 L14 104 M28 114 L23 104" />
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
      // Top (50×45): body outline leaning on a stand, neck upstage.
      top: (
        <g>
          <path {...stroke} d="M25 12 C33 12 37 16 37 21 C37 24 35 26 35 29 C35 34 40 36 40 40 C40 43 33 43 25 43 C17 43 10 43 10 40 C10 36 15 34 15 29 C15 26 13 24 13 21 C13 16 17 12 25 12 Z" />
          <path {...stroke} d="M25 12 L25 2" />
        </g>
      ),
      // Front (50×130): classic waisted silhouette, endpin down.
      front: (
        <g>
          <path {...stroke} d="M25 34 C36 34 41 41 41 48 C41 53 37 56 37 61 C37 68 44 71 44 79 C44 92 35 100 25 100 C15 100 6 92 6 79 C6 71 13 68 13 61 C13 56 9 53 9 48 C9 41 14 34 25 34 Z" />
          <path {...stroke} d="M25 34 L25 8 M20 8 L30 8" />
          <circle {...stroke} cx="25" cy="5" r="2.5" />
          <path {...stroke} d="M25 100 L25 126 M20 126 L30 126" />
          <path {...stroke} d="M19 58 L19 72 M31 58 L31 72" />
        </g>
      ),
      // Side (45×130): narrow slab, neck and endpin.
      side: (
        <g>
          <path {...stroke} d="M19 36 L27 36 L31 98 L15 98 Z" />
          <path {...stroke} d="M23 36 L23 8" />
          <path {...stroke} d="M23 98 L24 126" />
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
      // Top (55×20): tubing + bell flare, valves as dots.
      top: (
        <g>
          <path {...stroke} d="M3 7 L36 7 M3 13 L36 13 M3 7 L3 13" />
          <path {...stroke} d="M36 7 C45 7 46 2 53 2 L53 18 C46 18 45 13 36 13" />
          <circle {...filled} cx="15" cy="10" r="1.8" />
          <circle {...filled} cx="21" cy="10" r="1.8" />
          <circle {...filled} cx="27" cy="10" r="1.8" />
        </g>
      ),
      // Front (55×15): tubing with valve stems and the bell circle.
      front: (
        <g>
          <path {...stroke} d="M3 8 L39 8" />
          <path {...stroke} d="M15 8 L15 3 M21 8 L21 3 M27 8 L27 3" />
          <circle {...stroke} cx="47" cy="8" r="6" />
        </g>
      ),
      // Side (20×15): looking into the bell.
      side: (
        <g>
          <circle {...stroke} cx="10" cy="7.5" r="6" />
          <circle {...stroke} cx="10" cy="7.5" r="2" />
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
      // Top (30×40): bell opening + body curve from above.
      top: (
        <g>
          <circle {...stroke} cx="13" cy="28" r="9" />
          <circle {...stroke} cx="13" cy="28" r="3" />
          <path {...stroke} d="M13 19 C13 10 18 6 24 3" />
        </g>
      ),
      // Front (30×80): body down, U-bend, bell up; mouthpiece kink.
      front: (
        <g>
          <path {...stroke} d="M19 6 L26 2" />
          <path {...stroke} d="M19 6 C17 20 17 34 17 46 C17 62 13 70 9 68 C4 66 4 58 8 54 C10 52 13 53 14 56" />
          <path {...stroke} d="M17 20 L13 20 M17 30 L13 30 M17 40 L13 40" />
        </g>
      ),
      // Side (40×80): same silhouette, wider bell swing.
      side: (
        <g>
          <path {...stroke} d="M22 6 L30 2" />
          <path {...stroke} d="M22 6 C20 22 20 36 20 46 C20 62 15 70 10 68 C4 66 4 56 10 53 C14 51 17 54 17 58" />
        </g>
      ),
    },
  },
]

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
  if (!icon) return '0 0 100 100'
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
const placeholderGlyph = (
  <g>
    <rect {...stroke} x="6" y="6" width="88" height="88" strokeDasharray="8 6" />
    <path {...stroke} d="M30 70 L50 30 L70 70 M38 56 L62 56" />
  </g>
)

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
