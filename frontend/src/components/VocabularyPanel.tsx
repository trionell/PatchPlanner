import { Fragment, useMemo, useState } from 'react'
import { Pencil, Plus, Search } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { useRowEditor } from '../hooks/useRowEditor'
import { matchesSearch } from '../lib/patchSearch'
import { vocabularyTitles } from '../lib/vocabularyTitles'
import type { ReferenceData, ReferenceValue } from '../types'
import { RowEditor } from './event/RowEditor'
import { StatusStrip } from './event/StatusStrip'
import { CondensedListRow } from './mobile/CondensedListRow'
import { MobilePicker } from './mobile/MobilePicker'
import { MobilePanel } from './ui/MobilePanel'
import { Sheet } from './ui/Sheet'
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
 *
 * **And a column that cannot answer says so.** Four vocabularies outlived the
 * columns that once stored them: nothing reads *Signal types*, *Signal cable
 * types*, *Mic stands* or *Truss types* anymore, because a cable and a stand are
 * catalog picks now and a truss piece is too. Their counts were blank for the
 * true reason and the wrong-looking one, indistinguishable from a count that had
 * broken — so the server flags them and the panel labels them `not stored`
 * rather than leaving a dash to be misread.
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const isMobile = useIsMobile()

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

  /*
    The phone (Wave 6c, audit.md M9).

    The branch is **here**, in the shared component, rather than in either caller — the
    `ui/Drawer` precedent, used twice already in this wave. That matters more than usual
    here because the two callers are event Settings and `/my-defaults`, which are the
    same vocabularies seen twice: the whole point of the personal template is that it
    looks like the event's copy, so they must not be able to drift.

    A rail is a column, and a column is the one thing a 375px screen does not have
    (patterns.md §7), so it becomes a bar control opening a sheet — `MobilePicker`, which
    is `SectionSwitcher`'s shape. It goes in `actions` and not the overflow because
    choosing a vocabulary changes *what you are looking at*.
  */
  if (isMobile) {
    const editing = visible.find((value) => value.id === editingId)
    return (
      <>
        <MobilePanel
          onSearch={setSearch}
          primaryAction={
            /* Hidden, not disabled, for a role that cannot act (P7). */
            readOnly ? undefined : (
              <button
                aria-label="Add value"
                className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
                onClick={() => setAdding(true)}
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>
            )
          }
          search={search}
          searchPlaceholder="Find a value…"
          strip={
            /* A sentence, not a control: there is nothing here to filter to
               (patterns.md §7b). The second one in the application. */
            <StatusStrip tint="border-zinc-800 bg-zinc-950/60">
              <span className="font-mono tabular-nums text-zinc-200">{names.length} vocabularies</span>
              <span className="font-mono tabular-nums text-zinc-500">{total} values</span>
              <span className="min-w-0 flex-1 truncate">{note}</span>
            </StatusStrip>
          }
          /*
            The picker **is** the title here (Slice 35 field test).

            It was a `field` beside the word *Vocabularies*, which left it 112 px — every
            option truncated, so the one thing the control existed to tell you was the
            one thing you could not read. On the desktop the panel is called
            *Vocabularies* because the rail beside it shows which one is open; a phone has
            no rail, so this surface genuinely **is** one vocabulary at a time and saying
            so is more use than repeating a category name. The strip still counts them,
            and `SectionSwitcher` above still says where you are.
          */
          title={
            <MobilePicker
              label="Vocabulary"
              onChange={(name) => {
                setSelected(String(name))
                setAdding(false)
                setEditingId(null)
              }}
              options={names.map((name) => ({
                id: name,
                label: vocabularyTitles[name],
                hint: String(data?.[name]?.length ?? 0),
              }))}
              title={title}
              value={selected}
              variant="title"
            />
          }
        >
          {error && <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">{error}</p>}

          {visible.map((value) => (
            <CondensedListRow
              key={value.id}
              /* Tappable for every role: the stored value and the usage count are
                 behind the tap, and a viewer needs to read them (audit.md M4). */
              onClick={() => setEditingId(value.id)}
              subtitle={
                <>
                  <span className="font-mono text-zinc-500">{value.value}</span>
                  {showUsage && (
                    <>
                      {' · '}
                      {/* A column that cannot answer says so, rather than leaving a
                          dash to be misread as a broken count (Slice 29). */}
                      {value.usageUntracked ? 'not stored' : (value.usageCount ?? 0) > 0 ? `used in ${value.usageCount} ${value.usageCount === 1 ? 'row' : 'rows'}` : 'not used'}
                    </>
                  )}
                </>
              }
              title={value.label}
              trailing={readOnly ? undefined : <Pencil className="h-4 w-4 text-zinc-500" />}
            />
          ))}

          {visible.length === 0 && (
            <p className="px-3 py-3 text-sm text-zinc-500">
              {values.length === 0
                ? `No values — every dropdown for ${vocabularyTitles[selected]} is empty.`
                : 'No value matches.'}
            </p>
          )}
        </MobilePanel>

        {editing && (
          <MobileValueSheet
            onClose={() => setEditingId(null)}
            onDelete={async () => {
              await run(() => onDelete(selected, editing.id))
              setEditingId(null)
            }}
            onRename={async (label) => {
              await run(() => onRename(selected, editing.id, label))
              setEditingId(null)
            }}
            readOnly={readOnly}
            showUsage={showUsage}
            value={editing}
          />
        )}
        {adding && !readOnly && (
          <MobileValueSheet
            onClose={() => setAdding(false)}
            onCreate={async (draft) => {
              await run(() => onCreate(selected, draft.value, draft.label))
              setAdding(false)
            }}
            readOnly={false}
            showUsage={showUsage}
            vocabulary={vocabularyTitles[selected]}
          />
        )}
      </>
    )
  }

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
              // Read off the values, which is where the server puts the flag.
              // An empty untracked vocabulary loses the qualifier, and has no
              // rows to mislead anyone with either.
              qualifier={showUsage && data?.[name]?.some((value) => value.usageUntracked) ? 'not stored' : undefined}
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
                  const untracked = value.usageUntracked === true
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
                          <NumCell
                            title={
                              untracked
                                ? 'No part of the plan stores this vocabulary, so there is nothing to count'
                                : used > 0
                                  ? 'Used by a saved plan — it cannot be deleted'
                                  : undefined
                            }
                          >
                            {untracked ? (
                              <span className="text-zinc-600">not stored</span>
                            ) : used > 0 ? (
                              `${used} ${used === 1 ? 'row' : 'rows'}`
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
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
                                    {untracked ? (
                                      <>
                                        <b className="font-semibold text-zinc-200">
                                          Nothing in the plan stores this vocabulary.
                                        </b>{' '}
                                        It is left over from an earlier model — this one is not offered anywhere, so
                                        adding, renaming and deleting here changes nothing else.
                                      </>
                                    ) : used > 0 ? (
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

/**
 * One vocabulary value, on a phone — rename, delete, or add (Wave 6c).
 *
 * Add and edit are one construction (`patterns.md` §2), which is the same call the
 * desktop's `RowEditor` and `AddValue` make one level up. It lives in this file rather
 * than in `components/mobile/` because the six things it would otherwise take as props —
 * the mutations, the error handling and the vocabulary — are all owned here, and passing
 * them out and back is more surface than the component is.
 */
function MobileValueSheet({
  value,
  vocabulary,
  showUsage,
  readOnly,
  onClose,
  onRename,
  onDelete,
  onCreate,
}: {
  /** Omitted → adding one. */
  value?: ReferenceValue
  /** The vocabulary being added to, for the subtitle. */
  vocabulary?: string
  showUsage: boolean
  readOnly: boolean
  onClose: () => void
  onRename?: (label: string) => Promise<void>
  onDelete?: () => Promise<void>
  onCreate?: (draft: { value: string; label: string }) => Promise<void>
}) {
  const [label, setLabel] = useState(value?.label ?? '')
  const [stored, setStored] = useState('')
  const [busy, setBusy] = useState(false)

  const used = value?.usageCount ?? 0
  const untracked = value?.usageUntracked === true
  const ready = value ? label.trim() !== '' && label !== value.label : label.trim() !== '' && stored.trim() !== ''

  const submit = async () => {
    setBusy(true)
    try {
      if (value) await onRename?.(label.trim())
      else await onCreate?.({ label: label.trim(), value: stored.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      footer={
        readOnly ? undefined : (
          /* Delete kept apart from the confirm (patterns.md §2, §7d). */
          <div className="flex w-full items-center gap-3">
            {value && onDelete && (
              <Button className="text-red-400" disabled={busy} onClick={() => void onDelete()} size="md" variant="ghost">
                Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button className="flex-1" disabled={busy || !ready} onClick={() => void submit()}>
              {busy ? 'Saving…' : value ? 'Save label' : 'Add value'}
            </Button>
          </div>
        )
      }
      onClose={onClose}
      open
      subtitle={value ? undefined : `to ${vocabulary}`}
      title={value ? value.label : 'Add a value'}
    >
      <FieldStack label="Label" width="grow">
        <Input disabled={readOnly} onChange={(event) => setLabel(event.target.value)} value={label} />
      </FieldStack>

      {value ? (
        <FieldStack label="Stored value" width="grow">
          {/* Immutable by design: saved plans point at it, so changing it would
              silently orphan them. */}
          <span className="flex h-10 items-center font-mono text-xs text-zinc-500">{value.value}</span>
        </FieldStack>
      ) : (
        <FieldStack label="Stored value" width="grow">
          <Input onChange={(event) => setStored(event.target.value)} value={stored} />
        </FieldStack>
      )}

      {/* `In use` is Wave 5's point and it survives the trip: a load-bearing value has
          to look different from a safe one at rest, or the interface finds out by
          trying and reports the server's refusal as the user's error. */}
      {showUsage && value && (
        <p className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
          {untracked ? (
            <>
              <b className="font-semibold text-zinc-200">Nothing in the plan stores this vocabulary.</b> It is left
              over from an earlier model, so adding, renaming and deleting here changes nothing else.
            </>
          ) : used > 0 ? (
            <>
              <b className="font-semibold text-zinc-200">
                {used} plan {used === 1 ? 'row uses' : 'rows use'} this value.
              </b>{' '}
              Renaming the label is safe — the stored value never changes. Deleting is refused while it is in use.
            </>
          ) : (
            <>Nothing uses this value, so it can be deleted.</>
          )}
        </p>
      )}
    </Sheet>
  )
}
