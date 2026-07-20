import { Cable, CalendarRange, LayoutDashboard, LogOut, Package2, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { logout } from '../api/auth'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { cn } from '../lib/utils'

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

  async function handleLogout() {
    await logout()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-zinc-800 bg-zinc-900 px-4 py-6 print:hidden">
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-400">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-zinc-100">PatchPlanner</div>
            <div className="text-xs text-zinc-400">AVL event planning</div>
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
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-8 py-5 backdrop-blur print:hidden">
          <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
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
