/**
 * The flow canvas's visual language, in one place (Slice 25).
 *
 * The approved mockup renders the whole application scaled down at an 11px base;
 * this app runs at 14px. So values here are the mockup's *ratios* applied at this
 * app's size, not its pixel numbers — copying those literally would produce
 * controls smaller than the ones the previous round complained about. Values that
 * are not type-relative (a border width, a corner radius, an alpha) are the
 * mockup's own.
 *
 * Exported as className strings rather than a theme object on purpose: the markup
 * is reviewed by holding it up against the mockup, and a lookup indirection makes
 * that harder, not easier. One table, read by name.
 *
 * See specs/025-patch-visual-language/contracts/visual-language.md for the
 * element-by-element source of these.
 */

/**
 * The mono, uppercase, wide-tracked label the whole surface uses for headings.
 *
 * Defined in `ui/Label.tsx` and re-exported here: it is not a canvas value — the
 * sheet header and the drawers render it too — but canvas code should keep having
 * one import for the values it draws with.
 */
export { MICRO_LABEL } from '../../ui/Label'

/** Node chrome. The radius and shadow are the mockup's own values. */
export const NODE_CHROME = 'rounded-[7px] border bg-zinc-850 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
export const NODE_BORDER = 'border-zinc-700'
/** A desk wears an amber border — it is the box every other box is arranged around. */
export const NODE_BORDER_DESK = 'border-amber-500/55'
export const NODE_BORDER_SELECTED = 'border-amber-500 ring-2 ring-amber-500/30'

export const NODE_HEADER = 'flex items-center gap-1.5 border-b border-zinc-800 px-1.5 py-1 text-[11px] font-semibold text-zinc-100'
export const NODE_BADGE = 'ml-auto shrink-0 rounded-[3px] bg-zinc-800 px-1 font-mono text-[10px] font-normal text-zinc-400'
export const NODE_BODY = 'py-1'
export const NODE_FOOTER = 'border-t border-zinc-800 px-1.5 pb-1 pt-0.5 font-mono text-[10px] text-zinc-500'

/** One port row. Fixed height is what makes a column of ports read as a rack. */
export const PORT_ROW = 'flex h-[18px] items-center gap-1.5 px-1.5 text-[11px]'
/**
 * A run heading inside a node (components.md §2): one port pitch tall, so the rack's
 * pitch holds. The Sheet's section heading at the canvas's pitch — MICRO_LABEL name,
 * fill flush right. Not a port: no dot, never a target.
 */
export const NODE_RUN = 'flex h-[18px] items-center gap-1.5 border-t border-zinc-800 px-1.5'
export const NODE_RUN_FILL = 'ml-auto font-mono text-[10px] tabular-nums text-zinc-500'
export const PORT_ROW_TEXT = 'text-zinc-300'

// No truncation limit here, deliberately. The mockup ends a long port list with a
// "⋯ N more" row, and it was built that way — but a planner working a patch has to
// see every jack, and a box that hides eight of them is not a readable box, it is an
// incomplete one. Boxes grow; the canvas scrolls.

/**
 * A source row in the rail. The height is deliberately *not* in here: a stereo
 * source is two port slots tall, and two competing height utilities in one class
 * string is decided by whichever Tailwind happens to emit last — which is how the
 * stereo rows ended up the same height as the mono ones, with their two port dots
 * overlapping inside a 20px row.
 */
export const SOURCE_ROW = 'flex items-center gap-1.5 border-b border-zinc-800/60 pr-1.5 text-[11px]'
/** One port slot. A stereo row is two of these; a mono row is one. */
export const SOURCE_ROW_HEIGHT = 20

/**
 * 48 V is a red bar, never a dot: every circle on this canvas is a port you can
 * patch, so the indicator differs from one in both hue and shape.
 */
export const PHANTOM_BAR = 'inline-block h-[3px] w-2 shrink-0 rounded-sm bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]'
export const PHANTOM_BAR_OFF = 'inline-block h-[3px] w-2 shrink-0 rounded-sm bg-zinc-700'

/*
  The lane bands and their label voice were here until Slice 37, which deleted them
  along with `LaneBands`. They were three tinted regions computed from the canvas
  width; on a plane there is no canvas width, and a band saying *Rig* is a claim about
  where nodes are that nothing constrains any more.
*/

/** A tape with no derived colour still reads as a tape, just an unassigned one. */
export const TAPE_NEUTRAL = '#3f3f46'
