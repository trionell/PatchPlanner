# Data Model: Four tabs, one shape

**Nothing is stored.** No migration, no table, no column, no API field. Every
value on all four tabs already exists in a payload the application fetches today;
this wave changes where it is computed and where it is drawn.

What follows is therefore not a schema but the shape of the one **derived** value
the wave introduces, and the read-only projections the three sheets build over
records that already exist.

---

## 1 · `EventSummary` — derived, in the browser

`frontend/src/lib/eventSummary.ts`. A pure function; no React, no fetch, no DOM.

```ts
export interface EventSummary {
  /** Days until the event's date. undefined when it has no date. */
  daysToLoadIn?: number
  /** undefined when the audio patch has not loaded or the event has no patch. */
  inputChannels?: number
  outputChannels?: number
  cablesPicked?: number
  sources?: number
  stageboxes?: number
  stageMultis?: number
  consoleName?: string
  outputDevices?: number
  speakers?: number
  signalGaps?: number

  fixtures?: number
  universes?: number
  trusses?: number
  dmxUsed?: number
  dmxCapacity?: number
  dmxState?: DmxStatusState          // from lib/dmxMap
  unaddressed?: number

  stagePlots?: number

  rentalLines?: number
  rentalPieces?: number
  rentalTotalExVAT?: number
  rentalOverStock?: number
  rentalDiscontinued?: number

  equipmentLines?: number
  equipmentOverOwned?: number

  members?: number
  yourRole?: string

  /** One pill per area, in the order the readiness row draws them. */
  readiness: ReadinessVerdict[]
}

export interface ReadinessVerdict {
  area: 'audio' | 'lighting' | 'rental' | 'equipment' | 'plots'
  /** The tab this verdict belongs to, for the link. */
  tab: string
  /** What the owning strip says: '2 gaps', 'addressed', '1 over stock'. */
  label: string
  tone: 'ok' | 'warn' | 'error' | 'neutral'
}
```

### Every field is optional on purpose

`undefined` means *not known yet* — a query in flight, or a plan that does not
exist. `0` means *counted, and it is zero*. The band renders `—` for the first and
`0` for the second (FR-062), which is the Undeclared/Empty distinction
`design/patterns.md` §5 already draws and the reason `Meter` withholds itself.

The function therefore takes each input as possibly-`undefined` and propagates,
rather than defaulting to `[]` at the top:

```ts
export function eventSummary(input: {
  event?: Event
  patch?: AudioPatchResponse
  rig?: LightingRigResponse
  trusses?: PlotTruss[]
  plots?: StagePlot[]
  rental?: RentalSummary
  equipment?: OwnedEquipmentLine[]
  members?: EventMember[]
}): EventSummary
```

### What it calls, and does not reimplement

| Figure | Called |
|---|---|
| `signalGaps` | `buildInputChannelFlows`, `buildOutputChannelFlows` (`lib/inputSignalFlow`, `lib/signalFlow`) |
| `cablesPicked` | `cablesPicked` (`lib/patchCapacity`) |
| `dmxState`, `dmxUsed`, `universes`, `unaddressed` | `dmxMap`, `dmxStatusState` (`lib/dmxMap`) |
| `rental*` | read directly off `RentalSummary`, which the server already totals |

`dmxCapacity` is `universes.length * UNIVERSE_SIZE`, over universes **in use** —
an unused universe is not spare capacity, it is a universe nobody has mentioned.

---

## 2 · The rental sheet's row projection

Read-only, built in the tab from `EventRental` (`backend/internal/domain/rental.go`)
which is unchanged.

| Column | Source | Note |
|---|---|---|
| Item | `inventory_item_name` | `discontinued` pill from `is_discontinued` |
| Description | `description` | truncated |
| Audio | `quantity_audio` | badge `+N` where `manual_quantity_audio > 0` |
| Light | `quantity_lighting` | badge `+N` where `manual_quantity_lighting > 0` |
| Qty | `total_quantity` | |
| Stock | `quantity_available` | red where `is_over_stock` |
| Price | `price_ex_vat` | |
| Subtotal | `subtotal_ex_vat` | |
| Note | `manual_notes` | |

**Derived-vs-manual** is the split the editor exists to state:

```
plannedAudio = quantity_audio - manual_quantity_audio
plannedLight = quantity_lighting - manual_quantity_lighting
```

A line is **manual-bearing** when either manual quantity is above zero; only those
offer `Delete`, and deleting removes the manual part (`DELETE
/events/{id}/rentals/manual/{itemID}`), leaving whatever the plan contributes.

## 3 · The equipment sheet's row projection

One row type over **two** record types, which is the merge.

```ts
type EquipmentRow =
  | { source: 'owned';  id: number; name: string; type: string;
      qty: number; have: number; over: boolean; note?: string }
  | { source: 'rented'; id: number; name: string; type: string;
      audio: number; light: number; qty: number; note?: string }
```

- `owned` comes from `OwnedEquipmentLine` (`GET /events/{id}/owned-equipment`);
  `have` is `quantity_owned`, `over` is `is_over_owned`.
- `rented` comes from `RentalSummary.items` filtered to those with a manual part —
  the same filter `EquipmentTab` applies today — with `type` from `category_name`.
- `id` is the *item* id in both cases, which is what both endpoints key on. The two
  id spaces are separate, so the row's React key is `${source}-${id}`.

Ordering: `owned` before `rented`, then by `name` (FR-031).

## 4 · The signal flow projection

Unchanged in substance. `InputChannelFlow` and `OutputChannelFlow` are already
what `lib/inputSignalFlow` and `lib/signalFlow` return, and this wave re-renders
them rather than re-deriving them. The only addition is a **hop count** for the
strip:

```
hops = Σ flow.paths[].hops.length   over both directions
```

## 5 · What is not modelled

- **Cable length.** `XLR 10 m` is a *name*, and reading a metre count out of it is
  the derived-from-a-name violation P6 names outright. The band counts cables, not
  metres. Adding a length field to an inventory item is a slice of its own.
- **A per-event weight or power total.** Same reason: neither is a field.
- **A saved dashboard layout.** The band's five figures are fixed.
