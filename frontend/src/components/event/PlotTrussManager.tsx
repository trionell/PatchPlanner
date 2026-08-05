import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { listEventInventoryItems } from '../../api/inventory'
import { getLightingRig } from '../../api/lighting'
import {
  attachPlotTrussFixture,
  createPlotTruss,
  createPlotTrussPiece,
  deletePlotTruss,
  deletePlotTrussPiece,
  detachPlotTrussFixture,
  updatePlotTruss,
} from '../../api/stagePlots'
import { useDraftState } from '../../hooks/useDraftState'
import { lengthWithoutPiece, parseLengthFromName, trussSubtitle } from '../../lib/stagePlot'
import { cn } from '../../lib/utils'
import type { PlotTruss, PlotTrussFixture, PlotTrussPiece, TrussSide } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Drawer } from '../ui/Drawer'
import { GearSpecs, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { MicroLabel } from '../ui/Label'
import { Pill } from '../ui/SheetTable'
import { Select } from '../ui/Select'

interface PlotTrussManagerProps {
  eventId: number
  trusses: PlotTruss[]
  open: boolean
  onClose: () => void
  /** Invalidate the plot query after any truss change. */
  onChanged: () => void
  /** Place a truss on the current plot (creates a kind='truss' element). */
  onPlace: (truss: PlotTruss) => void
  /** Truss ids already placed on the current plot. */
  placedTrussIds: Set<number>
  /** The placed element per truss id (rotation lives on the placement). */
  placedElements: Map<number, PlacedTrussElement>
  /** Patch a placed truss element's rotation/tilt. */
  onRotate: (elementId: number, patch: { rotation_deg?: number; tilt_deg?: number }) => void
  readOnly?: boolean
  /**
   * The phone's tier ([tokens.md](../../../design/tokens.md) §7 amendment 2) —
   * 44 px rows at the sheet's own inset, in place of the work surface's 30 px
   * rows at the drawer's.
   *
   * Mostly geometry, and in two places a **sentence composed by width**: the
   * legacy piece's line drops its fix on a phone, because re-picking from the
   * catalog is a desk job, and the Pieces band carries the total the phone's
   * header has no room for. Both are the surface saying a different true thing
   * to a reader who can do different things — which is composition.
   *
   * **What it is never is a permission.** It arrives from the mount, the one
   * place that knows the width, for the same reason `GearCard` takes its phone
   * padding as a class from its caller; this file never asks how wide the window
   * is. What a *role* may do is `readOnly` — a separate prop, from a separate
   * answer — and the two must not be spelled with one branch (P9 / patterns.md
   * §7g). If a future change wants `touch` to decide whether something can be
   * *changed*, that is the line it must not cross.
   */
  touch?: boolean
  /**
   * The explanation's last sentence, composed by the mount.
   *
   * The first two sentences are the model and are true at every width. The third
   * is about *what you do here*, and what you do here is not the same on a phone:
   * telling a reader to drag a fixture's marker along a bar names a gesture the
   * surface withholds. Composition, not permission — see `touch`.
   */
  closingNote: ReactNode
}

export interface PlacedTrussElement {
  id: number
  rotation_deg: number
  tilt_deg: number
}

/** Event-level truss manager (US5): assemble trusses from inventory
 *  truss pieces (lengths auto-suggested from catalog names), set hang
 *  height, and attach rig fixtures at offsets along the truss.
 *
 *  **A `ui/Drawer`, not a `ui/Dialog`** (Slice 39). Nothing waits on this
 *  surface: you assemble a truss, hang a fixture, go back to the canvas and
 *  come back. The plot is the work and this is the bench beside it, which is
 *  what `components.md` §`ui/Dialog` calls *accompanying*. The two confirms it
 *  raises are the other half of the same rule — one choice, and nothing
 *  proceeds until it is made.
 *
 *  The body is one construction under `flush`: a run of truss bands over
 *  hairlines, not a stack of `DrawerSection`s. A section per truss would put a
 *  record's name into a `MicroLabel` heading, which is a category's voice. */
export function PlotTrussManager({
  eventId,
  trusses,
  open,
  onClose,
  onChanged,
  onPlace,
  placedTrussIds,
  placedElements,
  onRotate,
  readOnly = false,
  touch = false,
  closingNote,
}: PlotTrussManagerProps) {
  const queryClient = useQueryClient()
  const trussItemsQuery = useQuery({
    queryKey: ['inventory-truss-items', eventId],
    queryFn: () => listEventInventoryItems(eventId, { role: 'truss' }),
    enabled: open && !readOnly,
  })
  // Only the attach picker reads the rig, and only the edit view has one — so a
  // phone read and a desktop viewer do not fetch it to display nothing.
  const lightingQuery = useQuery({
    queryKey: ['lighting-rig', eventId],
    queryFn: () => getLightingRig(eventId),
    enabled: open && !readOnly,
  })

  const [newName, setNewName] = useState('')

  /*
    Both confirms live here rather than in the row that raises them, and the
    pending state is the *record*, never a boolean (ROADMAP D2 decision 2): six
    near-identical rows are exactly the case where a confirm that silently
    re-aims is the one outcome a confirm exists to prevent.

    They also have to be rendered as siblings *after* the drawer — `Drawer`,
    `Sheet` and `Dialog` are all `z-50`, so DOM order is the whole mechanism,
    and a confirm inside the drawer's scrolling body renders under it.
  */
  const [pendingTruss, setPendingTruss] = useState<PlotTruss | null>(null)
  const [pendingPiece, setPendingPiece] = useState<{ truss: PlotTruss; piece: PlotTrussPiece } | null>(null)

  const changed = async () => {
    onChanged()
    // The Lighting tab's read-only truss column derives from attachments.
    await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => createPlotTruss(eventId, { name }),
    onSuccess: async () => {
      setNewName('')
      await changed()
    },
  })
  const deleteTrussMutation = useMutation({
    mutationFn: (trussId: number) => deletePlotTruss(eventId, trussId),
    onSuccess: async () => {
      setPendingTruss(null)
      await changed()
    },
  })
  const removePieceMutation = useMutation({
    mutationFn: ({ trussId, pieceId }: { trussId: number; pieceId: number }) => deletePlotTrussPiece(eventId, trussId, pieceId),
    onSuccess: async () => {
      setPendingPiece(null)
      await changed()
    },
  })

  const pad = touch ? 'px-3' : 'px-5'

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title="Trusses"
        subtitle={trussSubtitle(trusses.length)}
        width="wide"
        flush
        noteId="event-trusses"
        info={
          <div className="space-y-1.5">
            <p>
              A truss belongs to the <span className="text-zinc-300">event</span>, not to a plot — the same truss shown on three
              plots is one truss and one line on the rental order.
            </p>
            <p>
              Its drawn length is exactly the <span className="text-zinc-300">sum of its pieces</span>, so removing one shortens
              it on every plot at once.
            </p>
            <p>{closingNote}</p>
          </div>
        }
      >
        {trusses.length === 0 && readOnly && (
          <p className={cn('py-6 text-center text-sm text-zinc-500', pad)}>No trusses on this event yet.</p>
        )}
        {trusses.map((truss) => (
          <TrussEditor
            key={truss.id}
            eventId={eventId}
            truss={truss}
            trussItems={trussItemsQuery.data ?? []}
            fixtures={lightingQuery.data?.fixtures ?? []}
            onChanged={changed}
            onPlace={() => onPlace(truss)}
            placed={placedTrussIds.has(truss.id)}
            element={placedElements.get(truss.id)}
            onRotate={onRotate}
            onRequestDelete={() => setPendingTruss(truss)}
            onRequestRemovePiece={(piece) => setPendingPiece({ truss, piece })}
            readOnly={readOnly}
            touch={touch}
          />
        ))}
        {!readOnly && (
          <>
            <Band className="border-t border-zinc-700 pt-3" label="New truss" pad={pad} />
            <form
              className={cn('flex items-center gap-2 pb-3.5 pt-1', pad)}
              onSubmit={(e) => {
                e.preventDefault()
                if (newName.trim()) createMutation.mutate(newName.trim())
              }}
            >
              <Input
                className="h-9 max-w-[320px] flex-1"
                placeholder="Name it — Front truss, Side truss L…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="New truss name"
              />
              {/* "Add truss", not "Add": this drawer already has an *Add piece* and an
                  *Attach*, and three submits where two say the same word is the
                  ambiguity the design was drawn to remove. */}
              <Button type="submit" size="sm" disabled={!newName.trim() || createMutation.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                Add truss
              </Button>
            </form>
          </>
        )}
      </Drawer>

      {/* Siblings, after the drawer. See `pendingTruss` for why the order is the mechanism. */}
      <ConfirmDialog
        open={pendingTruss != null}
        title="Delete truss"
        confirmLabel="Delete"
        onCancel={() => setPendingTruss(null)}
        onConfirm={() => pendingTruss && deleteTrussMutation.mutate(pendingTruss.id)}
      >
        {pendingTruss && (
          <>
            <span className="text-zinc-200">{pendingTruss.name}</span> is removed from the event, with its{' '}
            {pendingTruss.pieces.length === 1 ? 'one piece' : `${pendingTruss.pieces.length} pieces`} and its placement on every
            plot. The {pendingTruss.fixtures.length === 1 ? 'fixture' : 'fixtures'} hung on it stay in the rig.
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingPiece != null}
        title="Remove piece"
        confirmLabel="Remove"
        onCancel={() => setPendingPiece(null)}
        onConfirm={() => pendingPiece && removePieceMutation.mutate({ trussId: pendingPiece.truss.id, pieceId: pendingPiece.piece.id })}
      >
        {pendingPiece && (
          <>
            <span className="text-zinc-200">{pendingPiece.truss.name}</span> becomes{' '}
            <span className="text-zinc-200">{lengthWithoutPiece(pendingPiece.truss.pieces, pendingPiece.piece.id)} cm</span> instead
            of {pendingPiece.truss.total_length_cm} cm, and every plot that shows it redraws at the new length.
            {!pendingPiece.piece.inventory_item_id && ' This piece is not from the catalog, so it cannot be added back as one.'}
          </>
        )}
      </ConfirmDialog>
    </>
  )
}

interface TrussEditorProps {
  eventId: number
  truss: PlotTruss
  trussItems: Array<{ id: number; name: string; description?: string }>
  fixtures: Array<{ id: number; custom_name?: string; inventory_item_name?: string; fixture_number?: number; truss_name?: string }>
  onChanged: () => Promise<void>
  onPlace: () => void
  placed: boolean
  /** The truss's placement on the current plot, when placed. */
  element?: PlacedTrussElement
  onRotate: (elementId: number, patch: { rotation_deg?: number; tilt_deg?: number }) => void
  onRequestDelete: () => void
  onRequestRemovePiece: (piece: PlotTrussPiece) => void
  readOnly?: boolean
  touch?: boolean
}

/** One truss: a header band, then `Pieces` and `Fixtures` as a micro-label over
 *  a run of full-bleed rows. A read-only view renders *values*, not the same
 *  controls greyed out — a disabled select is a control apologising, which is
 *  the shape wave 6c spent a slice removing. */
function TrussEditor({
  eventId,
  truss,
  trussItems,
  fixtures,
  onChanged,
  onPlace,
  placed,
  element,
  onRotate,
  onRequestDelete,
  onRequestRemovePiece,
  readOnly = false,
  touch = false,
}: TrussEditorProps) {
  const [heightDraft, setHeightDraft] = useDraftState(truss.height_cm, String, '0')
  const [nameDraft, setNameDraft] = useDraftState(truss.name, (v) => v, '')
  const [rotationDraft, setRotationDraft] = useDraftState(element?.rotation_deg, String, '0')
  const [tiltDraft, setTiltDraft] = useDraftState(element?.tilt_deg, String, '0')
  const [pieceItemId, setPieceItemId] = useState('')
  const [pieceLength, setPieceLength] = useState('')
  const [attachFixtureId, setAttachFixtureId] = useState('')
  const [attachOffset, setAttachOffset] = useState('')

  const updateMutation = useMutation({
    mutationFn: (patch: { name?: string; height_cm?: number }) => updatePlotTruss(eventId, truss.id, patch),
    onSuccess: onChanged,
  })
  const addPieceMutation = useMutation({
    mutationFn: () =>
      createPlotTrussPiece(eventId, truss.id, {
        inventory_item_id: pieceItemId ? Number(pieceItemId) : undefined,
        length_cm: Number(pieceLength.replace(',', '.')),
      }),
    onSuccess: async () => {
      setPieceLength('')
      await onChanged()
    },
  })
  const attachMutation = useMutation({
    mutationFn: () =>
      attachPlotTrussFixture(eventId, truss.id, Number(attachFixtureId), {
        offset_cm: attachOffset === '' ? null : Number(attachOffset.replace(',', '.')),
      }),
    onSuccess: async () => {
      setAttachFixtureId('')
      setAttachOffset('')
      await onChanged()
    },
  })
  const repositionMutation = useMutation({
    mutationFn: ({ fixtureId, offsetCm, side }: { fixtureId: number; offsetCm: number | null; side: TrussSide }) =>
      attachPlotTrussFixture(eventId, truss.id, fixtureId, { offset_cm: offsetCm, side }),
    onSuccess: onChanged,
  })
  const detachMutation = useMutation({
    mutationFn: (fixtureId: number) => detachPlotTrussFixture(eventId, truss.id, fixtureId),
    onSuccess: onChanged,
  })

  const fixtureName = (fixture: TrussEditorProps['fixtures'][number]) => fixture.custom_name || fixture.inventory_item_name || `Fixture ${fixture.id}`
  const attachableFixtures = fixtures.filter((fixture) => !truss.fixtures.some((attached) => attached.fixture_id === fixture.id))
  const lengthValue = Number(pieceLength.replace(',', '.'))
  const pad = touch ? 'px-3' : 'px-5'

  return (
    <div className="border-t border-zinc-700 first:border-t-0">
      <div className={cn('flex flex-col gap-2 border-b border-zinc-800 bg-zinc-950/45 py-2.5', pad)}>
        {readOnly ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{truss.name}</span>
              {placed && <Pill className="bg-sky-500/15 text-sky-300">On this plot</Pill>}
            </div>
            <GearSpecs>
              <Spec label="Hangs at" value={`${truss.height_cm} cm`} />
              <Spec label="Long" value={`${truss.total_length_cm} cm`} />
              {element ? (
                <>
                  <Spec label="Rotation" value={`${element.rotation_deg}°`} />
                  <Spec label="Rake" value={`${element.tilt_deg}°`} />
                </>
              ) : (
                <span className="text-zinc-600">not on this plot</span>
              )}
            </GearSpecs>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Input
                className="h-8 max-w-[280px] flex-1 font-medium"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => nameDraft.trim() && nameDraft !== truss.name && updateMutation.mutate({ name: nameDraft.trim() })}
                aria-label={`Name of ${truss.name}`}
              />
              <span className="flex-none font-mono text-xs tabular-nums text-zinc-400">{truss.total_length_cm} cm</span>
              <label className="flex flex-none items-center gap-1.5 text-xs text-zinc-400">
                Hangs at
                <Input
                  className="h-8 w-20 text-right tabular-nums"
                  value={heightDraft}
                  onChange={(e) => setHeightDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = Number(heightDraft.replace(',', '.'))
                    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== truss.height_cm) updateMutation.mutate({ height_cm: parsed })
                  }}
                  aria-label={`Hang height for ${truss.name} (cm)`}
                />
                cm
              </label>
              <span className="flex-1" />
              {/* A fact, not a control that cannot be pressed. */}
              {placed ? (
                <Pill className="bg-sky-500/15 text-sky-300">On this plot</Pill>
              ) : (
                <Button size="xs" variant="outline" onClick={onPlace}>
                  Place on this plot
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                className="w-7 p-0 text-zinc-500 hover:text-red-400"
                aria-label={`Delete truss ${truss.name}`}
                onClick={onRequestDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {element && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-500">
                <span className="flex-none">On this plot</span>
                <label className="flex items-center gap-1.5 text-zinc-400">
                  Rotation
                  <Input
                    className="h-7 w-16 text-right text-xs tabular-nums"
                    value={rotationDraft}
                    onChange={(e) => setRotationDraft(e.target.value)}
                    onBlur={() => {
                      const parsed = Number(rotationDraft.replace(',', '.'))
                      if (!Number.isFinite(parsed)) return setRotationDraft(String(element.rotation_deg))
                      const normalized = ((parsed % 360) + 360) % 360
                      if (normalized !== element.rotation_deg) onRotate(element.id, { rotation_deg: normalized })
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    aria-label={`Rotation for ${truss.name} (degrees)`}
                  />
                  °
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400">
                  Rake
                  <Input
                    className="h-7 w-16 text-right text-xs tabular-nums"
                    value={tiltDraft}
                    onChange={(e) => setTiltDraft(e.target.value)}
                    onBlur={() => {
                      const parsed = Number(tiltDraft.replace(',', '.'))
                      if (!Number.isFinite(parsed)) return setTiltDraft(String(element.tilt_deg))
                      const normalized = ((parsed % 360) + 360) % 360
                      if (normalized !== element.tilt_deg) onRotate(element.id, { tilt_deg: normalized })
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    aria-label={`Rake for ${truss.name} (degrees)`}
                  />
                  °
                </label>
                <span className="text-zinc-600">top view · front view</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Count only at the desk, where the total is already in the header row — a
          number has one home. The phone's header has no room for it, so there the
          band carries it. */}
      <Band label="Pieces" hint={touch ? `${truss.pieces.length} · ${truss.total_length_cm} cm` : String(truss.pieces.length)} pad={pad} />
      {truss.pieces.length === 0 && <EmptyRow pad={pad} touch={touch}>No pieces yet — this truss draws at 0 cm.</EmptyRow>}
      {truss.pieces.map((piece) => (
        <Row key={piece.id} pad={pad} touch={touch}>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{piece.item_name || piece.label || 'Piece'}</span>
            {/* The state, stated. It used to be an amber word whose meaning lived in a
                `title` — and a tooltip has no target on a touch screen. */}
            {!piece.inventory_item_id && (
              <GearSpecs>
                {touch ? (
                  /* The fix needs the catalog, which is a desk job — so the phone
                     is told the consequence and not an errand it cannot run. */
                  <span className="text-amber-300">not on the rental order</span>
                ) : (
                  <Spec tone="warning" label="not from the catalog · not on the rental order —" value="re-pick it to count" />
                )}
              </GearSpecs>
            )}
          </span>
          <span className="flex-none font-mono tabular-nums text-zinc-400">{piece.length_cm} cm</span>
          {!readOnly && (
            <Button
              size="xs"
              variant="ghost"
              className="w-7 flex-none p-0 text-zinc-500 hover:text-red-400"
              aria-label={`Remove piece ${piece.item_name || piece.label || 'Piece'} from ${truss.name}`}
              onClick={() => onRequestRemovePiece(piece)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </Row>
      ))}
      {!readOnly && (
        <div className={cn('flex items-center gap-2 border-b border-zinc-800/70 py-2', pad)}>
          <Select
            className="h-8 flex-1 text-xs"
            aria-label={`Truss piece to add to ${truss.name}`}
            value={pieceItemId}
            onChange={(e) => {
              setPieceItemId(e.target.value)
              const item = trussItems.find((entry) => entry.id === Number(e.target.value))
              const suggested = item ? parseLengthFromName(item.name) : null
              if (suggested != null) setPieceLength(String(suggested))
            }}
          >
            <option value="">{trussItems.length === 0 ? 'No truss pieces in the catalog' : 'Pick truss piece…'}</option>
            {trussItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.description ? ` — ${item.description}` : ''}
              </option>
            ))}
          </Select>
          <Input
            className="h-8 w-20 text-right text-xs tabular-nums"
            placeholder="cm"
            value={pieceLength}
            onChange={(e) => setPieceLength(e.target.value)}
            aria-label="Piece length (cm)"
          />
          <Button size="sm" className="h-8" disabled={!pieceItemId || !Number.isFinite(lengthValue) || lengthValue <= 0 || addPieceMutation.isPending} onClick={() => addPieceMutation.mutate()}>
            Add piece
          </Button>
        </div>
      )}

      <Band label="Fixtures" hint={String(truss.fixtures.length)} pad={pad} />
      {truss.fixtures.length === 0 && <EmptyRow pad={pad} touch={touch}>Nothing hung on it yet.</EmptyRow>}
      {truss.fixtures.map((fixture) => (
        <AttachedFixtureRow
          key={fixture.id}
          fixture={fixture}
          onReposition={(offsetCm, side) => repositionMutation.mutate({ fixtureId: fixture.fixture_id, offsetCm, side })}
          onDetach={() => detachMutation.mutate(fixture.fixture_id)}
          readOnly={readOnly}
          touch={touch}
          pad={pad}
        />
      ))}
      {!readOnly && (
        <div className={cn('flex items-center gap-2 py-2', pad)}>
          <Select
            className="h-8 flex-1 text-xs"
            aria-label={`Fixture to hang on ${truss.name}`}
            value={attachFixtureId}
            onChange={(e) => setAttachFixtureId(e.target.value)}
          >
            <option value="">{attachableFixtures.length === 0 ? 'Every rig fixture is already hung' : 'Attach fixture…'}</option>
            {attachableFixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixtureName(fixture)}
                {fixture.truss_name ? ` (on ${fixture.truss_name})` : ''}
              </option>
            ))}
          </Select>
          <Input
            className="h-8 w-20 text-right text-xs tabular-nums"
            placeholder="offset cm"
            value={attachOffset}
            onChange={(e) => setAttachOffset(e.target.value)}
            aria-label="Offset along truss (cm)"
          />
          <Button size="sm" className="h-8" disabled={!attachFixtureId || attachMutation.isPending} onClick={() => attachMutation.mutate()}>
            Attach
          </Button>
        </div>
      )}
    </div>
  )
}

/** A micro-label over a run of rows, ruled to the edge — `flush`'s own heading
 *  (patterns.md §4). The count rides in the label, not in a row of its own. */
function Band({ label, hint, pad, className }: { label: string; hint?: string; pad: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 pb-1.5 pt-2.5', pad, className)}>
      <MicroLabel>{label}</MicroLabel>
      {hint && <span className="font-mono text-[10px] text-zinc-600">{hint}</span>}
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  )
}

/** One full-bleed row. `touch` is the phone's tier: 44 px and 14 px type
 *  (tokens.md §7 amendment 2), against the work surface's 30 px and 12 px. */
function Row({ pad, touch, children }: { pad: string; touch: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 border-b border-zinc-800/70 last:border-b-0',
        touch ? 'min-h-[44px] py-1.5 text-sm text-zinc-100' : 'min-h-[30px] py-[3px] text-xs text-zinc-300',
        pad,
      )}
    >
      {children}
    </div>
  )
}

function EmptyRow({ pad, touch, children }: { pad: string; touch: boolean; children: ReactNode }) {
  return (
    <div
      className={cn('border-b border-zinc-800/70 text-zinc-500', touch ? 'min-h-[44px] py-2.5 text-sm' : 'py-1.5 text-xs', pad)}
    >
      {children}
    </div>
  )
}

/** One attached fixture: offset and lane editable in place (the
 *  fine-tuning counterpart to dragging the marker on the canvas), and stated
 *  as values where nothing may be changed. */
function AttachedFixtureRow({
  fixture,
  onReposition,
  onDetach,
  readOnly = false,
  touch = false,
  pad,
}: {
  fixture: PlotTrussFixture
  onReposition: (offsetCm: number | null, side: TrussSide) => void
  onDetach: () => void
  readOnly?: boolean
  touch?: boolean
  pad: string
}) {
  const [offsetDraft, setOffsetDraft] = useDraftState(fixture.offset_cm, String, '')

  if (readOnly) {
    return (
      <Row pad={pad} touch={touch}>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{fixture.fixture_name}</span>
          <GearSpecs>
            {fixture.fixture_number != null && <span>FID {fixture.fixture_number}</span>}
            <span>{fixture.side} lane</span>
          </GearSpecs>
        </span>
        {fixture.offset_cm != null ? (
          <span className="flex-none font-mono tabular-nums text-zinc-400">{fixture.offset_cm} cm</span>
        ) : (
          <span className="flex-none text-zinc-600">no offset</span>
        )}
      </Row>
    )
  }

  return (
    <Row pad={pad} touch={touch}>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {fixture.fixture_name}
          {fixture.fixture_number != null && <span className="font-mono text-[10px] text-zinc-600"> FID {fixture.fixture_number}</span>}
        </span>
        {/* An empty offset box is not the same as an offset of nothing: the fixture
            hangs where its marker was dropped, and the row says which. */}
        {fixture.offset_cm == null && (
          <GearSpecs>
            <span>no offset — it hangs where the marker was dropped</span>
          </GearSpecs>
        )}
      </span>
      <Input
        className="h-7 w-16 flex-none text-right text-xs tabular-nums"
        placeholder="cm"
        value={offsetDraft}
        onChange={(e) => setOffsetDraft(e.target.value)}
        onBlur={() => {
          if (offsetDraft.trim() === '') return
          const parsed = Number(offsetDraft.replace(',', '.'))
          if (Number.isFinite(parsed) && parsed >= 0 && parsed !== fixture.offset_cm) onReposition(parsed, fixture.side)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`Offset along truss for ${fixture.fixture_name} (cm)`}
      />
      <span className="flex-none text-zinc-500">cm</span>
      <Select
        className="h-7 w-24 flex-none text-xs"
        value={fixture.side}
        onChange={(e) => onReposition(fixture.offset_cm ?? null, e.target.value as TrussSide)}
        aria-label={`Lane for ${fixture.fixture_name}`}
      >
        <option value="top">Top</option>
        <option value="middle">Middle</option>
        <option value="bottom">Bottom</option>
      </Select>
      {/* No confirm: the picker in this row puts it back, nothing is redrawn
          anywhere else, and a confirm on a reversible act is what teaches
          people to dismiss confirms. */}
      <Button
        size="xs"
        variant="ghost"
        className="w-7 flex-none p-0 text-zinc-500 hover:text-red-400"
        aria-label={`Detach ${fixture.fixture_name} (it stays in the rig)`}
        onClick={onDetach}
      >
        <X className="h-4 w-4" />
      </Button>
    </Row>
  )
}
