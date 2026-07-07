import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { parseChannels, parseInOut } from '../lib/utils'
import type { InventoryItem, Stagebox, StageMulti } from '../types'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

// ─── Connector options ────────────────────────────────────────────────────────
const connectionTypes = ['analog', 'aes', 'dante', 'madi', 'ethersound', 'avb']
const multiConnectors = ['xlr', 'cat5e', 'cat6', 'cat6a', 'bnc', 'optical']

// ─── Empty drafts ─────────────────────────────────────────────────────────────
type SbDraft = { name: string; inventory_item_id: string; input_count: string; output_count: string; connection_type: string }
type SmDraft = { name: string; inventory_item_id: string; channels: string; connector_type: string; length_m: string }

const emptyBox: SbDraft = { name: '', inventory_item_id: '', input_count: '', output_count: '', connection_type: 'analog' }
const emptyMulti: SmDraft = { name: '', inventory_item_id: '', channels: '24', connector_type: 'xlr', length_m: '' }

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  audioItems: InventoryItem[]
  onCreateStagebox: (data: Omit<Stagebox, 'id'>) => void
  onUpdateStagebox: (id: number, data: Omit<Stagebox, 'id'>) => void
  onDeleteStagebox: (id: number) => void
  onCreateStageMulti: (data: Omit<StageMulti, 'id'>) => void
  onUpdateStageMulti: (id: number, data: Omit<StageMulti, 'id'>) => void
  onDeleteStageMulti: (id: number) => void
  eventId: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StageboxMultiManager({
  stageboxes, stageMultis, audioItems,
  onCreateStagebox, onUpdateStagebox, onDeleteStagebox,
  onCreateStageMulti, onUpdateStageMulti, onDeleteStageMulti,
  eventId,
}: Props) {
  const [boxOpen, setBoxOpen] = useState(true)
  const [multiOpen, setMultiOpen] = useState(true)
  const [addingBox, setAddingBox] = useState(false)
  const [addingMulti, setAddingMulti] = useState(false)
  const [boxDraft, setBoxDraft] = useState<SbDraft>(emptyBox)
  const [multiDraft, setMultiDraft] = useState<SmDraft>(emptyMulti)

  // Items that look like stage boxes — have in/out pattern in description
  const boxItems = audioItems.filter(i => parseInOut(i.description ?? '') !== null || (i.description ?? '').toLowerCase().includes('stagebox'))
  // Items that look like stage multis — cables or multi-channel items
  const multiItems = audioItems.filter(i =>
    (i.category_name ?? '').toLowerCase().includes('kabel') ||
    (i.category_name ?? '').toLowerCase().includes('multi') ||
    parseChannels(i.description ?? '') !== null
  )

  function handleBoxInventoryChange(itemId: string) {
    const item = audioItems.find(i => String(i.id) === itemId)
    if (!item) {
      setBoxDraft(d => ({ ...d, inventory_item_id: itemId }))
      return
    }
    const parsed = parseInOut(item.description ?? '')
    setBoxDraft(d => ({
      ...d,
      inventory_item_id: itemId,
      name: d.name || item.name,
      input_count: parsed ? String(parsed.inputs) : d.input_count,
      output_count: parsed ? String(parsed.outputs) : d.output_count,
    }))
  }

  function handleMultiInventoryChange(itemId: string) {
    const item = audioItems.find(i => String(i.id) === itemId)
    if (!item) {
      setMultiDraft(d => ({ ...d, inventory_item_id: itemId }))
      return
    }
    const ch = parseChannels(item.description ?? '')
    setMultiDraft(d => ({
      ...d,
      inventory_item_id: itemId,
      name: d.name || item.name,
      channels: ch ? String(ch) : d.channels,
    }))
  }

  function submitBox() {
    if (!boxDraft.name.trim()) return
    onCreateStagebox({
      event_id: eventId,
      name: boxDraft.name,
      model: audioItems.find(i => String(i.id) === boxDraft.inventory_item_id)?.name ?? '',
      input_count: parseInt(boxDraft.input_count) || 0,
      output_count: parseInt(boxDraft.output_count) || 0,
      connection_type: boxDraft.connection_type,
      inventory_item_id: boxDraft.inventory_item_id ? Number(boxDraft.inventory_item_id) : undefined,
    })
    setBoxDraft(emptyBox)
    setAddingBox(false)
  }

  function submitMulti() {
    if (!multiDraft.name.trim()) return
    onCreateStageMulti({
      event_id: eventId,
      name: multiDraft.name,
      channels: parseInt(multiDraft.channels) || 24,
      connector_type: multiDraft.connector_type,
      length_m: parseFloat(multiDraft.length_m) || 0,
      inventory_item_id: multiDraft.inventory_item_id ? Number(multiDraft.inventory_item_id) : undefined,
    })
    setMultiDraft(emptyMulti)
    setAddingMulti(false)
  }

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      {/* ── Stageboxes ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900">
        <button
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-200"
          onClick={() => setBoxOpen(o => !o)}
        >
          <span className="flex items-center gap-2">
            {boxOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Stageboxes
            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{stageboxes.length}</span>
          </span>
          <Button
            size="sm" variant="ghost"
            onClick={e => { e.stopPropagation(); setAddingBox(true); setBoxOpen(true) }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </button>

        {boxOpen && (
          <div className="border-t border-zinc-700">
            {stageboxes.length === 0 && !addingBox && (
              <p className="px-4 py-3 text-xs text-zinc-500">No stageboxes added yet.</p>
            )}
            {stageboxes.map(sb => (
              <StageboxRow
                key={sb.id}
                sb={sb}
                audioItems={boxItems}
                onUpdate={data => onUpdateStagebox(sb.id, data)}
                onDelete={() => onDeleteStagebox(sb.id)}
              />
            ))}

            {addingBox && (
              <div className="border-t border-zinc-700 bg-zinc-850 px-4 py-3 space-y-3">
                <p className="text-xs font-medium text-amber-400">New stagebox</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-zinc-400">Inventory model</label>
                    <Select value={boxDraft.inventory_item_id} onChange={e => handleBoxInventoryChange(e.target.value)}>
                      <option value="">— Custom / none —</option>
                      {boxItems.map(i => <option key={i.id} value={i.id}>{i.name}{i.description ? ` (${i.description})` : ''}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-zinc-400">Name *</label>
                    <Input value={boxDraft.name} onChange={e => setBoxDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Stage Left SB" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Inputs</label>
                    <Input type="number" min={0} value={boxDraft.input_count} onChange={e => setBoxDraft(d => ({ ...d, input_count: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Outputs</label>
                    <Input type="number" min={0} value={boxDraft.output_count} onChange={e => setBoxDraft(d => ({ ...d, output_count: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Connection type</label>
                    <Select value={boxDraft.connection_type} onChange={e => setBoxDraft(d => ({ ...d, connection_type: e.target.value }))}>
                      {connectionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { setAddingBox(false); setBoxDraft(emptyBox) }}>Cancel</Button>
                  <Button size="sm" onClick={submitBox} disabled={!boxDraft.name.trim()}>Save</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Stage Multis ───────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900">
        <button
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-200"
          onClick={() => setMultiOpen(o => !o)}
        >
          <span className="flex items-center gap-2">
            {multiOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Stage Multis
            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{stageMultis.length}</span>
          </span>
          <Button
            size="sm" variant="ghost"
            onClick={e => { e.stopPropagation(); setAddingMulti(true); setMultiOpen(true) }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </button>

        {multiOpen && (
          <div className="border-t border-zinc-700">
            {stageMultis.length === 0 && !addingMulti && (
              <p className="px-4 py-3 text-xs text-zinc-500">No stage multis added yet.</p>
            )}
            {stageMultis.map(sm => (
              <StageMultiRow
                key={sm.id}
                sm={sm}
                audioItems={multiItems}
                onUpdate={data => onUpdateStageMulti(sm.id, data)}
                onDelete={() => onDeleteStageMulti(sm.id)}
              />
            ))}

            {addingMulti && (
              <div className="border-t border-zinc-700 bg-zinc-850 px-4 py-3 space-y-3">
                <p className="text-xs font-medium text-amber-400">New stage multi</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-zinc-400">Inventory cable</label>
                    <Select value={multiDraft.inventory_item_id} onChange={e => handleMultiInventoryChange(e.target.value)}>
                      <option value="">— Custom / none —</option>
                      {multiItems.map(i => <option key={i.id} value={i.id}>{i.name}{i.description ? ` (${i.description})` : ''}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-zinc-400">Name *</label>
                    <Input value={multiDraft.name} onChange={e => setMultiDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. FOH Snake" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Channels</label>
                    <Input type="number" min={1} value={multiDraft.channels} onChange={e => setMultiDraft(d => ({ ...d, channels: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Length (m)</label>
                    <Input type="number" min={0} step={0.5} value={multiDraft.length_m} onChange={e => setMultiDraft(d => ({ ...d, length_m: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Connector</label>
                    <Select value={multiDraft.connector_type} onChange={e => setMultiDraft(d => ({ ...d, connector_type: e.target.value }))}>
                      {multiConnectors.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { setAddingMulti(false); setMultiDraft(emptyMulti) }}>Cancel</Button>
                  <Button size="sm" onClick={submitMulti} disabled={!multiDraft.name.trim()}>Save</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Inline-editable stagebox row ─────────────────────────────────────────────
function StageboxRow({ sb, audioItems, onUpdate, onDelete }: {
  sb: Stagebox
  audioItems: InventoryItem[]
  onUpdate: (data: Omit<Stagebox, 'id'>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(sb)
  const save = () => onUpdate({ ...draft })

  return (
    <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-2 border-b border-zinc-800 px-4 py-2 last:border-b-0">
      <Input
        value={draft.name}
        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        onBlur={save}
        placeholder="Name"
        className="text-xs"
      />
      <Select
        value={draft.inventory_item_id ?? ''}
        onChange={e => {
          const item = audioItems.find(i => String(i.id) === e.target.value)
          const parsed = item ? parseInOut(item.description ?? '') : null
          setDraft(d => ({
            ...d,
            inventory_item_id: e.target.value ? Number(e.target.value) : undefined,
            model: item?.name ?? d.model,
            input_count: parsed ? parsed.inputs : d.input_count,
            output_count: parsed ? parsed.outputs : d.output_count,
          }))
        }}
        onBlur={save}
        className="text-xs"
      >
        <option value="">Custom</option>
        {audioItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </Select>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">In</span>
        <Input type="number" min={0} value={draft.input_count} onChange={e => setDraft(d => ({ ...d, input_count: Number(e.target.value) }))} onBlur={save} className="w-14 text-xs text-center" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">Out</span>
        <Input type="number" min={0} value={draft.output_count} onChange={e => setDraft(d => ({ ...d, output_count: Number(e.target.value) }))} onBlur={save} className="w-14 text-xs text-center" />
      </div>
      <Select value={draft.connection_type} onChange={e => setDraft(d => ({ ...d, connection_type: e.target.value }))} onBlur={save} className="text-xs w-24">
        {connectionTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </Select>
      <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  )
}

// ─── Inline-editable stage multi row ─────────────────────────────────────────
function StageMultiRow({ sm, audioItems, onUpdate, onDelete }: {
  sm: StageMulti
  audioItems: InventoryItem[]
  onUpdate: (data: Omit<StageMulti, 'id'>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(sm)
  const save = () => onUpdate({ ...draft })

  return (
    <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-2 border-b border-zinc-800 px-4 py-2 last:border-b-0">
      <Input
        value={draft.name}
        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        onBlur={save}
        placeholder="Name"
        className="text-xs"
      />
      <Select
        value={draft.inventory_item_id ?? ''}
        onChange={e => {
          const item = audioItems.find(i => String(i.id) === e.target.value)
          const ch = item ? parseChannels(item.description ?? '') : null
          setDraft(d => ({
            ...d,
            inventory_item_id: e.target.value ? Number(e.target.value) : undefined,
            channels: ch ?? d.channels,
          }))
        }}
        onBlur={save}
        className="text-xs"
      >
        <option value="">Custom</option>
        {audioItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </Select>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">Ch</span>
        <Input type="number" min={1} value={draft.channels} onChange={e => setDraft(d => ({ ...d, channels: Number(e.target.value) }))} onBlur={save} className="w-14 text-xs text-center" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">m</span>
        <Input type="number" min={0} step={0.5} value={draft.length_m || ''} onChange={e => setDraft(d => ({ ...d, length_m: Number(e.target.value) }))} onBlur={save} className="w-16 text-xs text-center" />
      </div>
      <Select value={draft.connector_type} onChange={e => setDraft(d => ({ ...d, connector_type: e.target.value }))} onBlur={save} className="text-xs w-20">
        {multiConnectors.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
      </Select>
      <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  )
}
