import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/**
 * True on phone-width viewports (below the project's existing `md`
 * breakpoint — see research.md R1). Desktop layouts never read this;
 * every consumer is an additive mobile-only branch (FR-016).
 */
export function useIsMobile(): boolean {
  // Guarded so a component that branches on reach can be rendered without a
  // browser. The project's tests are `renderToStaticMarkup` with no DOM
  // (constitution), which made every mobile-branching component untestable —
  // `ui/Drawer` has no test for exactly this reason. There is no viewport when
  // there is no window, and a phone layout is never the right default.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
