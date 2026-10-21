import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, Search, X } from 'lucide-react'
import { Input } from './Input'
import { Sheet } from './Sheet'

/**
 * One entry in the bar's overflow.
 *
 * There is no `disabled` and no `hidden`, deliberately: a role that may not perform an
 * action gets no entry, which is P7 and is how `primaryAction` already works. A control
 * that does nothing is a control that lies.
 */
export interface PanelAction {
  /** What the row says. Sentence case, an active verb: "Open Rig", "Export PDF". */
  label: string
  /** Drawn, never a target — the row is the target. */
  icon?: ReactNode
  /** One value the desktop's own control already shows: a count, a file kind. */
  hint?: string
  onClick: () => void
}

/**
 * One row of the overflow's sheet.
 *
 * Exported only so its geometry can be pinned: `ui/Sheet` renders nothing while closed,
 * and a 52px minimum that no test can reach is exactly the kind of value this project
 * has already lost twice (audit.md M2, and Slice 34's F3). It has one caller, below.
 */
export function PanelActionRow({ action, onDone }: { action: PanelAction; onDone: () => void }) {
  return (
    <button
      className="flex min-h-[52px] w-full items-center gap-3 border-b border-zinc-800/60 px-3 text-left last:border-b-0"
      onClick={() => {
        onDone()
        action.onClick()
      }}
      type="button"
    >
      {/* Drawn, not pressed: the row is the target. */}
      <span className="flex w-5 flex-none justify-center text-zinc-400">{action.icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{action.label}</span>
      {action.hint && <span className="flex-none text-xs text-zinc-500">{action.hint}</span>}
    </button>
  )
}

interface MobilePanelProps {
  /**
   * The surface's name. Repeats the section above it, deliberately (patterns.md §1).
   *
   * A node, because on a surface that is genuinely *one of N at a time* the name is a
   * control: the vocabularies have a rail on the desktop and none on a phone, so their
   * panel is named by a `MobilePicker` rather than by the word *Vocabularies* with the
   * useful half truncated beside it.
   */
  title: ReactNode
  /**
   * One thing that belongs *to the title* rather than to the bar — today an
   * `InfoToggle`, and only that.
   *
   * It sits inside the title's own line, before the flexible gap, so it costs the bar no
   * width and no row. That is the whole reason it is not just another `actions` entry:
   * an `i` on the right, among the 44 px targets, reads as a fourth control rather than
   * as a footnote to the name.
   */
  titleAdornment?: ReactNode
  /** The query. Omit both this and `onSearch` to render no search control at all. */
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  /**
   * Bar controls that change **what you are looking at** — a category, a vocabulary, a
   * plot, a view. Visible, between the flexible gap and the search target.
   *
   * A node rather than a prop each, so this component never grows one per surface
   * (Slice 34 research R1). It stays a node because a selector's shape is the surface's
   * own business: Inventories draws a filter icon with a count, Settings draws a
   * truncating name, Stage Plots draws a three-way segment.
   */
  actions?: ReactNode
  /**
   * Bar controls that **do a thing and are finished** — Open Rig, Print, an export.
   *
   * The other half of the rule `actions` states, and the opposite call about typing:
   * a **typed list**, because the sheet these open is always the same shape and six
   * callers each building it is how two of them end up different (Slice 35 research R1).
   *
   * The panel renders them: nothing at all when empty, the action's own 44px target
   * when there is exactly one, and a `⋯` opening a sheet when there are more. A single
   * control does not earn a menu, and no caller decides which case it is in.
   *
   * `patterns.md` §7b specified this in Wave 6b and nothing implemented it, because in
   * 6b nothing overflowed. The bar has 317px at 375, and Audio Inputs' five targets
   * need 350.
   */
  overflow?: PanelAction[]
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
 * nine compromises. Everything only some surfaces have arrives through `actions` or
 * `overflow`, and which one is a rule rather than a judgement:
 *
 * > **A control that changes *what you are looking at* stays in the bar (`actions`).
 * > A control that *does a thing and is finished* goes in the overflow.**
 *
 * It is not a size test, so it cannot drift as a title changes, and it settles all nine
 * surfaces without any of them measuring anything: a category, a vocabulary, a plot and
 * a view are visible; Open Rig, Print and three exports are not. The bar has **317 px**
 * at 375 — 375 less the body's `px-4` twice, less this component's two borders, less the
 * bar's own `px-3` — and Audio Inputs' five targets need 350 of it.
 *
 * **The panel scrolls, not the page** (Wave 6c). It fills the body and only its rows
 * region moves, so the bar and the strip are on screen at every scroll position — which
 * is what a strip is *for*, on the device where someone is standing in the room the plan
 * describes.
 *
 * 6b built this and reverted it in the same slice, having got one half of the flex rule.
 * The three phone surfaces that were not panels then — `OverviewTab`'s `Card`, and
 * `PatchPanel` as reached by event Settings and by `/my-defaults` — both carry
 * `overflow-hidden`, which gives a flex item an automatic minimum size of *zero*, so
 * they were free to collapse below their content and clipped with no scrollbar anywhere.
 * All three are panels as of this slice. See `Layout`'s phone return for both halves of
 * the rule.
 */
export function MobilePanel({
  title,
  titleAdornment,
  search,
  onSearch,
  searchPlaceholder,
  actions,
  overflow,
  primaryAction,
  strip,
  children,
}: MobilePanelProps) {
  const searchable = onSearch != null
  const [opened, setOpened] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)
  const actionList = overflow ?? []
  const lone = actionList.length === 1 ? actionList[0] : undefined

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
    /*
      `min-h-0 flex-1`: the panel fills the body the shell gives it and may shrink inside
      it (Wave 6c). A flex item rather than `h-full`, so a sibling — an error banner, a
      dropped-lines block — takes the height it needs instead of pushing a 100%-height
      panel past the viewport. Every container that holds one is a flex column; see
      `Layout`'s phone return for both halves of the minimum-size rule.
    */
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
          {title}
          {titleAdornment}
        </span>
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
        {/*
          One action renders as itself; two or more collapse behind `⋯`. The rule is
          here rather than at nine call sites because it is arithmetic about a 317px
          bar, and a caller that has to decide it will decide it differently.
        */}
        {lone && (
          <button
            aria-label={lone.label}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
            onClick={lone.onClick}
            type="button"
          >
            {lone.icon ?? <MoreHorizontal className="h-4 w-4" />}
          </button>
        )}
        {actionList.length > 1 && (
          <button
            aria-label="More actions"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400"
            onClick={() => setOverflowOpen(true)}
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
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

      {/*
        The rows own no padding and no gap: they are separated by a hairline, not by air,
        which is what makes eight of them read as one list rather than eight objects.

        **And this is the one element on a phone surface that scrolls** (Wave 6c). Both
        classes are load-bearing and 6b had only the first: `min-h-0` so it may shrink
        below its content, `overflow-y-auto` — never `hidden` — so what does not fit is
        reachable. The bar above it and the strip below it are `flex-none`, which is what
        keeps the verdict on screen at every scroll position.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {/* A sibling of the rows, never inside them — the same invariant `ui/Sheet`'s
          footer has, one edge over. It is what closes the panel, so it cannot be part
          of what the panel contains. */}
      {strip}

      {/*
        The overflow's sheet is built here and never by a caller. It is a run of
        labelled actions and nothing else, so it takes `SectionSwitcher`'s 52px row —
        the phone has one list-of-destinations shape and this is the second thing to
        use it.
      */}
      {actionList.length > 1 && (
        <Sheet flush onClose={() => setOverflowOpen(false)} open={overflowOpen} title={title}>
          {actionList.map((action) => (
            <PanelActionRow action={action} key={action.label} onDone={() => setOverflowOpen(false)} />
          ))}
        </Sheet>
      )}
    </div>
  )
}
