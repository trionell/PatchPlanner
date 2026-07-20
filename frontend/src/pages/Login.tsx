import { Cable } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { loginUrl } from '../api/auth'
import { useCurrentUser } from '../hooks/useCurrentUser'

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "This Google account isn't authorized for PatchPlanner.",
  state_mismatch: 'Sign-in failed — please try again.',
  exchange_failed: 'Sign-in failed — please try again.',
}

export function LoginPage() {
  const { user, isLoading } = useCurrentUser()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  if (!isLoading && user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm space-y-6 px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg bg-amber-500/15 p-3 text-amber-400">
            <Cable className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">PatchPlanner</h1>
            <p className="mt-1 text-sm text-zinc-400">AVL event planning</p>
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {ERROR_MESSAGES[error] ?? 'Sign-in failed — please try again.'}
          </p>
        )}
        <a
          href={loginUrl}
          className="inline-flex w-full items-center justify-center rounded-md border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
