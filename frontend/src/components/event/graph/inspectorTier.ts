import { useIsMobile } from '../../../hooks/useIsMobile'

/**
 * Which size a flow inspector's own controls take: `sm` on a desk, `md` in a hand.
 *
 * The rail is the one surface in the application where a phone's control geometry is not
 * already the default. `Input`, `Select` and `Button` all default to the `h-10` a finger
 * wants, and the rail deliberately overrides them down to `sm` and `h-7`, because a
 * 240 px column cannot afford 40 px rows. A phone has no column, so the override does
 * not apply — `design/tokens.md` §7 amendment 2, *type is read, geometry is touched*.
 *
 * A hook rather than sixteen inline ternaries across two inspectors: sixteen copies of
 * one rule is fifteen chances to miss one, and a missed one is invisible in review
 * (Slice 36 research R9).
 *
 * It lives beside `tokens.ts` rather than in `InspectorRail.tsx` for the same reason
 * that file exists: a module that exports a component and a hook together breaks fast
 * refresh, and this is not a component.
 */
export function useInspectorControlSize(): 'sm' | 'md' {
  return useIsMobile() ? 'md' : 'sm'
}
