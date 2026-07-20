import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { listInventoryItems } from '../../api/inventory'
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
import { parseLengthFromName } from '../../lib/stagePlot'
import type { PlotTruss, PlotTrussFixture, TrussSide } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
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
}

export interface PlacedTrussElement {
  id: number
  rotation_deg: number
  tilt_deg: number
}

/** Event-level truss manager (US5): assemble trusses from inventory
 *  truss pieces (lengths auto-suggested from catalog names), set hang
 *  height, and attach rig fixtures at offsets along the truss. */
export function PlotTrussManager({ eventId, trusses, open, onClose, onChanged, onPlace, placedTrussIds, placedElements, onRotate, readOnly = false }: PlotTrussManagerProps) {
  const queryClient = useQueryClient()
  const trussItemsQuery = useQuery({
    queryKey: ['inventory-truss-items'],
    queryFn: () => listInventoryItems({ role: 'truss' }),
    enabled: open,
  })
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId), enabled: open })

  const [newName, setNewName] = useState('')

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

  return (
    <Dialog open={open} onClose={onClose} title="Trusses">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-sm text-zinc-400">
          Trusses belong to the event and are counted once on the rental order no matter how many plots show them. Assemble each
          truss from the inventory's truss pieces — its drawn length is exactly the sum of the pieces. Fixtures can also be hung by
          drag-and-drop: place one from the palette's Rig fixtures and drop it onto a truss bar, then drag its marker along the bar.
        </p>
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
            readOnly={readOnly}
          />
        ))}
        {!readOnly && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim()) createMutation.mutate(newName.trim())
            }}
          >
            <Input className="h-9" placeholder="New truss name (e.g. Front truss)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button type="submit" size="sm" disabled={!newName.trim() || createMutation.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </form>
        )}
      </div>
    </Dialog>
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
  readOnly?: boolean
}

function TrussEditor({ eventId, truss, trussItems, fixtures, onChanged, onPlace, placed, element, onRotate, readOnly = false }: TrussEditorProps) {
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
  const deleteMutation = useMutation({
    mutationFn: () => deletePlotTruss(eventId, truss.id),
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
  const removePieceMutation = useMutation({
    mutationFn: (pieceId: number) => deletePlotTrussPiece(eventId, truss.id, pieceId),
    onSuccess: onChanged,
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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Input
          className="h-8 font-medium"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft !== truss.name && updateMutation.mutate({ name: nameDraft.trim() })}
          disabled={readOnly}
        />
        <label className="flex flex-none items-center gap-1.5 text-xs text-zinc-400">
          Height
          <Input
            className="h-8 w-20 text-right tabular-nums"
            value={heightDraft}
            onChange={(e) => setHeightDraft(e.target.value)}
            onBlur={() => {
              const parsed = Number(heightDraft.replace(',', '.'))
              if (Number.isFinite(parsed) && parsed >= 0 && parsed !== truss.height_cm) updateMutation.mutate({ height_cm: parsed })
            }}
            disabled={readOnly}
          />
          cm
        </label>
        {!readOnly && (
          <Button size="sm" variant="outline" disabled={placed} title={placed ? 'Already on this plot' : 'Place on the current plot'} onClick={onPlace}>
            {placed ? 'On plot' : 'Place'}
          </Button>
        )}
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            title="Delete truss (pieces and placements go with it; rig fixtures stay)"
            onClick={() => {
              if (window.confirm(`Delete truss "${truss.name}"? Its pieces and plot placements are removed; the rig's fixtures are kept.`)) deleteMutation.mutate()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {element && (
        <div className="mb-2 flex items-center gap-3 text-xs text-zinc-400">
          <label className="flex items-center gap-1.5" title="Rotation in the top view (degrees)">
            Rotation (top)
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
              aria-label={`Top-view rotation for ${truss.name} (degrees)`}
              disabled={readOnly}
            />
            °
          </label>
          <label className="flex items-center gap-1.5" title="Rotation in the front view (degrees) — rakes the truss">
            Rotation (front)
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
              aria-label={`Front-view rotation for ${truss.name} (degrees)`}
              disabled={readOnly}
            />
            °
          </label>
          <span className="text-zinc-500">on this plot</span>
        </div>
      )}

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Pieces — total {truss.total_length_cm} cm
      </p>
      <div className="mb-2 flex flex-col gap-1">
        {truss.pieces.map((piece) => (
          <div key={piece.id} className="flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
            <span className="min-w-0 flex-1 truncate">
              {piece.item_name || piece.label || 'Piece'}
              {!piece.inventory_item_id && <span className="ml-1 text-amber-400" title="Legacy piece — not on the rental order until re-picked from the catalog">(legacy)</span>}
            </span>
            <span className="tabular-nums text-zinc-400">{piece.length_cm} cm</span>
            {!readOnly && (
              <button type="button" className="text-zinc-500 hover:text-red-400" onClick={() => removePieceMutation.mutate(piece.id)} title="Remove piece">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mb-3 flex items-center gap-2">
          <Select
            className="h-8 flex-1 text-xs"
            value={pieceItemId}
            onChange={(e) => {
              setPieceItemId(e.target.value)
              const item = trussItems.find((entry) => entry.id === Number(e.target.value))
              const suggested = item ? parseLengthFromName(item.name) : null
              if (suggested != null) setPieceLength(String(suggested))
            }}
          >
            <option value="">Pick truss piece…</option>
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
            Add
          </Button>
        </div>
      )}

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Fixtures</p>
      <div className="mb-2 flex flex-col gap-1">
        {truss.fixtures.map((fixture) => (
          <AttachedFixtureRow
            key={fixture.id}
            fixture={fixture}
            onReposition={(offsetCm, side) => repositionMutation.mutate({ fixtureId: fixture.fixture_id, offsetCm, side })}
            onDetach={() => detachMutation.mutate(fixture.fixture_id)}
            readOnly={readOnly}
          />
        ))}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Select className="h-8 flex-1 text-xs" value={attachFixtureId} onChange={(e) => setAttachFixtureId(e.target.value)}>
            <option value="">Attach fixture…</option>
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

/** One attached fixture: offset and lane editable in place (the
 *  fine-tuning counterpart to dragging the marker on the canvas). */
function AttachedFixtureRow({
  fixture,
  onReposition,
  onDetach,
  readOnly = false,
}: {
  fixture: PlotTrussFixture
  onReposition: (offsetCm: number | null, side: TrussSide) => void
  onDetach: () => void
  readOnly?: boolean
}) {
  const [offsetDraft, setOffsetDraft] = useDraftState(fixture.offset_cm, String, '')
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
      <span className="min-w-0 flex-1 truncate">
        {fixture.fixture_name}
        {fixture.fixture_number != null && <span className="text-zinc-500"> · FID {fixture.fixture_number}</span>}
      </span>
      <Input
        className="h-7 w-16 text-right text-xs tabular-nums"
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
        disabled={readOnly}
      />
      <Select
        className="h-7 w-24 text-xs"
        value={fixture.side}
        onChange={(e) => onReposition(fixture.offset_cm ?? null, e.target.value as TrussSide)}
        aria-label={`Lane for ${fixture.fixture_name}`}
        disabled={readOnly}
      >
        <option value="top">Top</option>
        <option value="middle">Middle</option>
        <option value="bottom">Bottom</option>
      </Select>
      {!readOnly && (
        <button type="button" className="text-zinc-500 hover:text-red-400" onClick={onDetach} title="Detach (fixture stays in the rig)">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
