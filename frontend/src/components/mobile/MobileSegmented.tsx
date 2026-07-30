/**
 * *Which of these two or three am I looking at*, on a phone.
 *
 * `MobilePicker` is the same question with too many answers to show at once — it names
 * the current one and opens a sheet. This is the case where they all fit: the stage
 * plot's **Top · Front · Side**, and the audio tabs' **Sheet │ Flow**. Both are
 * `patterns.md` §7b's *changes what you are looking at*, so both stay visible in the bar
 * rather than going behind the `⋯`.
 *
 * Extracted at its second caller, which is the rule `ui/PanelRail` was made to follow
 * and `MobilePicker` already follows. Wave 6c hand-built the first one inside
 * `StagePlotTab`; this slice needed a second, and a second copy of a control is how the
 * two come to disagree about a border radius nobody meant to change.
 *
 * The selection is amber-filled, which is the one place the accent marks *position*
 * rather than action — the same exception `MobileNav` takes, and legible for the same
 * reason: there are two or three slots and nothing else nearby is amber.
 */
export function MobileSegmented<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  /** Names the group for a screen reader: "View", "Plot view". */
  label: string
  /*
    `NoInfer` on both, so `T` comes from **`value`** — the surface's own union — and from
    nowhere else. Without it, `onChange={setMobileView}` offers `SetStateAction<…>` as a
    candidate, which fails the `extends string` constraint, and `T` silently falls back
    to `string`; the caller then gets a type error on its own setter and no clue why.
  */
  onChange: (value: NoInfer<T>) => void
  options: readonly { value: NoInfer<T>; label: string }[]
  value: T
}) {
  return (
    <div aria-label={label} className="flex h-11 flex-none items-center rounded-md border border-zinc-700 bg-zinc-900" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={
            option.value === value
              ? 'flex h-11 min-w-[3rem] items-center justify-center rounded-md bg-amber-500 px-2 text-sm font-medium text-zinc-950'
              : 'flex h-11 min-w-[3rem] items-center justify-center px-2 text-sm text-zinc-400'
          }
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
