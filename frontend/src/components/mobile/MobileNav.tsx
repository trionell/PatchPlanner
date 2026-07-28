import { useState } from 'react'
import { CalendarRange, LayoutDashboard, LogOut, MoreHorizontal, Package2, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { logout } from '../../api/auth'
import { cn } from '../../lib/utils'
import { Sheet } from '../ui/Sheet'

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

      {/* This was a correct bottom sheet written inline — the pattern existed
          in the tree and was not a component, which is the condition A1 and A3
          were both filed under. It is `ui/Sheet` now, and its `border-zinc-800`
          becomes the Frame role's `border-zinc-700` on the way (tokens.md §1). */}
      <Sheet flush open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <NavLink
          to="/my-defaults"
          onClick={() => setMoreOpen(false)}
          className="flex min-h-[52px] items-center gap-3 border-b border-zinc-800/60 px-4 text-sm text-zinc-200"
        >
          <Settings className="h-4 w-4 text-zinc-400" />
          My Defaults
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[52px] w-full items-center gap-3 border-b border-zinc-800/60 px-4 text-left text-sm text-zinc-200"
        >
          <LogOut className="h-4 w-4 text-zinc-400" />
          Sign out
        </button>
      </Sheet>
    </>
  )
}
