import { Fragment, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { listFixtureModes } from '../../api/inventories'
import { deleteLightingFixture, updateLightingFixture } from '../../api/lighting'
import { useReferenceData } from '../../hooks/useReferenceData'
import { useRowEditor } from '../../hooks/useRowEditor'
import { type DmxMap, type FixtureDmxState, UNIVERSE_SIZE, formatSpan } from '../../lib/dmxMap'
import { matchesSearch } from '../../lib/patchSearch'
import { cn } from '../../lib/utils'
import type { LightingFixture } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'
import { RowEditor } from './RowEditor'

/**
 * The lighting rig, as a sheet (Slice 27 US1).
 *
 * It was a thirteen-column form: twenty-four live inputs and selects on screen at
 * once, ninety-pixel rows, and no read state at all, so a rig of forty fixtures
 * showed seven of them and none of the three numbers a planner actually reads —
 * universe, address, channel count — lined up with the row above.
 *
 * Nine columns now, no control in a closed row, and the address column in tabular
 * figures so a clash is a shape before it is a number. Everything the row used to
 * hold in a text box is in the editor beneath it, one row at a time.
 */

const COLUMNS = ['FID', 'Fixture', 'Mode', 'Univ', 'Addr', 'Ch', 'Truss', 'Power', 'Notes']

interface FixtureDraft {
  fixture_number?: number
  custom_name: string
  inventory_item_id?: number
  dmx_channel_mode: string
  dmx_channel_count: number
  dmx_universe: number
  dmx_start_address?: number
  power_connection: LightingFixture['power_connection']
  power_connector_in: string
  position_index: number
  notes: string
}

interface LightingSheetProps {
  eventId: number
  rigId?: number
  inventoryId?: number
  fixtures: LightingFixture[]
  map: DmxMap
  /** The event's lighting inventory, for the model picker. */
  modelOptions: { label: string; value: number }[]
  search?: string
  /** Opens the Stage Plots tab, where a fixture's truss is actually decided. */
  onOpenPlot?: () => void
  readOnly?: boolean
}

export function LightingSheet({
  eventId,
  rigId,
  inventoryId,
  fixtures,
  map,
  modelOptions,
  search = '',
  onOpenPlot,
  readOnly = false,
}: LightingSheetProps) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData(eventId)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const updateFixture = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<LightingFixture, 'id'> }) =>
      updateLightingFixture(eventId, rigId!, id, data),
    onSuccess: invalidate,
  })
  const removeFixture = useMutation({
    mutationFn: (id: number) => deleteLightingFixture(eventId, rigId!, id),
    onSuccess: invalidate,
  })

  const editor = useRowEditor<LightingFixture, FixtureDraft>({
    rows: fixtures,
    idOf: (fixture) => fixture.id,
    draftOf: (fixture) => ({
      fixture_number: fixture.fixture_number,
      custom_name: fixture.custom_name ?? '',
      inventory_item_id: fixture.inventory_item_id,
      dmx_channel_mode: fixture.dmx_channel_mode ?? '',
      dmx_channel_count: fixture.dmx_channel_count,
      dmx_universe: fixture.dmx_universe,
      dmx_start_address: fixture.dmx_start_address,
      power_connection: fixture.power_connection,
      power_connector_in: fixture.power_connector_in,
      position_index: fixture.position_index,
      notes: fixture.notes ?? '',
    }),
    persist: (fixture, draft) =>
      updateFixture.mutate({
        id: fixture.id,
        data: {
          rig_id: fixture.rig_id,
          fixture_number: draft.fixture_number,
          inventory_item_id: draft.inventory_item_id,
          custom_name: draft.custom_name,
          position_index: draft.position_index,
          power_connection: draft.power_connection,
          power_chain_parent_id: fixture.power_chain_parent_id,
          power_connector_in: draft.power_connector_in,
          power_connector_out: fixture.power_connector_out,
          dmx_universe: draft.dmx_universe,
          dmx_start_address: draft.dmx_start_address,
          dmx_channel_mode: draft.dmx_channel_mode,
          dmx_channel_count: draft.dmx_channel_count,
          notes: draft.notes,
        },
      }),
  })

  const nameOf = (fixture: LightingFixture) =>
    fixture.custom_name || fixture.inventory_item_name || 'Unnamed fixture'
  const labelOf = (fixture: LightingFixture) =>
    fixture.fixture_number != null ? String(fixture.fixture_number) : nameOf(fixture)

  const byId = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures])

  const visible = fixtures.filter((fixture) =>
    matchesSearch(
      search,
      fixture.fixture_number,
      fixture.custom_name,
      fixture.inventory_item_name,
      fixture.dmx_channel_mode,
      fixture.truss_name,
      fixture.notes,
    ),
  )

  return (
    <>
      <div className="overflow-x-auto">
        <SheetTable>
          <SheetHead>
            <tr>
              {COLUMNS.map((column) => (
                <SheetHeadCell key={column}>{column}</SheetHeadCell>
              ))}
            </tr>
          </SheetHead>
          <SheetBody>
            {visible.map((fixture, index) => {
              const state = map.byFixture.get(fixture.id)
              const duplicate = fixture.fixture_number != null && map.duplicateNumbers.has(fixture.fixture_number)
              const chainParent = fixture.power_chain_parent_id != null ? byId.get(fixture.power_chain_parent_id) : undefined

              return (
                <Fragment key={fixture.id}>
                  <SheetRow
                    striped={index % 2 === 1}
                    open={editor.openId === fixture.id}
                    className={readOnly ? undefined : 'cursor-pointer'}
                    onClick={readOnly ? undefined : () => editor.openRow(fixture)}
                  >
                    <NumCell
                      className={cn(duplicate && 'text-amber-300')}
                      title={duplicate ? 'Duplicate console ID — the console needs unique numbers' : undefined}
                    >
                      {fixture.fixture_number ?? <span className="text-zinc-600">—</span>}
                    </NumCell>

                    <SheetCell className="whitespace-nowrap text-zinc-100">
                      {nameOf(fixture)}
                      {fixture.inventory_item_name && fixture.custom_name && (
                        <span className="ml-2 font-mono text-[11px] text-zinc-500">{fixture.inventory_item_name}</span>
                      )}
                    </SheetCell>

                    <SheetCell className="text-zinc-500">
                      {fixture.dmx_channel_mode || <span className="text-zinc-600">—</span>}
                    </SheetCell>

                    <NumCell>{fixture.dmx_universe}</NumCell>

                    <AddressCell fixture={fixture} state={state} byId={byId} labelOf={labelOf} />

                    <NumCell>{fixture.dmx_channel_count}</NumCell>

                    <SheetCell
                      className="whitespace-nowrap text-zinc-500"
                      title="Assigned by placing the fixture on a truss in the Stage Plots tab"
                    >
                      {fixture.truss_name ? (
                        <>
                          {fixture.truss_name}
                          {fixture.truss_offset_cm != null && <span className="text-zinc-600"> · {fixture.truss_offset_cm} cm</span>}
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </SheetCell>

                    <SheetCell className="whitespace-nowrap text-zinc-500">
                      {fixture.power_connection === 'chain' && <Link2 className="mr-1 inline h-3 w-3 align-[-1px] text-amber-400" />}
                      {fixture.power_connection}
                      {chainParent ? (
                        <span className="ml-1.5 font-mono text-[11px] text-zinc-600">← {labelOf(chainParent)}</span>
                      ) : (
                        <span className="ml-1.5 font-mono text-[11px] text-zinc-600">{fixture.power_connector_in}</span>
                      )}
                    </SheetCell>

                    <SheetCell className="max-w-48 truncate text-zinc-500">{fixture.notes}</SheetCell>
                  </SheetRow>

                  {editor.openId === fixture.id && editor.draft && (
                    <SheetRow className="border-b-0 hover:bg-transparent">
                      <SheetCell colSpan={COLUMNS.length} className="bg-amber-500/[0.04] pt-0">
                        <RowEditor
                          saveLabel="Save fixture"
                          onSave={editor.save}
                          onCancel={editor.close}
                          onDelete={() => {
                            if (window.confirm(`Delete ${labelOf(fixture)}? This cannot be undone.`)) {
                              removeFixture.mutate(fixture.id)
                            }
                          }}
                          handoff={onOpenPlot ? { label: 'Truss', text: 'Hang in plot', onSelect: onOpenPlot } : undefined}
                          onKeyDown={editor.onKeyDown}
                        >
                          <FixtureFields
                            draft={editor.draft}
                            setDraft={editor.setDraft}
                            inventoryId={inventoryId}
                            modelOptions={modelOptions}
                            connectorOptions={options('power_connectors', editor.draft.power_connector_in)}
                            trussLabel={
                              fixture.truss_name
                                ? `${fixture.truss_name}${fixture.truss_offset_cm != null ? ` · ${fixture.truss_offset_cm} cm` : ''}`
                                : 'Not hung'
                            }
                          />
                        </RowEditor>
                      </SheetCell>
                    </SheetRow>
                  )}
                </Fragment>
              )
            })}
          </SheetBody>
        </SheetTable>

        {visible.length === 0 && (
          <p className="px-3 py-3 text-xs text-zinc-500">
            {fixtures.length === 0 ? 'No fixtures in this rig yet.' : `Nothing matches “${search}”.`}
          </p>
        )}
      </div>

      {(updateFixture.error ?? removeFixture.error) && (
        <p className="px-3 pb-2 text-xs text-red-400">{(updateFixture.error ?? removeFixture.error)?.message}</p>
      )}
    </>
  )
}

/**
 * The one cell carrying the whole of the map's vocabulary (FR-059).
 *
 * A shared address is drawn as **information** — a neutral count badge, the same
 * treatment a canvas node's badge gets — and never as a warning. Twenty pars on
 * one address is how a room wash is rigged, and a tool that coloured it amber
 * would teach the planner to ignore the colour that matters.
 */
function AddressCell({
  fixture,
  state,
  byId,
  labelOf,
}: {
  fixture: LightingFixture
  state?: FixtureDmxState
  byId: Map<number, LightingFixture>
  labelOf: (fixture: LightingFixture) => string
}) {
  if (fixture.dmx_start_address == null) {
    return (
      <NumCell className="text-zinc-600" title="No DMX address assigned">
        —
      </NumCell>
    )
  }

  const span = formatSpan(fixture.dmx_start_address, fixture.dmx_channel_count)
  const shareCount = state?.group?.fixtureIds.length ?? 1

  if (state?.outOfBounds) {
    return (
      <NumCell className="text-red-400" title={`Runs past ${UNIVERSE_SIZE} — the universe ends there`}>
        {span}
      </NumCell>
    )
  }

  if (state?.clashWith) {
    const other = state.clashWith.fixtureIds.map((id) => byId.get(id)).find(Boolean)
    return (
      <NumCell
        className="text-red-400"
        title={`Overlaps ${other ? labelOf(other) : 'another fixture'} at ${formatSpan(state.clashWith.start, state.clashWith.count)}`}
      >
        {span}
      </NumCell>
    )
  }

  return (
    <NumCell>
      {span}
      {state?.shared && (
        <span
          className="ml-1.5 rounded-sm bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400"
          title={`${shareCount} fixtures share these channels`}
        >
          ×{shareCount}
        </span>
      )}
    </NumCell>
  )
}

/**
 * The editor's fields, shared by the row editor and — from US3 — the add editor,
 * which is what makes adding and editing look like the same operation.
 */
export function FixtureFields({
  draft,
  setDraft,
  inventoryId,
  modelOptions,
  connectorOptions,
  trussLabel,
}: {
  draft: FixtureDraft
  setDraft: (draft: FixtureDraft) => void
  inventoryId?: number
  modelOptions: { label: string; value: number }[]
  connectorOptions: { label: string; value: string }[]
  trussLabel?: string
}) {
  return (
    <>
      <FieldStack label="FID" width="count">
        <Input
          size="sm"
          type="number"
          min={1}
          value={draft.fixture_number ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, fixture_number: event.target.value ? Number(event.target.value) : undefined })
          }
        />
      </FieldStack>

      <FieldStack label="Name" width="grow">
        <Input size="sm" autoFocus value={draft.custom_name} onChange={(event) => setDraft({ ...draft, custom_name: event.target.value })} />
      </FieldStack>

      <FieldStack label="Model" width="default">
        <Select
          size="sm"
          value={draft.inventory_item_id ?? ''}
          onChange={(event) =>
            // Switching models clears the mode: a mode picked from the previous
            // model never leaks onto the new one.
            setDraft({
              ...draft,
              inventory_item_id: event.target.value ? Number(event.target.value) : undefined,
              dmx_channel_mode: '',
            })
          }
        >
          <option value="">Custom / none</option>
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FieldStack>

      <ModeField draft={draft} setDraft={setDraft} inventoryId={inventoryId} />

      <FieldStack label="Ch" width="count">
        <Input
          size="sm"
          type="number"
          min={1}
          value={draft.dmx_channel_count}
          onChange={(event) => setDraft({ ...draft, dmx_channel_count: Number(event.target.value) })}
        />
      </FieldStack>

      <FieldStack label="Univ" width="count">
        <Input
          size="sm"
          type="number"
          min={1}
          value={draft.dmx_universe}
          onChange={(event) => setDraft({ ...draft, dmx_universe: Number(event.target.value) })}
        />
      </FieldStack>

      <FieldStack label="Addr" width="count">
        <Input
          size="sm"
          type="number"
          min={1}
          max={UNIVERSE_SIZE}
          value={draft.dmx_start_address ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, dmx_start_address: event.target.value ? Number(event.target.value) : undefined })
          }
        />
      </FieldStack>

      <FieldStack label="Power" width="short">
        <Select
          size="sm"
          value={draft.power_connection}
          onChange={(event) => setDraft({ ...draft, power_connection: event.target.value as LightingFixture['power_connection'] })}
        >
          <option value="grid">grid</option>
          <option value="chain">chain</option>
        </Select>
      </FieldStack>

      <FieldStack label="Connector" width="default">
        <Select size="sm" value={draft.power_connector_in} onChange={(event) => setDraft({ ...draft, power_connector_in: event.target.value })}>
          {connectorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FieldStack>

      <FieldStack label="Order" width="count">
        <Input
          size="sm"
          type="number"
          value={draft.position_index}
          onChange={(event) => setDraft({ ...draft, position_index: Number(event.target.value) })}
        />
      </FieldStack>

      <FieldStack label="Notes" width="grow">
        <Input size="sm" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </FieldStack>

      {trussLabel && (
        <FieldStack label="On" width="short">
          <span className="flex h-8 items-center text-xs text-zinc-400">{trussLabel}</span>
        </FieldStack>
      )}
    </>
  )
}

/**
 * The mode field: a picker over the catalog model's defined modes where it has
 * any, free text where it has none.
 *
 * Picking a mode copies **both** its name and its channel count onto the draft.
 * Copy-on-pick, not a reference: editing the catalog mode later must never
 * silently re-patch a rig that has already been built.
 */
function ModeField({
  draft,
  setDraft,
  inventoryId,
}: {
  draft: FixtureDraft
  setDraft: (draft: FixtureDraft) => void
  inventoryId?: number
}) {
  const itemId = draft.inventory_item_id
  const modesQuery = useQuery({
    queryKey: ['fixture-modes', itemId],
    queryFn: () => listFixtureModes(inventoryId!, itemId!),
    enabled: itemId != null && inventoryId != null,
  })
  const modes = modesQuery.data ?? []
  const selected = modes.find((mode) => mode.name === draft.dmx_channel_mode && mode.channel_count === draft.dmx_channel_count)

  if (modes.length === 0) {
    return (
      <FieldStack label="Mode" width="short">
        <Input size="sm" value={draft.dmx_channel_mode} onChange={(event) => setDraft({ ...draft, dmx_channel_mode: event.target.value })} />
      </FieldStack>
    )
  }

  return (
    <FieldStack label="Mode" width="short">
      <Select
        size="sm"
        value={selected?.id ?? ''}
        onChange={(event) => {
          const mode = modes.find((candidate) => candidate.id === Number(event.target.value))
          if (mode) setDraft({ ...draft, dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count })
        }}
      >
        <option value="">custom…</option>
        {modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.name} ({mode.channel_count} ch)
          </option>
        ))}
      </Select>
    </FieldStack>
  )
}

export type { FixtureDraft }
