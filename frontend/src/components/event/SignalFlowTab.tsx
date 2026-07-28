import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Search } from 'lucide-react'
import { getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { buildInputChannelFlows, type InputChannelFlow } from '../../lib/inputSignalFlow'
import { matchesSearch } from '../../lib/patchSearch'
import { buildOutputChannelFlows, type OutputChannelFlow } from '../../lib/signalFlow'
import { busTint, itemLabel } from '../../lib/utils'
import type { InputChannel, MixerDCA, MixerGroup } from '../../types'
import { PrintButton } from '../print/PrintButton'
import { PrintSheet } from '../print/PrintSheet'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Input'
import { PatchPanel } from '../ui/PatchPanel'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { ChainGap, ChainLine } from './ChainLine'
import { FlowBand, type SignalFlowFilter, SignalFlowStatusRail } from './SignalFlowStatusRail'

/**
 * Every channel's signal chain, read-only (Slice 28 US3).
 *
 * **The one sheet in the application with no row editor**, and that is a
 * statement rather than an omission: every value here is derived (P6) by the same
 * functions the flow canvases use, so there is nothing on it to change. What it
 * has instead is somewhere to go — clicking a row opens the tab where the chain
 * is actually built.
 *
 * Inputs and outputs share one scroll, divided by a labelled band, because the
 * tab prints: a toggle would print half the document, and a load-in sheet that
 * silently omits the output patch is worse than a long one (research.md R9).
 */
export function SignalFlowTab({ eventId }: { eventId: number }) {
  const isMobile = useIsMobile()
  const { openTab } = useEventTab()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SignalFlowFilter>(null)

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

  const channels = useMemo(() => audioQuery.data?.input_channels ?? [], [audioQuery.data])
  const flows = useMemo(
    () =>
      buildInputChannelFlows(channels, {
        sources: audioQuery.data?.input_sources ?? [],
        channels,
        devices: audioQuery.data?.input_devices ?? [],
        stageboxes: audioQuery.data?.stageboxes ?? [],
        stageMultis: audioQuery.data?.stage_multis ?? [],
        cables: audioQuery.data?.input_cables ?? [],
        consoles: audioQuery.data?.consoles ?? [],
        itemLabelById,
      }),
    [audioQuery.data, channels, itemLabelById],
  )
  const outputFlows = useMemo(
    () =>
      buildOutputChannelFlows(audioQuery.data?.outputs ?? [], {
        stageboxes: audioQuery.data?.stageboxes ?? [],
        stageMultis: audioQuery.data?.stage_multis ?? [],
        devices: audioQuery.data?.output_devices ?? [],
        cables: audioQuery.data?.output_cables ?? [],
        consoles: audioQuery.data?.consoles ?? [],
        itemLabelById,
      }),
    [audioQuery.data, itemLabelById],
  )

  const groups = audioQuery.data?.groups ?? []
  const dcas = audioQuery.data?.dcas ?? []

  /** Search reaches every hop label, so "Radial" finds every channel through the DI. */
  const hopLabels = (flow: InputChannelFlow | OutputChannelFlow) =>
    flow.paths.flatMap((path) => path.hops.map((hop) => hop.label)).join(' ')

  const visibleInputs = flows.filter(
    (flow) =>
      (!filter || flow.hasGap) && matchesSearch(search, flow.channelNumber, flow.channelName, hopLabels(flow)),
  )
  const visibleOutputs = outputFlows.filter(
    (flow) => (!filter || flow.hasGap) && matchesSearch(search, flow.outputNumber, flow.outputName, hopLabels(flow)),
  )

  const gapCount = flows.filter((flow) => flow.hasGap).length + outputFlows.filter((flow) => flow.hasGap).length
  const hopCount =
    flows.reduce((total, flow) => total + flow.paths.reduce((sum, path) => sum + path.hops.length, 0), 0) +
    outputFlows.reduce((total, flow) => total + flow.paths.reduce((sum, path) => sum + path.hops.length, 0), 0)

  const firstInputGap = flows.find((flow) => flow.hasGap)
  const firstOutputGap = outputFlows.find((flow) => flow.hasGap)
  const firstGap = firstInputGap
    ? `ch ${firstInputGap.channelNumber} ${firstInputGap.channelName || ''} has no source`.replace('  ', ' ')
    : firstOutputGap
      ? `out ${firstOutputGap.outputNumber} ${firstOutputGap.outputName || ''} reaches nothing`.replace('  ', ' ')
      : undefined

  return (
    <PrintSheet eventId={eventId} title="Signal Flow" empty={flows.length === 0 && outputFlows.length === 0} visibleOnScreen>
      {isMobile ? (
        <div className="space-y-1.5">
          {flows.map((flow, index) => (
            <InputFlowCard key={channels[index]?.id ?? flow.channelNumber} flow={flow} input={channels[index]} groups={groups} dcas={dcas} />
          ))}
          {outputFlows.map((flow) => (
            <OutputFlowCard key={flow.outputNumber} flow={flow} />
          ))}
        </div>
      ) : (
        <PatchPanel
          bar={
            <>
              <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Signal flow</span>

              <div className="relative min-w-[10rem] max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  size="sm"
                  className="pl-7"
                  placeholder="Find a channel or a device…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <span className="flex-1" />

              <PrintButton />
            </>
          }
        >
          <FlowBand label="Inputs" count={visibleInputs.length} hint="click a row to open it on Audio Inputs" />
          <div className="overflow-x-auto">
            <SheetTable>
              <SheetHead>
                <tr>
                  <SheetHeadCell className="w-11">Ch</SheetHeadCell>
                  <SheetHeadCell className="w-44">Name</SheetHeadCell>
                  <SheetHeadCell className="w-48">Buses</SheetHeadCell>
                  <SheetHeadCell>Signal chain</SheetHeadCell>
                </tr>
              </SheetHead>
              <SheetBody>
                {visibleInputs.map((flow, index) => (
                  <SheetRow
                    key={flow.channelNumber}
                    striped={index % 2 === 1}
                    className="cursor-pointer"
                    onClick={() => openTab('audio-inputs')}
                  >
                    <NumCell>{flow.channelNumber}</NumCell>
                    <SheetCell className="whitespace-nowrap text-zinc-100">{flow.channelName || <Dash />}</SheetCell>
                    <SheetCell>
                      <BusPills input={channels.find((channel) => channel.channel_number === flow.channelNumber)} groups={groups} dcas={dcas} />
                    </SheetCell>
                    <SheetCell>
                      {flow.paths.map((path, pathIndex) => (
                        <div key={pathIndex} className={pathIndex > 0 ? 'mt-0.5' : undefined}>
                          {path.hops.length === 0 ? (
                            <ChainGap>no source connected{path.sideLabel ? ` (${path.sideLabel})` : ''}</ChainGap>
                          ) : (
                            <ChainLine
                              hops={path.hops}
                              tail={`Console ch ${flow.channelNumber}${path.sideLabel ? ` ${path.sideLabel}` : ''}`}
                            />
                          )}
                        </div>
                      ))}
                    </SheetCell>
                  </SheetRow>
                ))}
                {visibleInputs.length === 0 && (
                  <tr>
                    <SheetCell colSpan={4} className="text-zinc-500">
                      {flows.length === 0 ? 'No input channels yet.' : 'No channel matches.'}
                    </SheetCell>
                  </tr>
                )}
              </SheetBody>
            </SheetTable>
          </div>

          <FlowBand label="Outputs" count={visibleOutputs.length} hint="click a row to open it on Audio Outputs" />
          <div className="overflow-x-auto">
            <SheetTable>
              <SheetHead>
                <tr>
                  <SheetHeadCell className="w-11">Out</SheetHeadCell>
                  <SheetHeadCell className="w-44">Name</SheetHeadCell>
                  <SheetHeadCell>Signal chain</SheetHeadCell>
                </tr>
              </SheetHead>
              <SheetBody>
                {visibleOutputs.map((flow, index) => (
                  <SheetRow
                    key={flow.outputNumber}
                    striped={index % 2 === 1}
                    className="cursor-pointer"
                    onClick={() => openTab('audio-outputs')}
                  >
                    <NumCell>{flow.outputNumber}</NumCell>
                    <SheetCell className="whitespace-nowrap text-zinc-100">{flow.outputName || <Dash />}</SheetCell>
                    <SheetCell>
                      {flow.paths.map((path, pathIndex) => (
                        <div key={pathIndex} className={pathIndex > 0 ? 'mt-0.5' : undefined}>
                          <ChainLine
                            hops={[
                              {
                                label: `Console out ${flow.outputNumber}${path.sideLabel ? ` ${path.sideLabel}` : ''}`,
                                missing: false,
                              },
                              ...path.hops,
                            ]}
                          />
                        </div>
                      ))}
                    </SheetCell>
                  </SheetRow>
                ))}
                {visibleOutputs.length === 0 && (
                  <tr>
                    <SheetCell colSpan={3} className="text-zinc-500">
                      {outputFlows.length === 0 ? 'No outputs yet.' : 'No output matches.'}
                    </SheetCell>
                  </tr>
                )}
              </SheetBody>
            </SheetTable>
          </div>

          <SignalFlowStatusRail
            inputs={flows.length}
            outputs={outputFlows.length}
            hops={hopCount}
            gaps={gapCount}
            firstGap={firstGap}
            filter={filter}
            onFilterChange={setFilter}
          />
        </PatchPanel>
      )}
    </PrintSheet>
  )
}

function Dash() {
  return <span className="text-zinc-600">—</span>
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
                    {hopIndex > 0 && <span className="text-zinc-500">→</span>}
                    <span>{hop.label}</span>
                  </Fragment>
                ))}
                <span className="text-zinc-500">→</span>
                <span>
                  Ch {flow.channelNumber}
                  {path.sideLabel ? ` ${path.sideLabel}` : ''}
                </span>
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
            <span>
              Out {flow.outputNumber}
              {path.sideLabel ? ` ${path.sideLabel}` : ''}
            </span>
            {path.hops.map((hop, hopIndex) => (
              <Fragment key={hopIndex}>
                <span className="text-zinc-500">→</span>
                <span className={hop.missing ? 'font-medium text-amber-400' : undefined}>{hop.label}</span>
              </Fragment>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Bus memberships, at the work tier.
 *
 * `Pill`, not `Badge`: this is a surface a technician scans forty rows of, and a
 * card-header-sized chip on every row is what makes a sheet look like a form
 * (design/tokens.md §3). Same tint, from the bus's own colour, one size down.
 */
function BusPills({
  input,
  groups,
  dcas,
}: {
  input?: { group_ids?: number[]; dca_ids?: number[] }
  groups: MixerGroup[]
  dcas: MixerDCA[]
}) {
  const memberGroups = groups.filter((group) => input?.group_ids?.includes(group.id))
  const memberDCAs = dcas.filter((dca) => input?.dca_ids?.includes(dca.id))
  if (memberGroups.length === 0 && memberDCAs.length === 0) return <Dash />
  return (
    <span className="flex flex-wrap items-center gap-1">
      {memberGroups.map((group) => (
        <Pill key={`g-${group.id}`} style={busTint(group.color)}>
          {group.name}
        </Pill>
      ))}
      {memberDCAs.map((dca) => (
        <Pill key={`d-${dca.id}`} style={busTint(dca.color)}>
          DCA {dca.name}
        </Pill>
      ))}
    </span>
  )
}

/** The phone's own chips stay navigation-tier — a touch target does not shrink because the data is dense. */
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
        <Badge key={`g-${group.id}`} style={busTint(group.color)}>
          {group.name}
        </Badge>
      ))}
      {memberDCAs.map((dca) => (
        <Badge key={`d-${dca.id}`} style={busTint(dca.color)}>
          DCA {dca.name}
        </Badge>
      ))}
    </span>
  )
}
