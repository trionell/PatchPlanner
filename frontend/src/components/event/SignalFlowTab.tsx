import { Fragment, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getAudioPatch } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useReferenceData } from '../../hooks/useReferenceData'
import { buildChannelFlows, buildOutputChannelFlows, type FlowHop } from '../../lib/signalFlow'
import { busTint, cn, itemLabel } from '../../lib/utils'
import { PrintButton } from '../print/PrintButton'
import { PrintSheet } from '../print/PrintSheet'
import { Badge } from '../ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * Read-only trace of every input channel's signal chain
 * (source → cable → stagebox/multi → console) and every output channel's
 * chain (console → hop → hop → … → destination), with flagged gaps.
 * Printable like the patch sheets; edits happen on the Audio Inputs/
 * Outputs tabs.
 */
export function SignalFlowTab({ eventId }: { eventId: number }) {
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const cableQuery = useQuery({ queryKey: ['inventory-items', 'role', 'cable'], queryFn: () => listInventoryItems({ role: 'cable' }) })
  const { label } = useReferenceData()

  const micNameById = useMemo(
    () => new Map((inventoryQuery.data ?? []).map((item) => [item.id, item.name])),
    [inventoryQuery.data],
  )
  const cableLabelById = useMemo(
    () => new Map((cableQuery.data ?? []).map((item) => [item.id, itemLabel(item)])),
    [cableQuery.data],
  )
  const itemLabelById = useMemo(
    () => new Map([...(inventoryQuery.data ?? []), ...(cableQuery.data ?? [])].map((item) => [item.id, itemLabel(item)])),
    [inventoryQuery.data, cableQuery.data],
  )
  // Sorted copy matching buildChannelFlows' internal order, so flows[i]
  // and inputs[i] describe the same channel (bus membership isn't part of
  // the chain view-model — memberships are not hops).
  const inputs = useMemo(
    () => [...(audioQuery.data?.inputs ?? [])].sort((a, b) => a.channel_number - b.channel_number),
    [audioQuery.data],
  )
  const flows = buildChannelFlows(inputs, {
    stageboxes: audioQuery.data?.stageboxes ?? [],
    stageMultis: audioQuery.data?.stage_multis ?? [],
    micNameById,
    cableLabelById,
    cableLabel: (value) => label('signal_cable_types', value),
    // DI source cables are picked from the same cable catalog as every
    // other cable pick, so the query result doubles as its label source.
    sourceCableLabelById: cableLabelById,
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
                <TableRow key={inputs[index]?.id ?? flow.channelNumber}>
                  <TableCell className="w-16">{flow.channelNumber}</TableCell>
                  <TableCell className="w-48">{flow.channelName || '—'}</TableCell>
                  <TableCell className="w-56">
                    <BusBadges input={inputs[index]} groups={groups} dcas={dcas} />
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {flow.sourceCable && (<><Hop hop={flow.sourceCable} /><Arrow /></>)}
                      <Hop hop={flow.source} />
                      <Arrow />
                      <Hop hop={flow.cable} />
                      <Arrow />
                      <Hop hop={flow.path} />
                      <Arrow />
                      <span>Console ch {flow.channelNumber}</span>
                    </span>
                    {flow.pathB && (
                      <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-zinc-400">
                        <span className="text-xs uppercase tracking-wide text-zinc-500">Side B</span>
                        <Arrow />
                        <Hop hop={flow.pathB} />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Output signal flow</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </PrintSheet>
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

function Arrow() {
  return <span className="text-zinc-500">→</span>
}
