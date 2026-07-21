import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/**
 * True on phone-width viewports (below the project's existing `md`
 * breakpoint — see research.md R1). Desktop layouts never read this;
 * every consumer is an additive mobile-only branch (FR-016).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
