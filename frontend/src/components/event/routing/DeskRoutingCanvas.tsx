import { useMemo, useState } from 'react'
import { groupDepths, mixLabel, mixesOfKind, type RoutingTable } from '../../../lib/deskRouting'
import { stripLabel } from '../../../lib/deskStrips'
import { cn } from '../../../lib/utils'
import type { AudioPatchOutput, Console, DeskMix, DeskModel, DeskRoute, InputChannel, MixKind } from '../../../types'
import { Button } from '../../ui/Button'
import { MicroLabel } from '../../ui/Label'

interface CanvasNode {
  key: string
  label: string
  sub?: string
  color?: string
  col: number
  row: number
  table?: RoutingTable
}

const COL_W = 168
const NODE_W = 132
const NODE_H = 30
const ROW_GAP = 8
const PAD = 24

const TABLE_OF: Record<MixKind, RoutingTable> = { main: 'mains', subgroup: 'subgroups', monitor: 'monitors', fx: 'fx', matrix: 'matrices', dca: 'dcas', mute: 'mutes' }

interface DeskRoutingCanvasProps {
  desk: Console
  model: DeskModel
  channels: InputChannel[]
  mixes: DeskMix[]
  routes: DeskRoute[]
  outputs: AudioPatchOutput[]
  search: string
  onOpenTable: (table: RoutingTable) => void
}

/**
 * Flow on Desk Routing (Slice 48 §06, C1): the inside of the selected desk, in signal
 * order — channels, groups or buses, mains, matrices, outputs, the recorder. LV1
 * groups sit by feed-forward depth so every edge runs left to right. Mix → mix and
 * mix → output edges are always drawn; a channel's only when it is selected, since
 * thirty channels into sixteen mixes is a texture, not a picture. Routes are not
 * drawn by dragging: the rail lists a selection's sources and feeds and opens its
 * table.
 */
export function DeskRoutingCanvas({ desk, model, channels, mixes, routes, outputs, search, onOpenTable }: DeskRoutingCanvasProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const { nodes, columns } = useMemo(() => {
    const nodes: CanvasNode[] = []
    const columns: string[] = []
    const push = (title: string, items: Omit<CanvasNode, 'col' | 'row'>[]) => {
      if (items.length === 0) return
      const col = columns.length
      columns.push(title)
      items.forEach((item, row) => nodes.push({ ...item, col, row }))
    }
    const mixNode = (mix: DeskMix) => ({ key: `mix:${mix.id}`, label: mixLabel(mix), sub: `${mix.kind} ${mix.slot}`, color: mix.color, table: TABLE_OF[mix.kind] })
    push('Channels', channels.map((channel) => ({ key: `channel:${channel.id}`, label: channel.channel_name || 'unnamed', sub: stripLabel(model, channel), color: channel.color })))
    if (model.engine === 'x32') {
      const buses = mixes.filter((mix) => mix.kind === 'subgroup' || mix.kind === 'monitor' || mix.kind === 'fx').sort((a, b) => a.slot - b.slot)
      push('Buses', buses.map(mixNode))
    } else {
      const groups = mixesOfKind(mixes, 'subgroup')
      const depth = groupDepths(groups, routes)
      const deepest = Math.max(0, ...depth.values())
      for (let d = 0; d <= deepest; d++) {
        push(d === 0 ? 'Groups' : `Groups ·${d + 1}`, groups.filter((group) => (depth.get(group.id) ?? 0) === d).map(mixNode))
      }
      push('Mon · FX', [...mixesOfKind(mixes, 'monitor'), ...mixesOfKind(mixes, 'fx')].map(mixNode))
    }
    push('Mains', mixesOfKind(mixes, 'main').map(mixNode))
    push('Matrices', mixesOfKind(mixes, 'matrix').map(mixNode))
    push('Outputs', outputs.map((output) => ({ key: `output:${output.id}`, label: output.output_name || `Out ${output.output_number}`, sub: output.output_type, color: output.color })))
    if (desk.recorder) push('Recorder', [{ key: `recorder:${desk.id}`, label: model.engine === 'x32' ? 'Card' : 'Recorder', sub: model.engine === 'lv1' ? 'SoundGrid' : undefined, table: 'recorder' }])
    return { nodes, columns }
  }, [channels, desk, mixes, model, outputs, routes])

  const at = new Map(nodes.map((node) => [node.key, node]))
  const x = (node: CanvasNode) => PAD + node.col * COL_W
  const y = (node: CanvasNode) => PAD + 22 + node.row * (NODE_H + ROW_GAP)
  const height = PAD * 2 + 22 + Math.max(1, ...columns.map((_, col) => nodes.filter((node) => node.col === col).length)) * (NODE_H + ROW_GAP)
  const width = PAD * 2 + columns.length * COL_W

  const edges = routes
    .filter((route) => route.dst_kind !== 'channel' || route.src_kind === 'recorder')
    .map((route) => ({ route, from: at.get(`${route.src_kind}:${route.src_id}`), to: at.get(`${route.dst_kind}:${route.dst_id}`) }))
    .filter((edge): edge is { route: DeskRoute; from: CanvasNode; to: CanvasNode } => !!edge.from && !!edge.to)
    .filter(({ from, to }) => {
      const touchesChannel = from.key.startsWith('channel:') || to.key.startsWith('channel:')
      return !touchesChannel || from.key === selected || to.key === selected
    })

  const q = search.trim().toLowerCase()
  const matches = (node: CanvasNode) => !q || node.label.toLowerCase().includes(q) || (node.sub ?? '').toLowerCase().includes(q)
  const memberCount = (key: string) => routes.filter((route) => route.src_kind === 'channel' && `${route.dst_kind}:${route.dst_id}` === key).length

  const selection = selected ? at.get(selected) : undefined
  const sources = selection ? routes.filter((route) => `${route.dst_kind}:${route.dst_id}` === selection.key).map((route) => at.get(`${route.src_kind}:${route.src_id}`)).filter(Boolean) : []
  const feeds = selection ? routes.filter((route) => `${route.src_kind}:${route.src_id}` === selection.key).map((route) => at.get(`${route.dst_kind}:${route.dst_id}`)).filter(Boolean) : []

  return (
    <div className="flex min-h-[24rem]">
      <div className="relative flex-1 overflow-auto">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {edges.map(({ route, from, to }) => {
              const x1 = x(from) + NODE_W
              const y1 = y(from) + NODE_H / 2
              const x2 = x(to)
              const y2 = y(to) + NODE_H / 2
              const mid = (x1 + x2) / 2
              const network = from.key.startsWith('recorder:') || to.key.startsWith('recorder:')
              return (
                <path
                  key={route.id}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={from.color || '#71717a'}
                  strokeOpacity={0.8}
                  strokeWidth={1.25}
                  strokeDasharray={network && model.engine === 'lv1' ? '6 3' : undefined}
                />
              )
            })}
          </svg>
          {columns.map((title, col) => (
            <div key={title} className="absolute" style={{ left: PAD + col * COL_W, top: PAD - 4 }}>
              <MicroLabel>{title}</MicroLabel>
            </div>
          ))}
          {nodes.map((node) => {
            const members = memberCount(node.key)
            return (
              <button
                key={node.key}
                type="button"
                onClick={() => setSelected(node.key === selected ? null : node.key)}
                className={cn(
                  'absolute flex items-center gap-1.5 truncate rounded-md border bg-zinc-900 px-2 text-left text-xs transition-opacity',
                  node.key === selected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-zinc-700 hover:border-zinc-500',
                  !matches(node) && 'opacity-30',
                )}
                style={{ left: x(node), top: y(node), width: NODE_W, height: NODE_H, borderLeftColor: node.color, borderLeftWidth: node.color ? 3 : undefined }}
              >
                <span className="truncate text-zinc-100">{node.label}</span>
                {node.sub && <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">{node.sub}</span>}
                {!node.key.startsWith('channel:') && members > 0 && node.key !== selected && (
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">{members}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {selection && (
        <aside className="w-64 flex-none space-y-3 border-l border-zinc-800 p-3 text-xs">
          <div>
            <MicroLabel>Selected</MicroLabel>
            <p className="text-sm text-zinc-100">{selection.label}</p>
          </div>
          <div>
            <MicroLabel>Fed by</MicroLabel>
            <p className="text-zinc-300">{sources.length ? sources.map((node) => node!.label).join(', ') : '—'}</p>
          </div>
          <div>
            <MicroLabel>Feeds</MicroLabel>
            <p className="text-zinc-300">{feeds.length ? feeds.map((node) => node!.label).join(', ') : '—'}</p>
          </div>
          {selection.table && (
            <Button size="xs" variant="outline" onClick={() => onOpenTable(selection.table!)}>
              Open in Sheet
            </Button>
          )}
        </aside>
      )}
    </div>
  )
}
