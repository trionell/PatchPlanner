import { useState } from 'react'
import { CalendarRange, LayoutDashboard, LogOut, MoreHorizontal, Package2, Settings, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { logout } from '../../api/auth'
import { cn } from '../../lib/utils'

const primaryItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events', label: 'Events', icon: CalendarRange },
  { to: '/inventories', label: 'Inventories', icon: Package2 },
]

/** Phone-width replacement for Layout.tsx's fixed sidebar — a persistent bottom tab bar with the 3 primary destinations plus a "More" overflow sheet for My Defaults and sign-out (research.md R2). */
export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleLogout() {
    await logout()
    window.location.href = '/'
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]',
                  isActive ? 'text-amber-400' : 'text-zinc-400',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-zinc-400"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-zinc-950/80" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full rounded-t-xl border-t border-zinc-800 bg-zinc-900 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-zinc-100">More</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="text-zinc-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLink
              to="/my-defaults"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-850"
            >
              <Settings className="h-4 w-4" />
              My Defaults
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-850"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
