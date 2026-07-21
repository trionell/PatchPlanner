import { buildOutputChannelFlows } from './signalFlow'
import type { AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'

/** One row in the mobile Audio Outputs list — mirrors mobileChannelList.ts's input-side shape. */
export interface MobileOutputListItem {
  id: number
  outputNumber: number
  name: string
  color?: string
  /** Nearest downstream hop (e.g. "Stagebox A — Out 3"), or "—" for a gap. */
  routingLabel: string
}

interface ListContext {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  itemLabelById: Map<number, string>
}

export function buildMobileOutputList(outputs: AudioPatchOutput[], context: ListContext): MobileOutputListItem[] {
  const flows = buildOutputChannelFlows(outputs, context)
  const byNumber = new Map(flows.map((flow) => [flow.outputNumber, flow]))
  return [...outputs]
    .sort((a, b) => a.output_number - b.output_number)
    .map((output) => {
      const flow = byNumber.get(output.output_number)
      const hop = flow?.paths[0]?.hops[0]
      return {
        id: output.id,
        outputNumber: output.output_number,
        name: output.output_name || `Out ${output.output_number}`,
        color: output.color,
        routingLabel: hop?.label ?? '—',
      }
    })
}

/** An output's routing through a stagebox, resolved to editable IDs — the on-site-common case (reassigning which stagebox output feeds a wedge/aux). A destination device further downstream, or no stagebox at all, stays a desktop-only edit (mirrors mobileChannelList.ts's documented scope). */
export interface OutputRouting {
  stageboxId?: number
  /** 0-indexed stagebox output port. */
  port?: number
}

export function resolveOutputRouting(outputId: number, cables: OutputCable[], outputPort = 0): OutputRouting {
  const fromMixer = cables.find((c) => c.from_kind === 'mixer' && c.from_id === outputId && c.from_port === outputPort && c.to_kind === 'stagebox')
  if (!fromMixer) return {}
  return { stageboxId: fromMixer.to_id, port: fromMixer.to_port }
}

export interface OutputRoutingSaveOps {
  cablesToDelete: number[]
  cablesToCreate: Array<Omit<OutputCable, 'id' | 'event_id'>>
}

export function computeOutputRoutingSave(outputId: number, cables: OutputCable[], desired: OutputRouting, outputPort = 0): OutputRoutingSaveOps {
  const cablesToDelete: number[] = []
  const cablesToCreate: OutputRoutingSaveOps['cablesToCreate'] = []
  const currentFromMixer = cables.find((c) => c.from_kind === 'mixer' && c.from_id === outputId && c.from_port === outputPort)

  if (desired.stageboxId != null && desired.port != null) {
    const matches = currentFromMixer && currentFromMixer.to_kind === 'stagebox' && currentFromMixer.to_id === desired.stageboxId && currentFromMixer.to_port === desired.port
    if (!matches) {
      if (currentFromMixer) cablesToDelete.push(currentFromMixer.id)
      cablesToCreate.push({ from_kind: 'mixer', from_id: outputId, from_port: outputPort, to_kind: 'stagebox', to_id: desired.stageboxId, to_port: desired.port })
    }
  }

  return { cablesToDelete, cablesToCreate }
}
