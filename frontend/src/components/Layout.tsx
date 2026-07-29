import { Cable, CalendarRange, LayoutDashboard, LogOut, Package2, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useMatch } from 'react-router-dom'
import { getEvent } from '../api/events'
import { logout } from '../api/auth'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useIsMobile } from '../hooks/useIsMobile'
import { cn } from '../lib/utils'
import { MobileNav } from './mobile/MobileNav'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events', label: 'Events', icon: CalendarRange },
  { to: '/inventories', label: 'Inventories', icon: Package2 },
  { to: '/my-defaults', label: 'My Defaults', icon: Settings },
]

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/events/') && pathname !== '/events') return 'Event Detail'
  const item = navItems.find((entry) => entry.to === pathname)
  return item?.label ?? 'PatchPlanner'
}

export function Layout() {
  const location = useLocation()
  const { user } = useCurrentUser()
  const isMobile = useIsMobile()

  /*
    Which event am I holding? (Wave 6c.)

    The name was already on the phone — as an `h2` at the top of `EventDetail`'s body —
    but it was in the part of the page that scrolls, so on any list longer than a screen
    the answer scrolled off the top. The header is the one thing on this device that is
    on screen in all nine sections and never scrolls, and it was spending its title slot
    on the literal string `'Event Detail'`, which names the route rather than the thing.

    `['event', id]` is the key and the fetcher `EventDetail` already uses, so this shares
    one cache entry and one request — no context, no prop drilling, nothing new in the
    API layer. The fallback covers pending *and* error, so a slow connection shows the
    page title rather than a flash of `Event Detail` followed by a name.

    **Phone only**, and the query is gated on reach for the same reason. The desktop
    header already sits above an `h2` carrying the event's name, and it has a sidebar in
    the slot besides — putting the name in both would be this slice changing a desktop
    composition, which it may not do.
  */
  const eventMatch = useMatch('/events/:id')
  const eventId = Number(eventMatch?.params.id)
  const eventQuery = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
    enabled: isMobile && Number.isFinite(eventId),
  })
  const pageTitle = getPageTitle(location.pathname)
  const title = isMobile ? (eventQuery.data?.name ?? pageTitle) : pageTitle

  async function handleLogout() {
    await logout()
    window.location.href = '/'
  }

  if (isMobile) {
    /*
      **The panel scrolls, not the page** (Wave 6c). Every edge of the phone is a stated
      number and none of them is a sum.

      Wave 6b built this column so a panel could fill the body and keep its status strip
      on screen — which is what a strip is *for*, on the device where someone is standing
      in the room the plan describes — and reverted it in the same slice. The reason has
      two halves that pull in opposite directions, which is why one rule does not fix it:

        · A flex item whose own overflow is `visible` has an automatic minimum size of
          its **content**, so it refuses to shrink and pushes the column past the
          viewport — and the strip goes off screen again.
        · A flex item whose own overflow is `hidden`, `auto` or `scroll` has an automatic
          minimum size of **zero**, so it may collapse below its content — and with
          `hidden` there is no scrollbar to reveal what was lost.

      6b hit the second: `OverviewTab`'s `Card` and `PatchPanel` both carry
      `overflow-hidden`, so as flex items they were free to collapse, silently. Those
      three surfaces — Overview, event Settings and `/my-defaults` — are panels as of
      this slice, so the split is now by role rather than by element:

        · everything that is **not** the rows region is `flex-none`
        · the rows region is `flex-1 min-h-0 overflow-y-auto` — `min-h-0` so it may
          shrink, `overflow-y-auto` and **not** `hidden` so what does not fit is
          reachable. That pairing is what 6b was missing: it had the shrinking without
          the scrolling.

      `svh` and not `dvh`, for the reason tokens.md §7 already gives about the sheet:
      `dvh` is live, so the whole column would resize under the thumb as browser chrome
      collapses. The body's derived bottom padding is gone — `MobileNav` is a sibling in
      the column now, so there is nothing to reserve for, and the safe-area inset stays
      on the nav where it was.
    */
    return (
      <div className="flex h-[100svh] flex-col overflow-hidden bg-zinc-950 text-zinc-100 print:h-auto print:overflow-visible">
        <header className="flex h-14 flex-none items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className="rounded-md bg-amber-500/15 p-1.5 text-amber-400">
              <Cable className="h-4 w-4" />
            </div>
            {/* Truncating: a long event name loses its tail, which is the half you
                already know, and neither the brand mark nor the avatar moves. */}
            <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">{title}</span>
          </div>
          {user?.pictureUrl && (
            <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-full" />
          )}
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 print:block print:overflow-visible print:p-0">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/*
        The sidebar is the same ground as the content, separated by its rule
        rather than by being lighter than it. Chrome that advances is chrome you
        read before the work (P8); `bg-zinc-900` here made the navigation the
        brightest column on every screen.
      */}
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-zinc-800 bg-zinc-950 px-3 py-5 print:hidden">
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="rounded-md bg-amber-500/15 p-2 text-amber-400">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">PatchPlanner</div>
            <div className="text-xs text-zinc-500">AVL event planning</div>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-amber-500 bg-zinc-850 text-amber-400'
                      : 'border-transparent text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <div className="ml-60 min-h-screen print:ml-0">
        {/*
          `text-base`, not `text-2xl`: a 24 px page title above a 14 px panel
          title inverts the hierarchy, and the page name is the least useful
          thing on the screen to someone already looking at the page.
        */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-8 backdrop-blur print:hidden">
          <h1 className="text-base font-semibold text-zinc-100">{title}</h1>
          {user && (
            <div className="flex items-center gap-3">
              {user.pictureUrl && (
                <img
                  src={user.pictureUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full"
                />
              )}
              <span className="text-sm text-zinc-300">{user.name}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-850 hover:text-zinc-100"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </header>
        <main className="px-8 py-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
