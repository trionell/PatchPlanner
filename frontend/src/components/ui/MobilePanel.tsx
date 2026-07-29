import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './Input'

interface MobilePanelProps {
  /** The surface's name. Repeats the section above it, deliberately (patterns.md §1). */
  title: string
  /** The query. Omit both this and `onSearch` to render no search control at all. */
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  /**
   * Surface-specific bar controls, between the flexible gap and the primary action:
   * Print, the rental exports, a category filter, and — from 6d — the Sheet | Flow
   * toggle. A node rather than a prop each, so this component never grows one per
   * surface (research.md R1).
   */
  actions?: ReactNode
  /** The one filled control on the surface, last in the bar. Absent for a role that cannot act (P7). */
  primaryAction?: ReactNode
  /** The surface's status rail. Absent where the desktop surface has none. */
  strip?: ReactNode
  children: ReactNode
}

/**
 * The phone's frame — bar, rows, strip (patterns.md §7b).
 *
 * P1 has no width condition, and this is it at 375 px. Before Wave 6b every phone
 * surface was a bare `space-y-*` stack: a heading, a search input, then rows as
 * free-standing `rounded-md border bg-zinc-900` cards on the page ground — P1's named
 * violation, in the Control role's colour, with nowhere for a status strip to close
 * (audit.md M1, M3).
 *
 * **It decides nothing about its rows.** Like `ui/Sheet`, that refusal is why it is a
 * component rather than a className: nine lists differing in tier, in what a row means
 * and in whether they have a strip at all get the same frame, and none of them can
 * negotiate it.
 *
 * Two things every phone bar has are props, because at 375 px there is room for a title
 * and three targets and that scarcity is what would otherwise tempt nine call sites into
 * nine compromises. Everything only some surfaces have arrives through `actions`.
 *
 * **The page scrolls, not the panel.** This slice tried it the other way — a
 * fixed-height shell, so the bar and the strip stayed on screen at every scroll
 * position — and reverted it in the same slice. A flex column makes every child a flex
 * item, and a flex item whose root is a scroll container has an automatic minimum size
 * of *zero*: the three phone surfaces that are not panels yet (`OverviewTab`'s Card,
 * and `PatchPanel` as reached by event Settings and by `/my-defaults`) were compressed
 * below their content and clipped, with no scrollbar anywhere. Those three are Wave
 * 6c's, and the shell can become a column once they are panels too.
 */
export function MobilePanel({
  title,
  search,
  onSearch,
  searchPlaceholder,
  actions,
  primaryAction,
  strip,
  children,
}: MobilePanelProps) {
  const searchable = onSearch != null
  const [opened, setOpened] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)

  /*
    Derived, not stored. A closed row and a non-empty query must not coexist, or the
    list is filtered by something the user cannot see — and holding that as local
    state made it a property of the *callers*, all of whom happen to mount the panel
    and the query together. Four of them share the query with a desktop branch whose
    field is always open, so typing at 800px and narrowing to 375 handed this
    component a query with the row shut.
  */
  const searchOpen = opened || (search ?? '') !== ''

  useEffect(() => {
    if (opened) fieldRef.current?.focus()
  }, [opened])

  /**
   * Closing always clears. The pair (closed, non-empty query) must not exist, or the
   * list is filtered by something the user cannot see (FR-013) — which is the failure
   * mode a search behind a tap has, and the only one worth guarding.
   */
  const closeSearch = () => {
    setOpened(false)
    onSearch?.('')
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-sm font-semibold text-zinc-100">{title}</span>
        <span className="flex-1" />
        {searchable && (
          <button
            aria-label={searchOpen ? 'Close search' : 'Search'}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
            onClick={() => (searchOpen ? closeSearch() : setOpened(true))}
            type="button"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        {actions}
        {primaryAction}
      </div>

      {/*
        The bar's second row, and only while searching. An always-open field costs 44px
        on every screen to serve something done on some of them, and it is what leaves
        today's bar with room for nothing else (patterns.md §7b: the bar wraps to two
        rows before it scrolls).
      */}
      {searchable && searchOpen && (
        <div className="flex flex-none items-center gap-2 border-b border-zinc-800 px-3 pb-2">
          <Input
            ref={fieldRef}
            onChange={(event) => onSearch?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeSearch()
            }}
            placeholder={searchPlaceholder}
            value={search ?? ''}
          />
          <button
            aria-label="Clear search"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400"
            onClick={closeSearch}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* The rows own no padding and no gap: they are separated by a hairline, not by
          air, which is what makes eight of them read as one list rather than eight
          objects. */}
      <div>{children}</div>

      {/* A sibling of the rows, never inside them — the same invariant `ui/Sheet`'s
          footer has, one edge over. It is what closes the panel, so it cannot be part
          of what the panel contains. */}
      {strip}
    </div>
  )
}
