import { Cable, CalendarRange, LayoutDashboard, LogOut, Package2, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const title = getPageTitle(location.pathname)
  const { user } = useCurrentUser()
  const isMobile = useIsMobile()

  async function handleLogout() {
    await logout()
    window.location.href = '/'
  }

  if (isMobile) {
    /*
      Both edges of the phone are stated numbers now, and neither is a sum.

      The body's bottom padding is `MobileNav`'s own `h-14` plus the inset that
      bar carries. `pb-20` was 80px, guessed at the height of a padding plus an
      icon plus a font size, plus an inset that varies by device — which is
      `top-[73px]` (audit.md A5) on the opposite edge of the screen. A height a
      sibling positions against has to be a value someone chose.

      The header takes the desktop header's `h-14` for the same reason, before
      anything positions against it rather than after (patterns.md §7a).

      **The shell is a fixed-height column** (Wave 6b), so the scrolling happens
      inside the surface rather than on the page. That is what lets a panel fill
      the body and scroll only its rows, which is what keeps its bar and its
      status strip on screen at every scroll position — a strip you have to
      scroll to is a strip nobody reads (audit.md M3). `svh` and not `dvh` or
      `vh`, for the reason tokens.md §7 gives about the sheet: `dvh` resizes
      live as browser chrome collapses, and `vh` is the largest viewport, so the
      nav would sit below the fold while the address bar shows.

      Print resets both, or a phone print would be clipped to one screen.
    */
    return (
      <div className="flex h-[100svh] flex-col bg-zinc-950 pb-[calc(3.5rem+env(safe-area-inset-bottom))] text-zinc-100 print:h-auto print:pb-0">
        <header className="flex h-14 flex-none items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur print:hidden">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-amber-500/15 p-1.5 text-amber-400">
              <Cable className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-zinc-100">{title}</span>
          </div>
          {user?.pictureUrl && (
            <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
          )}
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 print:overflow-visible print:p-0">
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
