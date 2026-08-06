import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Search } from 'lucide-react'
import { audioExportPdfUrl } from '../../api/audio'
import { getAudioPatch } from '../../api/audioPatch'
import { listEventInventoryItems } from '../../api/inventory'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { buildInputChannelFlows, type InputChannelFlow } from '../../lib/inputSignalFlow'
import { matchesSearch } from '../../lib/patchSearch'
import { buildOutputChannelFlows, type OutputChannelFlow } from '../../lib/signalFlow'
import { busTint, itemLabel } from '../../lib/utils'
import type { MixerDCA, MixerGroup } from '../../types'
import { ExportPdfButton } from '../print/ExportPdfButton'
import { PrintSheet } from '../print/PrintSheet'
import { Input } from '../ui/Input'
import { MicroLabel } from '../ui/Label'
import { MobilePanel } from '../ui/MobilePanel'
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
    <PrintSheet
      className={isMobile ? 'flex min-h-0 flex-1 flex-col print:block' : undefined}
      empty={flows.length === 0 && outputFlows.length === 0}
      eventId={eventId}
      title="Signal Flow"
      visibleOnScreen
    >
      {isMobile ? (
        /*
          One bordered panel, two runs, a strip (Wave 6c).

          This was a `space-y-1.5` stack of `rounded-md border bg-zinc-900` cards until
          Slice 35 — `M1` still standing on exactly one surface, and it is the surface
          nobody counted: Signal Flow's phone branch was not among 6b's nine lists, which
          is also how its status rail went four waves without joining the shared shell
          (audit.md F1).
        */
        <MobilePanel
          onSearch={setSearch}
          /*
            One action, so the panel renders it as its own target rather than a menu.
            It downloads the audio document rather than opening the browser's print
            dialog (Slice 40): §7h asks every phone surface to reach the export it
            has, and a download is a download.
          */
          overflow={[{
            label: 'Export PDF',
            icon: <FileDown className="h-4 w-4" />,
            onClick: () => window.location.assign(audioExportPdfUrl(eventId)),
          }]}
          search={search}
          searchPlaceholder="Find a channel or a device…"
          strip={
            <SignalFlowStatusRail
              filter={filter}
              firstGap={firstGap}
              gaps={gapCount}
              hops={hopCount}
              inputs={flows.length}
              onFilterChange={setFilter}
              outputs={outputFlows.length}
            />
          }
          title="Signal flow"
        >
          <MobileRun count={visibleInputs.length} label="Inputs" />
          {visibleInputs.map((flow) => (
            <MobileFlowRow
              key={`in-${flow.channelNumber}`}
              name={flow.channelName}
              number={flow.channelNumber}
              paths={flow.paths.map((path) => ({
                gap: path.hops.length === 0,
                text:
                  path.hops.length === 0
                    ? `no source connected${path.sideLabel ? ` (${path.sideLabel})` : ''}`
                    : [...path.hops.map((hop) => hop.label), `Ch ${flow.channelNumber}${path.sideLabel ? ` ${path.sideLabel}` : ''}`].join(' → '),
              }))}
            />
          ))}

          <MobileRun count={visibleOutputs.length} label="Outputs" />
          {visibleOutputs.map((flow) => (
            <MobileFlowRow
              key={`out-${flow.outputNumber}`}
              name={flow.outputName}
              number={flow.outputNumber}
              paths={flow.paths.map((path) => ({
                gap: path.hops.some((hop) => hop.missing),
                text: [`Out ${flow.outputNumber}${path.sideLabel ? ` ${path.sideLabel}` : ''}`, ...path.hops.map((hop) => hop.label)].join(' → '),
              }))}
            />
          ))}

          {visibleInputs.length === 0 && visibleOutputs.length === 0 && (
            <p className="px-3 py-3 text-sm text-zinc-500">
              {filter ? 'Nothing left to fix — tap the strip to show everything.' : 'No matches.'}
            </p>
          )}
        </MobilePanel>
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

              <ExportPdfButton href={audioExportPdfUrl(eventId)} />
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

/**
 * A heading over a run of rows, inside the frame (tokens.md §7).
 *
 * The desktop's `FlowBand` in the geometry a phone panel has: it separates the two runs
 * that share one scroll, which they do because the tab prints and a view toggle would
 * print half the document.
 */
function MobileRun({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 bg-zinc-950/35 px-3 pb-1.5 pt-2.5">
      <MicroLabel>{label}</MicroLabel>
      <span className="font-mono text-[10px] tabular-nums text-zinc-600">{count}</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  )
}

/**
 * One flow, as a phone row.
 *
 * **The chain wraps**, and it is the one row in the application that does. `patterns.md`
 * §7c says both lines of a phone row truncate, and gives the reason — *a row that grows
 * to fit its content breaks the pitch the list is read at* — but that reason is about a
 * list you **scan**. Signal Flow is a list you **read**: each row is one chain, and a
 * chain truncated at `Beta 91A → SB1 in 1 → Mu…` has lost the answer to the only
 * question this surface is ever asked.
 *
 * The exception is written into `tokens.md` §7 and `patterns.md` §7c in the same commit,
 * worded as a constraint rather than a licence: the chain wraps because it *is* the
 * content; a subtitle that summarises a row still truncates.
 */
function MobileFlowRow({
  number,
  name,
  paths,
}: {
  number: number
  name?: string
  paths: { text: string; gap: boolean }[]
}) {
  return (
    <div className="flex min-h-[44px] items-stretch border-b border-zinc-800/60">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-1.5">
        <div className="truncate text-sm font-medium leading-tight text-zinc-100">
          <span className="mr-1.5 font-mono text-xs tabular-nums text-amber-400">{number}</span>
          {name || <Dash />}
        </div>
        {paths.map((path, index) => (
          <div
            className={`font-mono text-[11px] leading-tight ${path.gap ? 'text-red-400' : 'text-zinc-400'}`}
            key={index}
          >
            {path.text}
          </div>
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

