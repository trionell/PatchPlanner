import { useCallback, useState, type KeyboardEvent } from 'react'

interface RowEditorOptions<Row, Draft> {
  rows: Row[]
  idOf: (row: Row) => number
  /** The draft a row opens with. */
  draftOf: (row: Row) => Draft
  /** Writes a draft back. Called on save, and when another row is opened. */
  persist: (row: Row, draft: Draft) => void
}

/**
 * The sheet's in-place row editor, shared by both audio tabs (Slice 23
 * FR-013/FR-014): at most one row open at a time, opening another saves and
 * closes the first, `Esc` discards, `⌘↵`/`Ctrl↵` saves and moves to the next
 * row.
 *
 * "Opening another saves the first" is the rule that makes the sheet usable as
 * a list — you work down it without ever pressing Save — so it lives here
 * rather than in either sheet, where the two would drift.
 */
export function useRowEditor<Row, Draft>({ rows, idOf, draftOf, persist }: RowEditorOptions<Row, Draft>) {
  const [requestedId, setRequestedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  // Derived, not an effect: a row deleted while its editor is open takes the
  // editor with it on the very next render, with no intermediate frame showing
  // an editor for a row that no longer exists.
  const openId = requestedId != null && rows.some((row) => idOf(row) === requestedId) ? requestedId : null

  const commit = useCallback(() => {
    if (openId == null || draft == null) return
    const row = rows.find((candidate) => idOf(candidate) === openId)
    if (row) persist(row, draft)
  }, [draft, idOf, openId, persist, rows])

  const openRow = useCallback(
    (row: Row) => {
      const id = idOf(row)
      if (id === openId) return
      commit()
      setRequestedId(id)
      setDraft(draftOf(row))
    },
    [commit, draftOf, idOf, openId],
  )

  const close = useCallback(() => {
    setRequestedId(null)
    setDraft(null)
  }, [])

  const save = useCallback(() => {
    commit()
    close()
  }, [close, commit])

  const saveAndNext = useCallback(() => {
    commit()
    const index = rows.findIndex((row) => idOf(row) === openId)
    const next = index >= 0 ? rows[index + 1] : undefined
    if (next) {
      setRequestedId(idOf(next))
      setDraft(draftOf(next))
    } else {
      close()
    }
  }, [close, commit, draftOf, idOf, openId, rows])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        saveAndNext()
      }
    },
    [close, saveAndNext],
  )

  return { openId, draft, setDraft, openRow, save, close, onKeyDown }
}
