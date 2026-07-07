export const signalTypes = ['mic', 'line', 'di', 'return', 'aux'] as const
export const stands = ['', 'straight', 'boom', 'low', 'desk', 'clip', 'none'] as const
export const outputTypes = ['foh', 'monitor', 'sub', 'aux', 'matrix', 'stereo', 'iem'] as const
export const destinationTypes = ['local', 'stagebox', 'stage_multi'] as const
export const trussTypes = ['box', 'ladder', 'circle', 'straight', 'none'] as const

export const preampConnectors = [
  { value: 'xlr', label: 'XLR' },
  { value: 'jack_ts', label: 'Jack TS' },
  { value: 'jack_trs', label: 'Jack TRS' },
  { value: 'rca', label: 'RCA' },
  { value: 'combo', label: 'Combo' },
  { value: 'usb', label: 'USB' },
]

export const signalCableTypes = [
  { value: 'xlr', label: 'XLR' },
  { value: 'jack_ts', label: 'Jack TS' },
  { value: 'jack_trs', label: 'Jack TRS' },
  { value: 'rca', label: 'RCA' },
  { value: 'combo', label: 'Combo' },
]

export const speakerCableTypes = [
  { value: 'xlr', label: 'XLR' },
  { value: 'nl4', label: 'NL4 (Speakon)' },
  { value: 'nl8', label: 'NL8 (Speakon)' },
  { value: 'jack_ts', label: 'Jack TS' },
]

export const powerConnectors = [
  { value: 'schuko', label: 'Schuko' },
  { value: 'cee16', label: 'CEE 16A (1-fas)' },
  { value: 'cee32', label: 'CEE 32A (1-fas)' },
  { value: 'cee16_3ph', label: 'CEE 16A (3-fas)' },
  { value: 'cee32_3ph', label: 'CEE 32A (3-fas)' },
  { value: 'powercon', label: 'PowerCon' },
  { value: 'powercon_true1', label: 'PowerCon TRUE1' },
  { value: 'iec', label: 'IEC C13' },
]
