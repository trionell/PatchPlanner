import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listFixtureModes } from '../../api/inventories'
import { createLightingFixture, updateLightingFixture } from '../../api/lighting'
import { toOptionalNumber } from '../../lib/utils'
import type { LightingFixture } from '../../types'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

/**
 * On-site edit form for one lighting fixture: fixture ID, universe,
 * address, and mode — the fields that change while focusing a rig
 * (FR-009). Also handles adding a fixture; a mobile-added fixture has no
 * catalog item (a "custom" fixture, same as picking "Custom / none" in
 * desktop's Add Fixture dialog) — picking a specific inventory model
 * stays a desktop task.
 */
export function MobileFixtureEditSheet({
  eventId,
  rigId,
  inventoryId,
  /** Omitted → creating a new fixture. */
  fixture,
  fixtures,
  onClose,
  onSaved,
  readOnly = false,
}: {
  eventId: number
  rigId: number
  inventoryId: number | undefined
  fixture?: LightingFixture
  fixtures: LightingFixture[]
  onClose: () => void
  onSaved: () => Promise<void>
  /**
   * A viewer taps a row to *read* it (Wave 6c, audit.md M4). A phone row is a
   * truncation, so a role that cannot edit still has to be able to open one — it
   * gets this sheet with its fields inert and no confirm, never a dead row.
   */
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const itemId = fixture?.inventory_item_id

  const [fixtureNumber, setFixtureNumber] = useState(fixture?.fixture_number != null ? String(fixture.fixture_number) : '')
  const [customName, setCustomName] = useState(fixture?.custom_name ?? '')
  const [universe, setUniverse] = useState(fixture?.dmx_universe ?? 1)
  const [address, setAddress] = useState(fixture?.dmx_start_address != null ? String(fixture.dmx_start_address) : '')
  const [mode, setMode] = useState(fixture?.dmx_channel_mode ?? 'Basic')
  const [channelCount, setChannelCount] = useState(fixture?.dmx_channel_count ?? 8)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /*
    `retry: false`, because a 404 here is an answer and not a hiccup.

    The endpoint 404s when the item is not in *this* inventory — a fixture whose catalog
    item predates a re-import, or came from another catalog — and the sheet already
    handles that correctly by falling back to a free-text mode below. What it did not
    handle was React Query's default three retries, which turned one dead lookup into
    four console errors. The desktop `LightingSheet` has the same query and the same
    behaviour; this is the copy Slice 35 owns.
  */
  const modesQuery = useQuery({
    queryKey: ['fixture-modes', itemId],
    queryFn: () => listFixtureModes(inventoryId!, itemId!),
    enabled: !!itemId && inventoryId !== undefined,
    retry: false,
  })
  const modes = modesQuery.data ?? []

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      if (fixture) {
        await updateLightingFixture(eventId, rigId, fixture.id, {
          ...fixture,
          fixture_number: toOptionalNumber(fixtureNumber),
          custom_name: customName,
          dmx_universe: universe,
          dmx_start_address: toOptionalNumber(address),
          dmx_channel_mode: mode,
          dmx_channel_count: channelCount,
        })
      } else {
        await createLightingFixture(eventId, rigId, {
          rig_id: rigId,
          custom_name: customName,
          fixture_number: toOptionalNumber(fixtureNumber),
          position_index: (fixtures.at(-1)?.position_index ?? 0) + 1,
          power_connection: 'grid',
          power_connector_in: 'schuko',
          dmx_universe: universe,
          dmx_start_address: toOptionalNumber(address),
          dmx_channel_mode: mode,
          dmx_channel_count: channelCount,
          notes: '',
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fixture.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={fixture ? `Fixture ${fixture.fixture_number ?? fixture.id}` : 'Add fixture'}
      footer={
        readOnly ? undefined : (
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save fixture'}
          </Button>
        )
      }
    >
      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
      {/* Inert rather than absent: the values are the point of opening it. */}
      <fieldset className="flex min-w-0 flex-col gap-3.5" disabled={readOnly}>
      <div className="flex gap-2.5">
        <FieldStack label="FID" width="short">
          <Input type="number" min={1} value={fixtureNumber} onChange={(e) => setFixtureNumber(e.target.value)} placeholder="GrandMA" autoFocus />
        </FieldStack>
        <FieldStack label="Label" width="grow">
          <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom name" />
        </FieldStack>
      </div>
      {/* Universe and address are one idea — an address means nothing without
          the universe it is in — so they are the pair that stays side by side. */}
      <div className="flex gap-2.5">
        <FieldStack label="Universe" width="grow">
          <Input type="number" min={1} value={universe} onChange={(e) => setUniverse(Number(e.target.value))} />
        </FieldStack>
        <FieldStack label="Address" width="grow">
          <Input type="number" min={1} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Start" />
        </FieldStack>
      </div>
      {modes.length > 0 ? (
        <FieldStack label="Mode" width="full">
          <Select
            value={modes.find((m) => m.name === mode && m.channel_count === channelCount)?.id ?? ''}
            onChange={(e) => {
              const picked = modes.find((m) => m.id === Number(e.target.value))
              if (picked) {
                setMode(picked.name)
                setChannelCount(picked.channel_count)
              }
            }}
          >
            <option value="">custom…</option>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.channel_count} ch)</option>
            ))}
          </Select>
        </FieldStack>
      ) : (
        <div className="flex gap-2.5">
          <FieldStack label="Mode" width="grow">
            <Input value={mode} onChange={(e) => setMode(e.target.value)} />
          </FieldStack>
          <FieldStack label="Channels" width="short">
            <Input type="number" min={1} value={channelCount} onChange={(e) => setChannelCount(Number(e.target.value))} />
          </FieldStack>
        </div>
      )}
      </fieldset>
    </Sheet>
  )
}
