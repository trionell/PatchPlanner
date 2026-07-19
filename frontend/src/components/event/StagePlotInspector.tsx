import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, LockOpen, Plus, Trash2, X } from 'lucide-react'
import type { StagePlotElement, StagePlotEntityKind, StagePlotLayer, StagePlotLink, StagePlotLinkRole } from '../../types'
import type { StagePlotElementCreate, StagePlotElementPatch } from '../../api/stagePlots'
import { getAudioPatch } from '../../api/audioPatch'
import { getLightingRig } from '../../api/lighting'
import { useDraftState } from '../../hooks/useDraftState'
import { clampDimension, roundCm } from '../../lib/stagePlot'
import { STAGE_PLOT_ICONS } from '../../lib/stagePlotIcons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface StagePlotInspectorProps {
  eventId: number
  element: StagePlotElement | null
  layers: StagePlotLayer[]
  onUpdate: (id: number, patch: StagePlotElementPatch) => void
  onDuplicate: (template: StagePlotElementCreate) => void
  onDelete: (id: number) => void
  onAddLink: (elementId: number, role: StagePlotLinkRole, entityKind: StagePlotEntityKind, entityId: number, sortOrder: number) => void
  onReorderLink: (elementId: number, linkId: number, sortOrder: number) => void
  onDeleteLink: (elementId: number, linkId: number) => void
}

const ENTITY_KIND_LABELS: Record<StagePlotEntityKind, string> = {
  input_source: 'Input source',
  input_channel: 'Input channel',
  output_device: 'Output device',
  input_device: 'Input device',
  stagebox: 'Stagebox',
  stage_multi: 'Stage multi',
  lighting_fixture: 'Fixture',
}

interface ElementDraft {
  name: string
  x: string
  y: string
  z: string
  width: string
  depth: string
  height: string
  rotation: string
  tilt: string
}

function toDraft(element: StagePlotElement): ElementDraft {
  return {
    name: element.name,
    x: String(element.x_cm),
    y: String(element.y_cm),
    z: String(element.z_cm),
    width: String(element.width_cm),
    depth: String(element.depth_cm),
    height: String(element.height_cm),
    rotation: String(element.rotation_deg),
    tilt: String(element.tilt_deg),
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_1fr] items-center gap-2">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex gap-1.5">{children}</div>
    </div>
  )
}

// ---- Layers panel ----

export interface LayersPanelProps {
  layers: StagePlotLayer[]
  activeLayerId: number | null
  onSetActive: (id: number) => void
  onCreate: (name: string) => void
  onUpdate: (id: number, patch: Partial<Omit<StagePlotLayer, 'id' | 'plot_id'>>) => void
  onDelete: (id: number) => void
}

/** Layer list: active-layer selection, visibility, lock, color,
 *  rename, reorder, and delete-with-confirmation (US3). */
export function StagePlotLayersPanel({ layers, activeLayerId, onSetActive, onCreate, onUpdate, onDelete }: LayersPanelProps) {
  const [newName, setNewName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const ordered = [...layers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  const swapOrder = (index: number, direction: -1 | 1) => {
    const other = ordered[index + direction]
    const layer = ordered[index]
    if (!other) return
    onUpdate(layer.id, { sort_order: other.sort_order })
    onUpdate(other.id, { sort_order: layer.sort_order })
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Layers</p>
      {ordered.map((layer, index) => (
        <div
          key={layer.id}
          className={
            layer.id === activeLayerId
              ? 'flex items-center gap-1.5 rounded-md bg-zinc-800 px-1.5 py-1 text-sm text-zinc-100'
              : 'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800/50'
          }
        >
          <input
            type="color"
            value={layer.color || '#a1a1aa'}
            onChange={(e) => onUpdate(layer.id, { color: e.target.value })}
            className="h-4 w-4 flex-none cursor-pointer appearance-none rounded border-0 bg-transparent p-0"
            title="Layer color"
          />
          {renamingId === layer.id ? (
            <form
              className="flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (renameValue.trim()) onUpdate(layer.id, { name: renameValue.trim() })
                setRenamingId(null)
              }}
            >
              <Input autoFocus className="h-6 px-1.5 text-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => setRenamingId(null)} />
            </form>
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSetActive(layer.id)}
              onDoubleClick={() => {
                setRenamingId(layer.id)
                setRenameValue(layer.name)
              }}
              title="Click to activate, double-click to rename"
            >
              {layer.name}
            </button>
          )}
          <button type="button" className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30" disabled={index === 0} onClick={() => swapOrder(index, -1)} title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30" disabled={index === ordered.length - 1} onClick={() => swapOrder(index, 1)} title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => onUpdate(layer.id, { visible: !layer.visible })} title={layer.visible ? 'Hide layer' : 'Show layer'}>
            {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => onUpdate(layer.id, { locked: !layer.locked })} title={layer.locked ? 'Unlock layer' : 'Lock layer'}>
            {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="text-zinc-500 hover:text-red-400 disabled:opacity-30"
            disabled={ordered.length <= 1}
            onClick={() => {
              if (window.confirm(`Delete layer "${layer.name}" and every element on it?`)) onDelete(layer.id)
            }}
            title={ordered.length <= 1 ? 'A plot always keeps at least one layer' : 'Delete layer and its elements'}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {newName == null ? (
        <button type="button" className="mt-0.5 self-start text-xs text-amber-400 hover:text-amber-300" onClick={() => setNewName('')}>
          <Plus className="mr-0.5 inline h-3 w-3" />
          Add layer
        </button>
      ) : (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) onCreate(newName.trim())
            setNewName(null)
          }}
        >
          <Input autoFocus className="h-7 text-sm" placeholder="Layer name" value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => setNewName(null)} />
        </form>
      )}
    </div>
  )
}

// ---- Assignments & stack (US4) ----

interface LinksSectionProps {
  eventId: number
  element: StagePlotElement
  disabled: boolean
  onAdd: (role: StagePlotLinkRole, entityKind: StagePlotEntityKind, entityId: number, sortOrder: number) => void
  onReorder: (linkId: number, sortOrder: number) => void
  onRemove: (linkId: number) => void
}

/** Assignments (any planned entity) and stack entries (devices sharing
 *  the element's footprint), both picked from existing event data —
 *  never free text (FR-013). */
function LinksSection({ eventId, element, disabled, onAdd, onReorder, onRemove }: LinksSectionProps) {
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const [addingRole, setAddingRole] = useState<StagePlotLinkRole | null>(null)
  const [pickKind, setPickKind] = useState<StagePlotEntityKind>('input_source')
  const [pickId, setPickId] = useState('')

  const audio = audioQuery.data
  const entityOptions: Record<StagePlotEntityKind, Array<{ id: number; name: string }>> = {
    input_source: (audio?.input_sources ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    input_channel: (audio?.input_channels ?? []).map((entry) => ({ id: entry.id, name: entry.channel_name || `Channel ${entry.channel_number}` })),
    output_device: (audio?.output_devices ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    input_device: (audio?.input_devices ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    stagebox: (audio?.stageboxes ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    stage_multi: (audio?.stage_multis ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    lighting_fixture: (lightingQuery.data?.fixtures ?? []).map((entry) => ({
      id: entry.id,
      name: entry.custom_name || entry.inventory_item_name || `Fixture ${entry.id}`,
    })),
  }

  const assignments = element.links.filter((link) => link.role === 'assignment')
  const stack = element.links.filter((link) => link.role === 'stack').sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  const startAdd = (role: StagePlotLinkRole) => {
    setAddingRole(role)
    setPickKind(role === 'stack' ? 'output_device' : 'input_source')
    setPickId('')
  }

  const submitAdd = () => {
    if (addingRole && pickId) {
      const nextOrder = addingRole === 'stack' ? (stack[stack.length - 1]?.sort_order ?? 0) + 1 : 0
      onAdd(addingRole, pickKind, Number(pickId), nextOrder)
    }
    setAddingRole(null)
  }

  const renderStackRow = (link: StagePlotLink, index: number) => (
    <div key={link.id} className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-1.5 py-1 text-xs text-zinc-300">
      <span className="min-w-0 flex-1 truncate">{link.display_name}</span>
      <button
        type="button"
        className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
        disabled={disabled || index === 0}
        onClick={() => {
          onReorder(link.id, stack[index - 1].sort_order)
          onReorder(stack[index - 1].id, link.sort_order)
        }}
        title="Move up in stack"
      >
        <ArrowUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
        disabled={disabled || index === stack.length - 1}
        onClick={() => {
          onReorder(link.id, stack[index + 1].sort_order)
          onReorder(stack[index + 1].id, link.sort_order)
        }}
        title="Move down in stack"
      >
        <ArrowDown className="h-3 w-3" />
      </button>
      <button type="button" className="text-zinc-500 hover:text-red-400" disabled={disabled} onClick={() => onRemove(link.id)} title="Remove from stack">
        <X className="h-3 w-3" />
      </button>
    </div>
  )

  const addForm = addingRole != null && (
    <div className="flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 p-1.5">
      <Select className="h-7 text-xs" value={pickKind} onChange={(e) => { setPickKind(e.target.value as StagePlotEntityKind); setPickId('') }}
        options={(Object.keys(ENTITY_KIND_LABELS) as StagePlotEntityKind[]).map((kind) => ({ label: ENTITY_KIND_LABELS[kind], value: kind }))} />
      <Select className="h-7 text-xs" value={pickId} onChange={(e) => setPickId(e.target.value)}>
        <option value="">Select…</option>
        {entityOptions[pickKind].map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </Select>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-6 flex-1 text-xs" disabled={!pickId} onClick={submitAdd}>Add</Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAddingRole(null)}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Assignments</p>
        <div className="flex flex-wrap gap-1">
          {assignments.map((link) => (
            <span key={link.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              {link.display_name}
              <button type="button" className="text-zinc-500 hover:text-red-400" disabled={disabled} onClick={() => onRemove(link.id)} title="Remove assignment">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {addingRole === 'assignment' ? addForm : (
          <button type="button" className="mt-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-40" disabled={disabled} onClick={() => startAdd('assignment')}>
            <Plus className="mr-0.5 inline h-3 w-3" />
            Assign source / channel / device
          </button>
        )}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Stack — {stack.length} item{stack.length === 1 ? '' : 's'}</p>
        <div className="flex flex-col gap-1">{stack.map(renderStackRow)}</div>
        {addingRole === 'stack' ? addForm : (
          <button type="button" className="mt-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-40" disabled={disabled} onClick={() => startAdd('stack')}>
            <Plus className="mr-0.5 inline h-3 w-3" />
            Add to stack
          </button>
        )}
      </div>
    </div>
  )
}

/** Right-hand inspector: exact numeric editing of the selected element.
 *  Values commit on blur or Enter (FR-022). */
export function StagePlotInspector({ eventId, element, layers, onUpdate, onDuplicate, onDelete, onAddLink, onReorderLink, onDeleteLink }: StagePlotInspectorProps) {
  const [draft, setDraft] = useDraftState<StagePlotElement, ElementDraft>(element ?? undefined, toDraft, {
    name: '', x: '0', y: '0', z: '0', width: '0', depth: '0', height: '0', rotation: '0', tilt: '0',
  })

  if (!element) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-500">
        Select an element to edit its exact position, size and rotation.
      </div>
    )
  }

  const layer = layers.find((entry) => entry.id === element.layer_id)
  const locked = layer?.locked ?? false

  const commitNumber = (field: keyof ElementDraft, patchKey: keyof StagePlotElementPatch, transform?: (value: number) => number) => {
    const parsed = Number(draft[field].replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setDraft(toDraft(element))
      return
    }
    const value = roundCm(transform ? transform(parsed) : parsed)
    if (value !== element[patchKey as keyof StagePlotElement]) {
      onUpdate(element.id, { [patchKey]: value })
    }
  }

  const kindTitle =
    element.kind === 'shape'
      ? `Shape · ${element.shape_kind}`
      : element.kind === 'resource'
        ? (STAGE_PLOT_ICONS.find((icon) => icon.id === element.icon)?.label ?? 'Resource')
        : element.kind === 'truss'
          ? 'Truss'
          : 'Fixture'

  return (
    <div className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Inspector</p>
        <p className="mt-0.5 text-sm font-medium text-zinc-200">{element.name || kindTitle}</p>
        <p className="text-xs text-zinc-500">{kindTitle}{layer ? ` · ${layer.name}` : ''}{locked ? ' · locked' : ''}</p>
      </div>

      <fieldset disabled={locked} className="flex flex-col gap-2">
        <Row label="Name">
          <Input
            className="h-8"
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            onBlur={() => draft.name !== element.name && onUpdate(element.id, { name: draft.name })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Row>

        {element.kind === 'resource' && (
          <Row label="Icon">
            <Select
              className="h-8"
              value={element.icon ?? ''}
              onChange={(e) => onUpdate(element.id, { icon: e.target.value })}
              options={STAGE_PLOT_ICONS.map((icon) => ({ label: icon.label, value: icon.id }))}
            />
          </Row>
        )}

        <Row label="Layer">
          <Select
            className="h-8"
            value={element.layer_id}
            onChange={(e) => onUpdate(element.id, { layer_id: Number(e.target.value) })}
            options={layers.map((entry) => ({ label: entry.name, value: entry.id }))}
          />
        </Row>

        <Row label="Position">
          <Input
            className="h-8 text-right tabular-nums"
            value={draft.x}
            onChange={(e) => setDraft((prev) => ({ ...prev, x: e.target.value }))}
            onBlur={() => commitNumber('x', 'x_cm')}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="X position (cm)"
          />
          <Input
            className="h-8 text-right tabular-nums"
            value={draft.y}
            onChange={(e) => setDraft((prev) => ({ ...prev, y: e.target.value }))}
            onBlur={() => commitNumber('y', 'y_cm')}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Y position (cm)"
          />
        </Row>

        {element.kind !== 'truss' && (
          <Row label="Size (cm)">
            <Input
              className="h-8 text-right tabular-nums"
              value={draft.width}
              onChange={(e) => setDraft((prev) => ({ ...prev, width: e.target.value }))}
              onBlur={() => commitNumber('width', 'width_cm', clampDimension)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Width (cm)"
            />
            <Input
              className="h-8 text-right tabular-nums"
              value={draft.depth}
              onChange={(e) => setDraft((prev) => ({ ...prev, depth: e.target.value }))}
              onBlur={() => commitNumber('depth', 'depth_cm', (value) => Math.max(0, value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Depth (cm)"
            />
          </Row>
        )}

        {element.kind !== 'truss' && (
          <Row label="Height (cm)">
            <Input
              className="h-8 text-right tabular-nums"
              value={draft.height}
              onChange={(e) => setDraft((prev) => ({ ...prev, height: e.target.value }))}
              onBlur={() => commitNumber('height', 'height_cm', (value) => Math.max(0, value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Element height (cm)"
              title="Vertical extent, drawn in the front/side views (e.g. a 60 cm stage deck)"
            />
          </Row>
        )}
        {element.kind !== 'truss' && (
          <Row label="Elevation">
            <Input
              className="h-8 text-right tabular-nums"
              value={draft.z}
              onChange={(e) => setDraft((prev) => ({ ...prev, z: e.target.value }))}
              onBlur={() => commitNumber('z', 'z_cm', (value) => Math.max(0, value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Elevation above floor (cm)"
              title="Bottom edge above the floor in cm — front/side views"
            />
          </Row>
        )}

        <Row label="Rotation">
          <Input
            className="h-8 text-right tabular-nums"
            value={draft.rotation}
            onChange={(e) => setDraft((prev) => ({ ...prev, rotation: e.target.value }))}
            onBlur={() => commitNumber('rotation', 'rotation_deg', (value) => ((value % 360) + 360) % 360)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Rotation (degrees)"
            title="Rotation in the top view (degrees)"
          />
        </Row>

        <Row label="Tilt">
          <Input
            className="h-8 text-right tabular-nums"
            value={draft.tilt}
            onChange={(e) => setDraft((prev) => ({ ...prev, tilt: e.target.value }))}
            onBlur={() => commitNumber('tilt', 'tilt_deg', (value) => ((value % 360) + 360) % 360)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Tilt (degrees)"
            title="Rake in the front view (degrees) — e.g. an angled truss"
          />
        </Row>
      </fieldset>

      {(element.kind === 'resource' || element.kind === 'shape') && (
        <LinksSection
          eventId={eventId}
          element={element}
          disabled={locked}
          onAdd={(role, entityKind, entityId, sortOrder) => onAddLink(element.id, role, entityKind, entityId, sortOrder)}
          onReorder={(linkId, sortOrder) => onReorderLink(element.id, linkId, sortOrder)}
          onRemove={(linkId) => onDeleteLink(element.id, linkId)}
        />
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={locked || element.kind === 'truss' || element.kind === 'fixture'}
          onClick={() =>
            onDuplicate({
              layer_id: element.layer_id,
              kind: element.kind,
              shape_kind: element.shape_kind,
              icon: element.icon,
              name: element.name,
              x_cm: element.x_cm + 30,
              y_cm: element.y_cm + 30,
              z_cm: element.z_cm,
              width_cm: element.width_cm,
              depth_cm: element.depth_cm,
              height_cm: element.height_cm,
              rotation_deg: element.rotation_deg,
              tilt_deg: element.tilt_deg,
              notes: element.notes,
            })
          }
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
        </Button>
        <Button variant="destructive" size="sm" disabled={locked} onClick={() => onDelete(element.id)}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  )
}
