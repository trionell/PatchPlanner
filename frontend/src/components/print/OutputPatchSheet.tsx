import { useReferenceData } from '../../hooks/useReferenceData'
import { devicePorts, isCablelessToKind, mixerPorts, nodeName, stageboxPorts, stageMultiPorts, type PortRef } from '../../lib/outputGraph'
import type { AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Out#', 'Name', 'Type', 'Signal path', 'Notes']

interface PathContext {
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  itemLabelById: Map<number, string>
}

/**
 * One line of a channel's signal path plus every further branch a
 * fan-out node produces, rendered as a nested list — mirrors the graph
 * faithfully (contracts/output-graph-api.md: "walk output_cables ...
 * following the chain of to → that node's other from ports ... until a
 * dead end"). A mixer port can itself carry more than one cable (fan-out
 * to several physical destinations at once); every other port carries at
 * most one, so filtering for "every cable from this port" is correct at
 * any depth, not just the first call.
 */
function pathLines(from: PortRef, context: PathContext, depth: number): { text: string; depth: number }[] {
  const outgoing = context.cables.filter((c) => c.from_kind === from.kind && c.from_id === from.id && c.from_port === from.port)
  if (outgoing.length === 0) return depth === 0 ? [{ text: 'direct', depth }] : []

  return outgoing.flatMap((cable) => {
    const destName = nodeName(cable.to_kind, cable.to_id, { outputs: context.outputs, stageboxes: context.stageboxes, stageMultis: context.stageMultis, devices: context.devices })
    const cableLabel = cable.cable_item_id
      ? context.itemLabelById.get(cable.cable_item_id) ?? `#${cable.cable_item_id}`
      : isCablelessToKind(cable.to_kind)
        ? 'built-in'
        : undefined
    const line = `${destName} (ch ${cable.to_port + 1})${cableLabel ? ` — ${cableLabel}` : ''}`
    const lines = [{ text: line, depth }]

    // A device mixes/distributes internally — no fixed correspondence
    // between which input it came in on and which outputs carry it, so
    // every declared output port — plus any link-out ports, for a
    // chained destination device — is a candidate branch. A stage multi
    // or stagebox is a straight pass-through: input index N is physically
    // the same jack as output index N, so only that one port continues.
    let outPorts: PortRef[] = []
    if (cable.to_kind === 'device') {
      const device = context.devices.find((d) => d.id === cable.to_id)
      if (device) {
        const ports = devicePorts(device)
        outPorts = [...ports.outputs, ...ports.links]
      }
    } else if (cable.to_kind === 'stage_multi') {
      const multi = context.stageMultis.find((sm) => sm.id === cable.to_id)
      if (multi) outPorts = stageMultiPorts(multi).outputs.filter((p) => p.port === cable.to_port)
    } else if (cable.to_kind === 'stagebox') {
      const stagebox = context.stageboxes.find((sb) => sb.id === cable.to_id)
      if (stagebox) outPorts = stageboxPorts(stagebox).outputs.filter((p) => p.port === cable.to_port)
    }
    for (const outPort of outPorts) {
      lines.push(...pathLines(outPort, context, depth + 1))
    }
    return lines
  })
}

/** Paper rendering of the output patch (hidden on screen, shown in print). */
export function OutputPatchSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  outputDevices,
  outputCables,
  itemLabelById,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  outputDevices: OutputDevice[]
  outputCables: OutputCable[]
  /** Catalog item labels (name — description) for device/cable picks. */
  itemLabelById: Map<number, string>
}) {
  const { label } = useReferenceData(eventId)
  const rows = [...outputs].sort((a, b) => a.output_number - b.output_number)
  const context: PathContext = { outputs, stageboxes, stageMultis, devices: outputDevices, cables: outputCables, itemLabelById }

  return (
    <PrintSheet eventId={eventId} title="Output Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mixerOutPorts = mixerPorts([row])
            return (
              <tr key={row.id}>
                <td className={sheetTd}><ColorSwatch color={row.color} />{row.output_number}</td>
                <td className={sheetTd}>{row.output_name || ''}</td>
                <td className={sheetTd}>{label('output_types', row.output_type)}</td>
                <td className={sheetTd}>
                  {mixerOutPorts.map((port) => (
                    <div key={port.port} className={mixerOutPorts.length > 1 ? 'mb-1' : undefined}>
                      {mixerOutPorts.length > 1 && <span className="text-zinc-500">{port.label}: </span>}
                      {pathLines(port, context, 0).map((line, i) => (
                        <div key={i} style={{ paddingLeft: line.depth * 12 }}>
                          {line.depth > 0 && '↳ '}{line.text}
                        </div>
                      ))}
                    </div>
                  ))}
                </td>
                <td className={sheetTd}>{row.notes || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </PrintSheet>
  )
}
