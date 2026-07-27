import { Fragment, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useRowEditor } from '../hooks/useRowEditor'
import { matchesSearch } from '../lib/patchSearch'
import { vocabularyTitles } from '../lib/vocabularyTitles'
import type { ReferenceData, ReferenceValue } from '../types'
import { RowEditor } from './event/RowEditor'
import { Button } from './ui/Button'
import { FieldStack } from './ui/GearList'
import { Input } from './ui/Input'
import { PanelCols, PanelMain, PanelRail, PanelRailRow } from './ui/PanelRail'
import { PatchPanel } from './ui/PatchPanel'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from './ui/SheetTable'

/**
 * Every editable planning vocabulary, in one panel (Slice 29 US4).
 *
 * It was nine `VocabularyCard`s in a two-column grid — nine always-open add
 * forms on one page, and five screens of scrolling to reach *Truss types*. The
 * vocabularies are the rail now, which is `PanelRail`'s second caller and the
 * thing that justified building it.
 *
 * **The stored value stops being a caption and becomes a column.** It matters —
 * it is what saved plans point at, and it is why renaming is safe and deleting
 * is not — so it is shown once per row, in mono, where a column of keys lines up,
 * instead of being squeezed to 128 px and truncated beside every label.
 *
 * **`In use` is the point of the wave.** The server has refused to delete a
 * referenced value since Slice 17; the interface used to find out by trying, and
 * reported the refusal as an error the user caused. The count comes from the same
 * function that guards the delete, so a value safe to remove now looks different
 * from one that is load-bearing, at rest.
 */

const COLUMNS_WITH_USAGE = ['Label', 'Stored value', 'In use']
const COLUMNS_PLAIN = ['Label', 'Stored value']

interface VocabularyPanelProps {
  title: string
  data?: ReferenceData
  /**
   * Whether values report how many plan rows use them. False for the personal
   * template, which no plan can reference — reporting `0` there would imply it
   * could (FR-034).
   */
  showUsage: boolean
  /** One line in the strip saying what this copy of the vocabularies is. */
  note: string
  readOnly?: boolean
  onCreate: (vocabulary: string, value: string, label: string) => Promise<unknown>
  onRename: (vocabulary: string, id: number, label: string) => Promise<unknown>
  onDelete: (vocabulary: string, id: number) => Promise<unknown>
}

export function VocabularyPanel({
  title,
  data,
  showUsage,
  note,
  readOnly = false,
  onCreate,
  onRename,
  onDelete,
}: VocabularyPanelProps) {
  const names = useMemo(() => Object.keys(vocabularyTitles), [])
  const [selected, setSelected] = useState(names[0])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const values = useMemo(() => data?.[selected] ?? [], [data, selected])
  const visible = values.filter((value) => matchesSearch(search, value.label, value.value))
  const total = names.reduce((sum, name) => sum + (data?.[name]?.length ?? 0), 0)

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const editor = useRowEditor<ReferenceValue, { label: string }>({
    rows: visible,
    idOf: (value) => value.id,
    draftOf: (value) => ({ label: value.label }),
    persist: (value, draft) => {
      const label = draft.label.trim()
      if (!label || label === value.label) return
      void run(() => onRename(selected, value.id, label))
    },
  })

  const columns = showUsage ? COLUMNS_WITH_USAGE : COLUMNS_PLAIN

  return (
    <PatchPanel
      bar={
        <>
          <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">{title}</span>

          <div className="relative min-w-[10rem] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              size="sm"
              className="pl-7"
              placeholder="Find a value…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <span className="flex-1" />

          {!readOnly && (
            <Button size="xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Value
            </Button>
          )}
        </>
      }
    >
      {error && <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">{error}</p>}

      <PanelCols>
        <PanelRail>
          {names.map((name) => (
            <PanelRailRow
              key={name}
              label={vocabularyTitles[name]}
              count={data?.[name]?.length ?? 0}
              selected={name === selected}
              onSelect={() => {
                setSelected(name)
                setAdding(false)
              }}
            />
          ))}
        </PanelRail>

        <PanelMain>
          <div className="overflow-x-auto">
            <SheetTable>
              <SheetHead>
                <tr>
                  {columns.map((column) => (
                    <SheetHeadCell key={column}>{column}</SheetHeadCell>
                  ))}
                </tr>
              </SheetHead>
              <SheetBody>
                {visible.map((value, index) => {
                  const open = editor.openId === value.id
                  const used = value.usageCount ?? 0
                  return (
                    <Fragment key={value.id}>
                      <SheetRow
                        striped={index % 2 === 1}
                        open={open}
                        className={readOnly ? undefined : 'cursor-pointer'}
                        onClick={readOnly ? undefined : () => editor.openRow(value)}
                      >
                        <SheetCell className="text-zinc-100">{value.label}</SheetCell>
                        <NumCell>{value.value}</NumCell>
                        {showUsage && (
                          <NumCell title={used > 0 ? 'Used by a saved plan — it cannot be deleted' : undefined}>
                            {used > 0 ? `${used} ${used === 1 ? 'row' : 'rows'}` : <span className="text-zinc-600">—</span>}
                          </NumCell>
                        )}
                      </SheetRow>

                      {open && editor.draft && (
                        <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                          <td colSpan={columns.length} className="px-2 pb-2">
                            <RowEditor
                              saveLabel="Save label"
                              onSave={editor.save}
                              onCancel={editor.close}
                              onKeyDown={editor.onKeyDown}
                              onDelete={() => {
                                void run(() => onDelete(selected, value.id))
                                editor.close()
                              }}
                              notice={
                                showUsage ? (
                                  <p className="w-full rounded-[5px] border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-400">
                                    {used > 0 ? (
                                      <>
                                        <b className="font-semibold text-zinc-200">
                                          {used} plan {used === 1 ? 'row uses' : 'rows use'} this value.
                                        </b>{' '}
                                        Renaming the label is safe — the stored value never changes, so nothing moves.
                                        Deleting is refused while it is in use.
                                      </>
                                    ) : (
                                      <>Nothing uses this value, so it can be deleted.</>
                                    )}
                                  </p>
                                ) : undefined
                              }
                            >
                              <FieldStack label="Label" width="grow">
                                <Input
                                  size="sm"
                                  value={editor.draft.label}
                                  onChange={(event) =>
                                    editor.setDraft((draft) => (draft ? { label: event.target.value } : draft))
                                  }
                                />
                              </FieldStack>
                              <FieldStack label="Stored value">
                                {/* Immutable by design: saved plans point at it,
                                    so changing it would silently orphan them. */}
                                <span className="flex h-8 items-center font-mono text-xs text-zinc-500">
                                  {value.value}
                                </span>
                              </FieldStack>
                            </RowEditor>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {visible.length === 0 && (
                  <tr>
                    <SheetCell colSpan={columns.length} className="text-zinc-500">
                      {values.length === 0
                        ? 'No values — every dropdown for this vocabulary is empty.'
                        : 'No value matches.'}
                    </SheetCell>
                  </tr>
                )}

                {adding && !readOnly && (
                  <tr className="border-b border-zinc-800/60 bg-amber-500/[0.04]">
                    <td colSpan={columns.length} className="px-2 py-2">
                      <AddValue
                        onCancel={() => setAdding(false)}
                        onSave={async (draft) => {
                          await run(() => onCreate(selected, draft.value, draft.label))
                          setAdding(false)
                        }}
                      />
                    </td>
                  </tr>
                )}
              </SheetBody>
            </SheetTable>
          </div>
        </PanelMain>
      </PanelCols>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
        <Pill className="bg-zinc-700 text-zinc-100">{names.length} vocabularies</Pill>
        <span className="font-mono tabular-nums text-zinc-200">{total} values</span>
        <span className="font-mono tabular-nums text-zinc-500">
          {values.length} in {vocabularyTitles[selected]}
        </span>
        <span className="text-zinc-500">{note}</span>
      </div>
    </PatchPanel>
  )
}

function AddValue({
  onSave,
  onCancel,
}: {
  onSave: (draft: { value: string; label: string }) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState({ value: '', label: '' })
  const ready = draft.value.trim().length > 0 && draft.label.trim().length > 0
  return (
    <RowEditor
      saveLabel="Add value"
      onSave={() => ready && onSave({ value: draft.value.trim(), label: draft.label.trim() })}
      onCancel={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready) {
          event.preventDefault()
          onSave({ value: draft.value.trim(), label: draft.label.trim() })
        }
      }}
      notice={
        <p className="w-full rounded-[5px] border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-400">
          The <b className="font-semibold text-zinc-200">stored value</b> is what saved plans point at and can never be
          changed afterwards. The label is what people read, and can.
        </p>
      }
    >
      <FieldStack label="Label" width="grow">
        <Input
          size="sm"
          value={draft.label}
          placeholder="DMX 5-pin"
          onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
        />
      </FieldStack>
      <FieldStack label="Stored value">
        <Input
          size="sm"
          value={draft.value}
          placeholder="dmx5"
          onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))}
        />
      </FieldStack>
    </RowEditor>
  )
}
