import { useQuery } from '@tanstack/react-query'
import { consoleExportUrl, getConsoleExportPreview, type ExportPortChoice, type ExportPorts } from '../../api/audio'
import { ApiError } from '../../api/client'
import { useExportPorts } from '../../hooks/useExportPorts'
import { BOX_TINT } from '../../lib/deskPreview'
import { deskLabel } from '../../lib/deskStrips'
import type { SelectedDesk } from '../../lib/patchCapacity'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { MicroLabel } from '../ui/Label'
import { Select } from '../ui/Select'

const WORD_INK: Record<string, string> = {
  'Left out': 'text-red-300',
  Changed: 'text-amber-300',
  'No input': 'text-amber-300',
  'No port': 'text-amber-300',
}

const X32_SOCKETS: { value: NonNullable<ExportPortChoice['socket']>; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'a', label: 'AES50-A' },
  { value: 'b', label: 'AES50-B' },
  { value: 'card', label: 'Card' },
]
const LV1_DEVICES: NonNullable<ExportPortChoice['device']>[] = ['SG4000', 'SG1000', 'Classic', 'Other']

interface ConsoleExportDialogProps {
  open: boolean
  onClose: () => void
  eventId: number
  desk: SelectedDesk
  /** How many desks the event has, for the "1 of 2" note. */
  deskCount: number
  readOnly: boolean
  onOpenRig?: () => void
}

/**
 * Export to console (Slice 49): the selected desk as the file its model loads. The
 * model decides the file, so the dialog states it rather than asking; it asks only
 * where each stagebox sits on the desk. The figures and lines come from the server,
 * from the code that writes the file (P6), and a line never blocks the download.
 */
export function ConsoleExportDialog({ open, onClose, eventId, desk, deskCount, readOnly, onOpenRig }: ConsoleExportDialogProps) {
  const engine = desk.model.engine
  const [ports, setPorts] = useExportPorts(eventId, desk.console.id, engine)
  const generic = engine === 'generic'
  const preview = useQuery({
    queryKey: ['console-export', eventId, desk.console.id, ports],
    queryFn: ({ signal }) => getConsoleExportPreview(eventId, desk.console.id, ports, signal),
    enabled: open && !generic,
    retry: false,
  })
  const file = engine === 'x32' ? { noun: 'scene', ext: '.scn', version: 'X32 · M32 firmware 4.0' } : { noun: 'session', ext: '.emo', version: 'LV1 17.3' }
  const lines = preview.data?.lines ?? []
  const setBox = (key: string, choice: ExportPortChoice | null) => {
    const next: ExportPorts = { ...ports }
    if (choice) next[key] = choice
    else delete next[key]
    setPorts(next)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export to console"
      className="max-w-md"
      footer={
        <>
          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={onClose}>
            {generic ? 'Close' : 'Cancel'}
          </Button>
          {generic
            ? !readOnly &&
              onOpenRig && (
                <Button size="sm" className="h-8 px-4 text-xs" onClick={onOpenRig}>
                  Open Rig
                </Button>
              )
            : (
                <Button
                  size="sm"
                  className="h-8 px-4 text-xs"
                  disabled={!preview.data}
                  onClick={() => window.location.assign(consoleExportUrl(eventId, desk.console.id, ports))}
                >
                  Download {file.noun}
                </Button>
              )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {/* B3: the file follows from the model, so it is stated, never chosen. */}
        <div className="rounded-md bg-zinc-950/40 px-3 py-2">
          <MicroLabel>Desk</MicroLabel>
          <p className="text-zinc-100">{deskLabel(desk.console, desk.model)}</p>
          {!generic && (
            <p className="font-mono text-xs text-zinc-400">
              {preview.data?.filename ?? `…${file.ext}`} · {file.version}
            </p>
          )}
          {deskCount > 1 && (
            <p className="mt-1 text-xs text-zinc-500">The desk selected on the sheet, 1 of {deskCount}. To export another, close this and pick it there.</p>
          )}
        </div>

        {generic ? (
          <p className="text-zinc-300">
            This desk is Generic, so there is no file to write.{' '}
            {readOnly ? 'An owner can pick its model in Rig.' : 'Pick its model in Rig, and the export writes the file that model loads.'}
          </p>
        ) : (
          <>
            {(preview.data?.boxes ?? []).length > 0 && (
              <div className="space-y-2">
                <MicroLabel>Where each box sits on the desk</MicroLabel>
                {(preview.data?.boxes ?? []).map((box) =>
                  box.fixed ? (
                    <div key={box.key} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-24 flex-1 truncate text-zinc-200">{box.name}</span>
                      <span className="text-xs text-zinc-400">{box.fixed}</span>
                    </div>
                  ) : (
                    <PortRow
                      key={box.key}
                      name={box.name}
                      inputs={box.inputs}
                      boxModel={box.model}
                      engine={engine}
                      choice={ports[box.key]}
                      onChange={(choice) => setBox(box.key, choice)}
                    />
                  ),
                )}
              </div>
            )}

            {preview.isLoading && <p className="text-xs text-zinc-400">Checking …</p>}
            {preview.error && (
              <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
                {preview.error instanceof ApiError ? preview.error.message : 'The preview failed.'}
              </p>
            )}
            {preview.data && (
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                {preview.data.figures.map((figure) => (
                  <div key={figure.label}>
                    <dt className="text-[11px] text-zinc-500">{figure.label}</dt>
                    <dd className="font-mono text-xs tabular-nums text-zinc-100">{figure.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {lines.length > 0 && (
              /* The box takes the tint of its worst line (A3): red for a loss, amber otherwise. */
              <div className={`space-y-2 rounded-md border px-3 py-2.5 ${BOX_TINT[lines.some((line) => line.word === 'Left out') ? 'red' : 'amber']}`}>
                {lines.map((line, index) => (
                  <div key={index}>
                    <p className="text-zinc-300">
                      <span className={`font-semibold ${WORD_INK[line.word]}`}>{line.word}</span> · {line.text}
                    </p>
                    {line.items && line.items.length > 0 && (
                      <p className="text-xs text-zinc-400">
                        {line.items.slice(0, 4).join(', ')}
                        {line.items.length > 4 ? `, … ${line.items.length - 4} more` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {preview.data && lines.length === 0 && <p className="text-xs text-zinc-500">Everything on this desk goes into the file.</p>}
          </>
        )}
      </div>
    </Dialog>
  )
}

const SOCKET_SIZE: Record<string, number> = { local: 32, a: 48, b: 48, card: 32 }

/** The box's recorded model, when it is one LV1 knows; otherwise Other — never a guess. */
function deviceOf(model?: string): NonNullable<ExportPortChoice['device']> {
  const known = (['SG4000', 'SG1000', 'Classic'] as const).find((device) => model?.toUpperCase().includes(device.toUpperCase()))
  return known ?? 'Other'
}

function PortRow({
  name,
  inputs,
  boxModel,
  engine,
  choice,
  onChange,
}: {
  name: string
  inputs: number
  boxModel?: string
  engine: string
  choice?: ExportPortChoice
  onChange: (choice: ExportPortChoice | null) => void
}) {
  if (engine === 'x32') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-24 flex-1 truncate text-zinc-200">{name}</span>
        <Select
          size="sm"
          aria-label={`${name} socket`}
          value={choice?.socket ?? ''}
          onChange={(event) => onChange(event.target.value ? { socket: event.target.value as ExportPortChoice['socket'], start: choice?.start ?? 0 } : null)}
        >
          <option value="">Not connected</option>
          {X32_SOCKETS.map((socket) => (
            <option key={socket.value} value={socket.value}>
              {socket.label}
            </option>
          ))}
        </Select>
        {choice?.socket && (
          <Select size="sm" aria-label={`${name} first port`} value={choice.start ?? 0} onChange={(event) => onChange({ ...choice, start: Number(event.target.value) })}>
            {/* Only starts the whole box fits after: a box past the socket's end would
                spill onto the next socket's preamps. */}
            {Array.from({ length: SOCKET_SIZE[choice.socket] / 8 }, (_, i) => i * 8)
              .filter((start) => start + Math.max(1, inputs) <= SOCKET_SIZE[choice.socket!])
              .map((start) => (
                <option key={start} value={start}>
                  {start + 1}–{start + Math.max(1, inputs)}
                </option>
              ))}
          </Select>
        )}
      </div>
    )
  }
  const slotValue = choice?.bank != null && choice.slot != null ? `${choice.bank}.${choice.slot}` : ''
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-24 flex-1 truncate text-zinc-200">{name}</span>
      <Select
        size="sm"
        aria-label={`${name} I/O slot`}
        value={slotValue}
        onChange={(event) => {
          if (!event.target.value) return onChange(null)
          const [bank, slot] = event.target.value.split('.').map(Number)
          onChange({ bank, slot, start: 0, device: choice?.device ?? deviceOf(boxModel) })
        }}
      >
        <option value="">Not connected</option>
        {[0, 1].flatMap((bank) =>
          Array.from({ length: 8 }, (_, slot) => (
            <option key={`${bank}.${slot}`} value={`${bank}.${slot}`}>
              Bank {bank + 1} · slot {slot + 1}
            </option>
          )),
        )}
      </Select>
      {slotValue && (
        <Select size="sm" aria-label={`${name} device`} value={choice?.device ?? deviceOf(boxModel)} onChange={(event) => onChange({ ...choice, device: event.target.value as ExportPortChoice['device'] })}>
          {LV1_DEVICES.map((device) => (
            <option key={device} value={device}>
              {device === 'Classic' ? 'LV1 Classic' : device}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}
