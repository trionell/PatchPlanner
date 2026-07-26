import type { ChainCellModel } from '../../lib/patchSheet'

/**
 * A row's signal path as printed: the same segments the on-screen sheet
 * renders, in the same order, from the same builder — so paper and screen
 * cannot drift (Slice 23 FR-017). Paper additionally prints each hop's cable,
 * which the screen keeps one click away in the hop picker, because the printed
 * sheet is what a crew packs cables from.
 */
export function ChainText({ model }: { model: ChainCellModel }) {
  return (
    <>
      {model.lines.map((line, lineIndex) => (
        <div key={lineIndex} className={model.lines.length > 1 ? 'mb-1' : undefined}>
          {line.sideLabel && <span className="text-zinc-500">{line.sideLabel}: </span>}
          {line.segments.map((segment, index) => (
            <span key={index}>
              {index > 0 && <span className="text-zinc-500"> → </span>}
              <span className={segment.missing ? 'text-red-400' : undefined}>{segment.label}</span>
              {segment.detail && <span className="text-zinc-500"> ({segment.detail})</span>}
            </span>
          ))}
        </div>
      ))}
    </>
  )
}
