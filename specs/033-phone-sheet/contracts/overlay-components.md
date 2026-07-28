# Contract — the three overlays

This project's contracts are usually HTTP. This slice has no endpoint, so the
contract is the component API and the structure it renders — which is what a
reviewer checks a diff against, and what 6b, 6c and 6d will be written to.

---

## 1 · `ui/Sheet` — new

```tsx
interface SheetProps {
  open: boolean
  onClose: () => void
  /** A string, or the rail's MicroLabel + Pill. */
  title: ReactNode
  subtitle?: string
  children: ReactNode
  /** The confirm row, or the drawer's statement line. Absent for the inspector. */
  footer?: ReactNode
  /** Off for the canvas inspector, and only it. Default true. */
  scrim?: boolean
  /** Contents that are a run of full-bleed rows own their padding. Default false. */
  flush?: boolean
}
```

**Nothing else.** No `variant`, no `size`, no `onSave`, no `width`, no field
layout. A prop that decides something about the contents belongs to the tenant,
not to the shell ([patterns.md](../../design/patterns.md) §7d).

### Rendered structure

```
scrim ─────────────────── fixed inset-0 z-50 flex items-end
                          bg-zinc-950/80 touch-none          [omitted if scrim={false}]
  panel ───────────────── w-full max-h-[85svh] flex flex-col
                          rounded-t-xl border-t border-zinc-700
                          bg-zinc-900 shadow-2xl
    header ───────────── flex-none · border-b border-zinc-800 · px-4 py-3.5
      title              text-lg font-semibold text-zinc-100      (or the node given)
      subtitle           text-xs text-zinc-500                    [if given]
      close              44px target, X at h-5 w-5, aria-label="Close"
    body ─────────────── flex-1 overflow-y-auto overscroll-contain
                          px-4 py-4 flex flex-col gap-3.5         [px-0 py-0 if flush]
    footer ───────────── flex-none · border-t border-zinc-800 · px-4 py-3
                          + env(safe-area-inset-bottom)           [if given]
```

### Invariants — checkable in a diff, and pinned by `Sheet.test.tsx`

| # | Invariant | Why it is a contract and not a style |
|---|---|---|
| S1 | The footer is a **sibling** of the body, never inside it | Inside, it scrolls away and the confirm is unreachable — which is half of M8 |
| S2 | The body is the **only** element with `overflow-y-auto` | Two scroll containers in one overlay is §3's no-section-takes-a-height rule broken by another route |
| S3 | `scrim={false}` emits **no backdrop element at all** | A transparent backdrop still swallows every touch; the canvas behind must stay live ([research.md](research.md) R2) |
| S4 | `aria-modal` follows `scrim` | With no backdrop the sheet genuinely is not modal; claiming otherwise misdescribes it to assistive technology |
| S5 | The panel is `rounded-t-xl`, never `rounded-xl` | It is anchored to an edge, so it has two corners ([tokens.md](../../design/tokens.md) §7) |
| S6 | `flush` removes the body's padding and nothing else | It must not also change the header, the footer or the gap discipline |
| S7 | The safe-area inset is **added to** the footer's padding, never absorbed | `pb-[calc(env(...)+0.75rem)]`, not `pb-[env(...)]` — a control the home indicator sits on is a control that misses |
| S8 | Nothing renders when `open` is false | The same contract `Drawer` and `Dialog` already keep |

### Behaviours the shell owns

- `Escape` closes (via `useEscapeToClose`).
- Tapping the scrim closes. With no scrim there is nothing to tap, and that is
  the whole of the difference.
- Focus moves into the sheet on open and returns to the invoking element on
  close, best-effort where that element has unmounted.
- `role="dialog"`, accessible name from `title`.
- No entrance or exit animation, and no grab handle. A handle is a promise the
  sheet can be dragged; it cannot.

### Tenancy — what each job supplies

| Job | `title` | `footer` | `scrim` | `flush` | Commits |
|---|---|---|---|---|---|
| Row editor | the row's name | one full-width confirm | default | — | a draft, one **Save** |
| Drawer | the drawer's title + subtitle | the statement line | default | — | per `GearCard` |
| Inspector | `MicroLabel` + `Pill` | **none** | `false` | — | per field |
| List | *Sections*, *More*, *Filter by category* | none | default | `true` | on tap, closes |

The row editor's **delete** is not in this table because it is not the shell's:
it renders at the foot of `children`, left-aligned, ghost + `red-400`, and
scrolls with the body (FR-023).

---

## 2 · `ui/Drawer` — extended

**No prop changes.** The signature is untouched.

```tsx
export function Drawer({ open, onClose, title, subtitle, width = 'wide', children, footer }) {
  useEscapeToClose(open, onClose)
  const isMobile = useIsMobile()
  if (!open) return null
  if (isMobile) return <Sheet …>{children}</Sheet>   // width is not passed
  return …                                            // today's return, verbatim
}
```

| # | Invariant | How it is checked |
|---|---|---|
| D1 | The desktop return is **byte-identical** to today's | Read the diff: the block moves, no line inside it changes |
| D2 | `width` is not forwarded to the sheet | A phone has one width; forwarding it would be an API that must never be used |
| D3 | `title`, `subtitle`, `children` and `footer` pass through **unchanged** | The branch is a pass-through, not a translation |
| D4 | No drawer call site changes | Six drawers get a phone form and none of their files appear in the diff |

---

## 3 · `ui/Dialog` — extended

**No prop changes.** Two additions:

| # | Addition | Contract |
|---|---|---|
| G1 | `Escape` closes | Same hook, same semantics as `Drawer`'s since Slice 23 |
| G2 | Internal scroll | `max-h-[85svh] flex flex-col`; header `flex-none`; body `overflow-y-auto`. **The sheet's own numbers**, so a tall overlay behaves the same at either anchor |
| G3 | Still centred, at every width | The rule: *an overlay with fields is a `Sheet`; an overlay that is a sentence and two buttons is a `Dialog`* |

**The one stated desktop delta in the whole phase**: a dialog taller than
`85svh` now scrolls instead of overflowing off both ends. Nothing in the tree is
currently that tall, which is why it has never been reported — and why it is
stated in advance rather than discovered later.

---

## 4 · `ui/GearList` — `FieldStack` gains one width

```
default: 'w-40'   grow: 'min-w-40 flex-1'   count: 'w-20'   short: 'w-28'
full:    'w-full'                                                    ← new
```

| # | Invariant | Why |
|---|---|---|
| F1 | The four existing widths are unchanged | Every desktop drawer and row editor renders one of them |
| F2 | `full` is the phone's, and stacks | `grow`'s `flex-1` grows the *height* inside a `flex-col`, which is why it could not be reused |
| F3 | The label stays `MicroLabel` | That is the whole point — one label voice at every width ([tokens.md](../../design/tokens.md) §7 amendment 2) |

A side effect worth recording: `FieldStack` **wraps** its control in a real
`<label>`, whereas the phone sheets' `FieldLabel` sits beside the control and
therefore labels nothing. The phone's forms acquire label association as a
consequence of the tier fix, not as a separate task.

---

## 5 · `hooks/useEscapeToClose` — new

```tsx
export function useEscapeToClose(active: boolean, onClose: () => void): void
```

Three callers, in one commit. It owns the key handler and nothing else — not
focus, not scroll locking, not the backdrop, because only one of the three
wants each of those the same way.
