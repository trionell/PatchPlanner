import { Fragment, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { useIsMobile } from '../../hooks/useIsMobile'
import { buildInputChannelFlows, type InputChannelFlow, type FlowHop as InputFlowHop } from '../../lib/inputSignalFlow'
import { buildOutputChannelFlows, type OutputChannelFlow, type FlowHop } from '../../lib/signalFlow'
import { busTint, cn, itemLabel } from '../../lib/utils'
import type { InputChannel, MixerDCA, MixerGroup } from '../../types'
import { PrintButton } from '../print/PrintButton'
import { PrintSheet } from '../print/PrintSheet'
import { Badge } from '../ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * Read-only trace of every input channel's signal chain (walking
 * input_cables backward from each channel to its Source, research.md R8)
 * and every output channel's chain (console → hop → hop → … →
 * destination), with flagged gaps. Printable like the patch sheets; edits
 * happen on the Audio Inputs/Outputs tabs.
 */
export function SignalFlowTab({ eventId }: { eventId: number }) {
  const isMobile = useIsMobile()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const inventoryQuery = useQuery({
    queryKey: ['inventory-audio-items', eventId],
    queryFn: () => listEventInventoryItems(eventId, { categoryType: 'audio' }),
  })
  const cableQuery = useQuery({
    queryKey: ['inventory-items', eventId, 'role', 'cable'],
    queryFn: () => listEventInventoryItems(eventId, { role: 'cable' }),
  })

  const itemLabelById = useMemo(
    () => new Map([...(inventoryQuery.data ?? []), ...(cableQuery.data ?? [])].map((item) => [item.id, itemLabel(item)])),
    [inventoryQuery.data, cableQuery.data],
  )
  const channels = audioQuery.data?.input_channels ?? []
  const flows = buildInputChannelFlows(channels, {
    sources: audioQuery.data?.input_sources ?? [],
    channels,
    devices: audioQuery.data?.input_devices ?? [],
    stageboxes: audioQuery.data?.stageboxes ?? [],
    stageMultis: audioQuery.data?.stage_multis ?? [],
    cables: audioQuery.data?.input_cables ?? [],
    itemLabelById,
  })
  const outputFlows = buildOutputChannelFlows(audioQuery.data?.outputs ?? [], {
    stageboxes: audioQuery.data?.stageboxes ?? [],
    stageMultis: audioQuery.data?.stage_multis ?? [],
    devices: audioQuery.data?.output_devices ?? [],
    cables: audioQuery.data?.output_cables ?? [],
    itemLabelById,
  })
  const gapCount = flows.filter((flow) => flow.hasGap).length + outputFlows.filter((flow) => flow.hasGap).length
  const groups = audioQuery.data?.groups ?? []
  const dcas = audioQuery.data?.dcas ?? []

  return (
    <PrintSheet eventId={eventId} title="Signal Flow" empty={flows.length === 0 && outputFlows.length === 0} visibleOnScreen>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Signal flow</CardTitle>
            <p className="mt-1 text-sm text-zinc-400">Input channels: source → cable → stagebox / multi → console. Output channels: console → chain of hops → destination. Edit on the Audio Inputs/Outputs tabs.</p>
          </div>
          <PrintButton />
        </CardHeader>
        <CardContent>
          <p className={cn('mb-4 flex items-center gap-2 text-sm', gapCount > 0 ? 'text-amber-400' : 'text-emerald-400')}>
            {gapCount > 0 ? (
              <><AlertTriangle className="h-4 w-4" />{gapCount} channel{gapCount === 1 ? '' : 's'} have gaps</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" />All channels fully routed</>
            )}
          </p>
          {isMobile ? (
            <div className="space-y-1.5">
              {flows.map((flow, index) => (
                <InputFlowCard key={channels[index]?.id ?? flow.channelNumber} flow={flow} input={channels[index]} groups={groups} dcas={dcas} />
              ))}
            </div>
          ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ch#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Groups / DCA</TableHead>
                <TableHead>Signal chain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.map((flow, index) => (
                <TableRow key={channels[index]?.id ?? flow.channelNumber}>
                  <TableCell className="w-16">{flow.channelNumber}</TableCell>
                  <TableCell className="w-48">{flow.channelName || '—'}</TableCell>
                  <TableCell className="w-56">
                    <BusBadges input={channels[index]} groups={groups} dcas={dcas} />
                  </TableCell>
                  <TableCell>
                    {flow.paths.map((path, pathIndex) => (
                      <div key={pathIndex} className={pathIndex > 0 ? 'mt-1' : undefined}>
                        {path.hops.length === 0 ? (
                          <span className="inline-flex items-baseline gap-1 font-medium text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 self-center" />
                            no source connected{path.sideLabel ? ` (${path.sideLabel})` : ''}
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            {path.hops.map((hop, hopIndex) => (
                              <Fragment key={hopIndex}>
                                {hopIndex > 0 && <Arrow />}
                                <InputHop hop={hop} />
                              </Fragment>
                            ))}
                            <Arrow />
                            <span>Console ch {flow.channelNumber}{path.sideLabel ? ` ${path.sideLabel}` : ''}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          )}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Output signal flow</CardTitle>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="space-y-1.5">
              {outputFlows.map((flow) => (
                <OutputFlowCard key={flow.outputNumber} flow={flow} />
              ))}
            </div>
          ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Out#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Signal chain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outputFlows.map((flow) => (
                <TableRow key={flow.outputNumber}>
                  <TableCell className="w-16">{flow.outputNumber}</TableCell>
                  <TableCell className="w-48">{flow.outputName || '—'}</TableCell>
                  <TableCell>
                    {flow.paths.map((path, pathIndex) => (
                      <span key={pathIndex} className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', pathIndex > 0 && 'mt-1 text-zinc-400')}>
                        <span>Console out {flow.outputNumber}{path.sideLabel ? ` ${path.sideLabel}` : ''}</span>
                        {path.hops.map((hop, hopIndex) => (
                          <Fragment key={hopIndex}>
                            <Arrow />
                            <Hop hop={hop} />
                          </Fragment>
                        ))}
                      </span>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          )}
        </CardContent>
      </Card>
    </PrintSheet>
  )
}

/** Mobile card for one input channel's flow — full-width, so the signal chain wraps freely instead of squeezing into a table cell. */
function InputFlowCard({
  flow,
  input,
  groups,
  dcas,
}: {
  flow: InputChannelFlow
  input?: InputChannel
  groups: MixerGroup[]
  dcas: MixerDCA[]
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-zinc-100">
          <span className="mr-1.5 font-mono text-[11px] text-amber-400">Ch {flow.channelNumber}</span>
          {flow.channelName || '—'}
        </span>
        <BusBadges input={input} groups={groups} dcas={dcas} />
      </div>
      <div className="mt-1 space-y-1">
        {flow.paths.map((path, pathIndex) => (
          <div key={pathIndex} className="text-[11px] text-zinc-400">
            {path.hops.length === 0 ? (
              <span className="inline-flex items-baseline gap-1 font-medium text-amber-400">
                <AlertTriangle className="h-3 w-3 self-center" />
                no source connected{path.sideLabel ? ` (${path.sideLabel})` : ''}
              </span>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {path.hops.map((hop, hopIndex) => (
                  <Fragment key={hopIndex}>
                    {hopIndex > 0 && <Arrow />}
                    <InputHop hop={hop} />
                  </Fragment>
                ))}
                <Arrow />
                <span>Ch {flow.channelNumber}{path.sideLabel ? ` ${path.sideLabel}` : ''}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mobile card for one output channel's flow — mirrors InputFlowCard. */
function OutputFlowCard({ flow }: { flow: OutputChannelFlow }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2">
      <span className="text-[13px] font-medium text-zinc-100">
        <span className="mr-1.5 font-mono text-[11px] text-amber-400">Out {flow.outputNumber}</span>
        {flow.outputName || '—'}
      </span>
      <div className="mt-1 space-y-1">
        {flow.paths.map((path, pathIndex) => (
          <span key={pathIndex} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-400">
            <span>Out {flow.outputNumber}{path.sideLabel ? ` ${path.sideLabel}` : ''}</span>
            {path.hops.map((hop, hopIndex) => (
              <Fragment key={hopIndex}>
                <Arrow />
                <Hop hop={hop} />
              </Fragment>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The channel's bus memberships as tinted badges; DCAs carry a muted prefix. */
function BusBadges({
  input,
  groups,
  dcas,
}: {
  input?: { group_ids?: number[]; dca_ids?: number[] }
  groups: { id: number; name: string; color?: string }[]
  dcas: { id: number; name: string; color?: string }[]
}) {
  const memberGroups = groups.filter((group) => input?.group_ids?.includes(group.id))
  const memberDCAs = dcas.filter((dca) => input?.dca_ids?.includes(dca.id))
  if (memberGroups.length === 0 && memberDCAs.length === 0) return <span className="text-zinc-500">—</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      {memberGroups.map((group) => (
        <Badge key={`g-${group.id}`} style={busTint(group.color)}>{group.name}</Badge>
      ))}
      {memberDCAs.map((dca) => (
        <Badge key={`d-${dca.id}`} style={busTint(dca.color)}>DCA {dca.name}</Badge>
      ))}
    </span>
  )
}

function Hop({ hop }: { hop: FlowHop }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', hop.missing && 'font-medium text-amber-400')}>
      {hop.missing && <AlertTriangle className="h-3.5 w-3.5 self-center" />}
      {hop.label}
      {hop.detail && <span className="text-xs text-zinc-500">({hop.detail})</span>}
    </span>
  )
}

function InputHop({ hop }: { hop: InputFlowHop }) {
  return <span className="inline-flex items-baseline gap-1">{hop.label}</span>
}

function Arrow() {
  return <span className="text-zinc-500">→</span>
}
