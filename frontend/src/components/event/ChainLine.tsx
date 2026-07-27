import { Fragment } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * One signal chain, hop by hop (Slice 28 US3).
 *
 * A chain is a **fixed-pitch string** — one of the four things mono exists for
 * (design/tokens.md §4). Signal Flow used to set them in proportional 14 px sans,
 * so hop *n* of two adjacent rows started at two different x positions and the eye
 * could not run down the column. On a load-in sheet, in a dark room, that is the
 * whole job of the tab.
 *
 * **Not `ChainCell`.** That renders `outputChainSegments`, a different model from
 * the `FlowHop[]` this tab walks, and converting one into the other for
 * presentation would be the abstraction rather than the fix (Principle V). What is
 * shared is the *values*, which is the claim that matters:
 *
 * - the arrow is quieter than the hops it separates;
 * - amber-300 marks a hop through the desk's own socket — the one hop on a run
 *   that is **not** a billable cable;
 * - a missing link is amber **and** a triangle, never colour alone (P5), so it
 *   survives a greyscale print and a colour-blind reader.
 */

/** The common shape of both flow models' hops. */
export interface ChainHop {
  label: string
  missing: boolean
  detail?: string
  node?: { kind: string }
}

export function ChainLine({ hops, tail }: { hops: ChainHop[]; tail?: string }) {
  return (
    <span className="flex flex-wrap items-baseline font-mono text-[11px] tabular-nums text-zinc-300">
      {hops.map((hop, index) => (
        <Fragment key={index}>
          {index > 0 && <Arrow />}
          <Hop hop={hop} />
        </Fragment>
      ))}
      {tail && (
        <>
          {hops.length > 0 && <Arrow />}
          <span className="whitespace-nowrap text-zinc-400">{tail}</span>
        </>
      )}
    </span>
  )
}

/** A path with nothing feeding it at all — a gap, not an empty chain. */
export function ChainGap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </span>
  )
}

function Arrow() {
  return (
    <span aria-hidden className="px-0.5 text-zinc-600">
      →
    </span>
  )
}

function Hop({ hop }: { hop: ChainHop }) {
  const desk = hop.node?.kind === 'console_local'
  const tone = hop.missing ? 'text-amber-400 font-medium' : desk ? 'text-amber-300' : 'text-zinc-300'
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${tone}`}>
      {hop.missing && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      {hop.label}
      {hop.detail && <span className="text-zinc-500">({hop.detail})</span>}
    </span>
  )
}
