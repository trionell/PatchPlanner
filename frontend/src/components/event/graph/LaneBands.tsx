import { LANE_BAND_MIDDLE, LANE_BAND_OUTER, LANE_LABEL } from './tokens'

interface Lane {
  label: string
  /** Left edge in the canvas's own logical coordinates. */
  x: number
  width: number
}

/**
 * The canvas's three lanes, as tinted bands with their names inside them
 * (Slice 25 FR-019).
 *
 * The lanes used to be marked by dashed borders on the canvas's left and right
 * edges, with the names in a separate strip *above* the canvas next to the zoom
 * control. Two problems with that: a border marks an edge rather than a region, so
 * the middle lane had no marking at all; and the strip sat between the toolbar and
 * the content, which is what stopped the surface reading as one panel.
 *
 * The middle band is fainter than the outer two, as the mockup has it — the lane a
 * node can be dragged around should recede behind the ones that are fixed.
 */
export function LaneBands({ lanes, height }: { lanes: [Lane, Lane, Lane]; height: number }) {
  return (
    <>
      {lanes.map((lane, index) => (
        <div
          key={lane.label}
          aria-hidden
          className={`pointer-events-none absolute top-0 ${index === 1 ? LANE_BAND_MIDDLE : LANE_BAND_OUTER}`}
          style={{ left: lane.x, width: lane.width, height }}
        />
      ))}
      {lanes.map((lane) => (
        <span key={`${lane.label}-label`} className={`pointer-events-none absolute top-1.5 ${LANE_LABEL}`} style={{ left: lane.x + 8 }}>
          {lane.label}
        </span>
      ))}
    </>
  )
}
