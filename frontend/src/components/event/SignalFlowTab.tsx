import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getAudioPatch } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useReferenceData } from '../../hooks/useReferenceData'
import { buildChannelFlows, type FlowHop } from '../../lib/signalFlow'
import { cn, itemLabel } from '../../lib/utils'
import { PrintButton } from '../print/PrintButton'
import { PrintSheet } from '../print/PrintSheet'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * Read-only trace of every input channel's signal chain
 * (source → cable → stagebox/multi → console) with flagged gaps.
 * Printable like the patch sheets; edits happen on the Audio Inputs tab.
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
  const flows = buildChannelFlows(audioQuery.data?.inputs ?? [], {
    stageboxes: audioQuery.data?.stageboxes ?? [],
    stageMultis: audioQuery.data?.stage_multis ?? [],
    micNameById,
    cableLabelById,
    cableLabel: (value) => label('signal_cable_types', value),
  })
  const gapCount = flows.filter((flow) => flow.hasGap).length

  return (
    <PrintSheet eventId={eventId} title="Signal Flow" empty={flows.length === 0} visibleOnScreen>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Signal flow</CardTitle>
            <p className="mt-1 text-sm text-zinc-400">Per input channel: source → cable → stagebox / multi → console. Edit on the Audio Inputs tab.</p>
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
                <TableHead>Signal chain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.map((flow) => (
                <TableRow key={`${flow.channelNumber}-${flow.channelName}`}>
                  <TableCell className="w-16">{flow.channelNumber}</TableCell>
                  <TableCell className="w-48">{flow.channelName || '—'}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Hop hop={flow.source} />
                      <Arrow />
                      <Hop hop={flow.cable} />
                      <Arrow />
                      <Hop hop={flow.path} />
                      <Arrow />
                      <span>Console ch {flow.channelNumber}</span>
                    </span>
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
