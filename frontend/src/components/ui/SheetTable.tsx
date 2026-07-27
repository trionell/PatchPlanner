import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

/**
 * The audio sheets' own table (Slice 25 US3).
 *
 * Deliberately *not* a change to `ui/Table`: six other tabs render that one and
 * FR-039 requires them unchanged. This is the mockup's density — headings as mono
 * micro-labels on a darker ground, one-line rows, striping you have to look for —
 * which would be wrong on an equipment list and is right on a patch sheet a planner
 * reads two hundred rows of.
 *
 * Sizes are the mockup's ratios at this app's 14px base, not its 11px pixel values
 * (see specs/025-patch-visual-language/research.md R11).
 */

export function SheetTable({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse', className)} {...props} />
}

export function SheetHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-zinc-950/60', className)} {...props} />
}

export function SheetHeadCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-zinc-800 px-2 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500',
        className,
      )}
      {...props}
    />
  )
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />
}

interface SheetRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Alternate rows carry a barely-there tint — an aid, never a pattern. */
  striped?: boolean
  /** This row's editor is open, so the two read as one block. */
  open?: boolean
}

export function SheetRow({ className, striped, open, ...props }: SheetRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-zinc-800/60',
        striped && !open && 'bg-white/[0.014]',
        open ? 'border-b-0 bg-amber-500/[0.04] hover:bg-amber-500/[0.04]' : 'hover:bg-zinc-800/40',
        className,
      )}
      {...props}
    />
  )
}

export function SheetCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-2 py-1 align-middle text-xs text-zinc-200', className)} {...props} />
}

/** A numeric cell. Tabular figures are what make a column of numbers a column. */
export function NumCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <SheetCell className={cn('font-mono tabular-nums text-zinc-400', className)} {...props} />
}

/**
 * The row's tape colour, as a bar immediately before its name — which is where a
 * technician looks, because it is where the tape is on the actual channel strip.
 * It used to be an inset shadow on the number cell, which reads as a table
 * decoration rather than as a property of the channel.
 */
export function TapeBar({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-3.5 w-[3px] shrink-0 rounded-sm align-middle"
      style={{ backgroundColor: color ?? '#3f3f46' }}
    />
  )
}

/**
 * A bus membership. Smaller than the app's `Badge`, which is sized for a card
 * header — at two or three per row on two hundred rows, a full-size badge is what
 * makes a sheet look like a form.
 */
export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium', className)}
      {...props}
    />
  )
}

/** 48 V is a red bar, never a dot — every circle on the patch surfaces is a port. */
export function PhantomBar() {
  return (
    <span
      title="48 V phantom power on"
      aria-label="48 V on"
      className="inline-block h-[3px] w-2 rounded-sm bg-red-500 align-middle shadow-[0_0_5px_rgba(239,68,68,0.65)]"
    />
  )
}
