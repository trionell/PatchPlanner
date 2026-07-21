import {
  Cable,
  ClipboardList,
  FileSpreadsheet,
  Lightbulb,
  Printer,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { loginUrl } from '../api/auth'

type Feature = {
  icon: LucideIcon
  tag: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Cable,
    tag: 'AUDIO / INPUT',
    title: 'Full input patch lists',
    description:
      "Channel, signal type, connector, stagebox, multicore, mic model, cable, and 48V — with mix groups, DCAs, and console colors per channel.",
  },
  {
    icon: Waypoints,
    tag: 'AUDIO / OUTPUT',
    title: 'Signal-flow graph',
    description:
      'Drag the console, stageboxes, amps, and speakers onto a canvas and wire real port-to-port cable runs — multi-hop and fan-out included.',
  },
  {
    icon: Lightbulb,
    tag: 'LIGHTING / DMX',
    title: 'Lighting rig & DMX',
    description:
      'Batch-add fixtures onto truss, auto-assign DMX addresses and universes, and track GrandMA fixture IDs with duplicates flagged.',
  },
  {
    icon: ClipboardList,
    tag: 'RENTAL ORDER',
    title: 'Rental order, generated',
    description:
      "Every mic, cable, stand, and fixture on the plan is counted automatically and flagged the moment it exceeds the renter's stock.",
  },
  {
    icon: FileSpreadsheet,
    tag: 'EXPORT',
    title: 'One-click Excel export',
    description:
      "Quantities drop straight into the renter's own order sheet, at the right rows — anything that can't be placed is reported, never dropped.",
  },
  {
    icon: Printer,
    tag: 'ON SITE',
    title: 'Print sheets & signal trace',
    description:
      'Clean paper copies of every tab for load-in, plus a per-channel trace from source to console for chasing down a dead line.',
  },
]

const CABLE_PATHS = [
  'M 100,48 C 100,110 70,120 70,190',
  'M 220,48 C 220,100 190,120 190,190',
  'M 280,48 C 280,120 310,110 310,190',
]
const LIVE_CABLE_PATH = 'M 40,48 C 40,120 340,90 340,190'

function BrandBadge({ className = 'h-[34px] w-[34px] rounded-[9px]' }: { className?: string }) {
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_6px_18px_-6px_rgba(245,158,11,0.55)] ${className}`}
    >
      <Cable className="h-[55%] w-[55%] text-amber-950" strokeWidth={2.4} />
    </span>
  )
}

function LedDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.75)] ${className}`}
    />
  )
}

function SignInButton({
  className = '',
  children = 'Sign in with Google',
}: {
  className?: string
  children?: string
}) {
  return (
    <a
      href={loginUrl}
      className={`inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-amber-500 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(245,158,11,0.65)] transition-transform hover:-translate-y-px hover:bg-amber-400 ${className}`}
    >
      {children}
    </a>
  )
}

function PatchBayGraphic() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 pb-2.5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]"
    >
      <div className="mb-2.5 flex items-center justify-between px-0.5 text-[10.5px] tracking-wider text-zinc-500">
        <span>INPUT PATCH — FOH RIG</span>
        <span className="flex items-center gap-1.5 text-green-400">
          <LedDot />
          SIGNAL
        </span>
      </div>
      <svg
        viewBox="0 0 460 230"
        width="100%"
        role="img"
        aria-label="Stylised patch bay showing cables connecting input and output jacks"
      >
        <g className="font-mono">
          {[40, 100, 160, 220, 280, 340, 400].map((x, i) => (
            <text key={x} x={x} y="30" textAnchor="middle" className="fill-zinc-500 text-[9px]">
              {String(i + 1).padStart(2, '0')}
            </text>
          ))}
        </g>
        <g stroke="#3f3f46" strokeWidth="1.2">
          {[40, 100, 160, 220, 280, 340, 400].map((x) => (
            <circle key={x} cx={x} cy="48" r="9" fill="#18181b" />
          ))}
        </g>
        <g fill="#09090b">
          {[40, 100, 160, 220, 280, 340, 400].map((x) => (
            <circle key={x} cx={x} cy="48" r="3.4" />
          ))}
        </g>

        <g stroke="#3f3f46" strokeWidth="1.2">
          {[70, 130, 190, 250, 310, 370].map((x) => (
            <circle key={x} cx={x} cy="190" r="9" fill="#18181b" />
          ))}
        </g>
        <g fill="#09090b">
          {[70, 130, 190, 250, 310, 370].map((x) => (
            <circle key={x} cx={x} cy="190" r="3.4" />
          ))}
        </g>
        <g className="font-mono">
          <text x="70" y="212" textAnchor="middle" className="fill-zinc-500 text-[9px]">
            STBX-A
          </text>
          <text x="190" y="212" textAnchor="middle" className="fill-zinc-500 text-[9px]">
            STBX-B
          </text>
          <text x="310" y="212" textAnchor="middle" className="fill-zinc-500 text-[9px]">
            OUT
          </text>
        </g>

        {CABLE_PATHS.map((d) => (
          <path key={d} d={d} fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
        ))}
        <path d={LIVE_CABLE_PATH} fill="none" stroke="#f59e0b" strokeWidth="2.25" strokeLinecap="round" />

        <circle className="pp-pulse-dot" r="3.6" style={{ offsetPath: `path('${LIVE_CABLE_PATH}')` }} />
      </svg>
    </div>
  )
}

export function StartPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-7 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandBadge />
            <span className="truncate text-[16.5px] font-bold tracking-tight">PatchPlanner</span>
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 sm:inline-flex">
              <LedDot />
              Closed beta
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3.5">
            <a href="#features" className="hidden text-sm text-zinc-400 hover:text-zinc-100 sm:inline">
              What it does
            </a>
            <SignInButton className="whitespace-nowrap px-3.5 py-1.5 text-[13px]" />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-zinc-800 bg-[radial-gradient(680px_420px_at_82%_-10%,rgba(245,158,11,0.10),transparent_60%),radial-gradient(500px_300px_at_10%_110%,rgba(245,158,11,0.05),transparent_60%)] py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-7 md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-[11.5px] font-semibold tracking-wide text-green-300">
                <LedDot />
                Closed beta — access by invite only
              </span>
              <h1 className="mb-5 font-mono text-4xl font-bold leading-[1.08] tracking-tight sm:text-[44px]">
                Patch the whole show
                <br />
                before you touch <span className="text-amber-500">a single cable.</span>
              </h1>
              <p className="mb-7 max-w-[46ch] text-[17px] leading-relaxed text-zinc-400">
                PatchPlanner is where touring and event audio, lighting, and video crews build the
                patch list, the signal-flow graph, and the lighting rig — then generate the rental
                order and load-in paperwork automatically.
              </p>
              <div className="mb-4 flex flex-wrap gap-3">
                <SignInButton />
                <a
                  href="#features"
                  className="inline-flex items-center justify-center rounded-md border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
                >
                  See what&apos;s inside
                </a>
              </div>
              <p className="text-[12.5px] text-zinc-500">
                Invite-only right now — <span className="font-mono text-zinc-400">request access</span>{' '}
                at the bottom of this page.
              </p>
            </div>

            <PatchBayGraphic />
          </div>
        </section>

        <section id="features" className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-7">
            <div className="mb-10 max-w-xl">
              <p className="mb-3 font-mono text-xs font-semibold tracking-widest text-amber-500">
                // WHAT&apos;S PATCHED IN
              </p>
              <h2 className="mb-3 text-2xl font-semibold tracking-tight sm:text-[29px]">
                Everything a load-in needs, built to stay in sync.
              </h2>
              <p className="text-[15.5px] leading-relaxed text-zinc-400">
                One event, one source of truth — the patch, the rig, and the paperwork that goes to
                the renter all come from the same plan.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, tag, title, description }) => (
                <div key={title} className="bg-zinc-900 p-6">
                  <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-amber-500">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <span className="mb-2 block font-mono text-[10px] tracking-wider text-zinc-500">
                    {tag}
                  </span>
                  <h3 className="mb-2 text-[15.5px] font-semibold">{title}</h3>
                  <p className="text-[13.8px] leading-relaxed text-zinc-400">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-y border-zinc-800 bg-zinc-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-7 py-11">
            <p className="max-w-[56ch] text-[15px] text-zinc-400">
              <b className="text-zinc-100">Your gear, your vocabulary.</b> Personal equipment
              inventories, per-event reference data, and a &quot;My Defaults&quot; template mean
              PatchPlanner adapts to how your crew already works — not the other way round.
            </p>
            <a
              href={loginUrl}
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 px-3.5 py-1.5 text-[13px] font-semibold text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-850"
            >
              Sign in with Google
            </a>
          </div>
        </div>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-7">
            <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl border border-amber-500/25 bg-[linear-gradient(160deg,rgba(245,158,11,0.07),transparent_60%)] bg-zinc-900 px-7 py-9 sm:px-9">
              <div>
                <h2 className="mb-2.5 text-xl font-semibold sm:text-[22px]">Currently a closed beta</h2>
                <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-zinc-400">
                  PatchPlanner is being road-tested with a small group of touring and event
                  production crews. Accounts are added by invite while we work through the early
                  rough edges — if you&apos;d like in on the next round, get in touch.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="mailto:info@patchplanner.net"
                  className="inline-flex items-center justify-center rounded-md border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-850"
                >
                  Request access
                </a>
                <SignInButton />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-9">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-7">
          <div className="flex items-center gap-2.5 text-[13.5px] text-zinc-400">
            <BrandBadge className="h-6 w-6 rounded-[6px]" />
            PatchPlanner — AVL event planning
          </div>
          <div className="flex gap-5 text-[13.5px]">
            <a href="mailto:info@patchplanner.net" className="text-zinc-400 hover:text-zinc-100">
              Request access
            </a>
            <a href="#features" className="text-zinc-400 hover:text-zinc-100">
              What it does
            </a>
            <a href={loginUrl} className="text-zinc-400 hover:text-zinc-100">
              Sign in
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
