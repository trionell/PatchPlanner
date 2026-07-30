import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createReferenceTemplateValue, deleteReferenceTemplateValue, updateReferenceTemplateValue } from '../api/referenceTemplates'
import { getPricingDefaults, updatePricingDefaults } from '../api/pricingDefaults'
import { VocabularyPanel } from '../components/VocabularyPanel'
import { useReferenceTemplate } from '../hooks/useReferenceData'
import { useIsMobile } from '../hooks/useIsMobile'
import { CHARGED_DAYS_LABELS } from '../lib/rentalPricing'
import { Input } from '../components/ui/Input'
import { MicroLabel } from '../components/ui/Label'
import { MobilePanel } from '../components/ui/MobilePanel'
import { PatchPanel } from '../components/ui/PatchPanel'
import { Select } from '../components/ui/Select'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { PricingDefaults } from '../types'

/**
 * What a new thing starts as.
 *
 * Two tabs, each owning a panel — the shape patterns §1 already specifies for
 * one page holding two kinds of thing, and the one that survives a third
 * default arriving. Slice 31 added the second; the vocabulary panel behind the
 * first is untouched.
 */
export function MyDefaultsPage() {
  const isMobile = useIsMobile()
  // The same unbroken flex column `Inventories` needs on a phone: `Tabs` and
  // `TabPanel` are blocks, so a panel inside them has no definite height to
  // fill and would be clipped with no scrollbar anywhere.
  const column = isMobile ? 'flex min-h-0 flex-1 flex-col gap-3 space-y-0' : undefined

  return (
    <Tabs className={column} defaultValue="vocabularies">
      <TabList className="flex-none">
        <Tab value="vocabularies">Vocabularies</Tab>
        <Tab value="pricing">Rental pricing</Tab>
      </TabList>
      <TabPanel className={column} value="vocabularies">
        <VocabularyDefaults />
      </TabPanel>
      <TabPanel className={column} value="pricing">
        <PricingDefaultsPanel />
      </TabPanel>
    </Tabs>
  )
}

/**
 * A user's own personal planning-vocabulary template (Slice 17) — used
 * only to seed new events at creation time. Editing it here never has any
 * live effect on an already-created event; an event's own vocabulary is
 * edited on that event's Settings tab instead.
 */
function VocabularyDefaults() {
  const queryClient = useQueryClient()
  const { data } = useReferenceTemplate()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reference-template'] })

  const createMutation = useMutation({
    mutationFn: ({ vocabulary, value, label }: { vocabulary: string; value: string; label: string }) =>
      createReferenceTemplateValue(vocabulary, value, label),
    onSuccess: invalidate,
  })
  const renameMutation = useMutation({
    mutationFn: ({ vocabulary, id, label }: { vocabulary: string; id: number; label: string }) =>
      updateReferenceTemplateValue(vocabulary, id, label),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: ({ vocabulary, id }: { vocabulary: string; id: number }) => deleteReferenceTemplateValue(vocabulary, id),
    onSuccess: invalidate,
  })

  return (
    <VocabularyPanel
      title="Vocabularies"
      data={data}
      // A template is not referenced by any plan, so it has no usage to report —
      // showing `0` would imply it could have one (Slice 29 FR-034).
      showUsage={false}
      note="every new event starts with a copy of these — editing them changes no existing event"
      onCreate={(vocabulary, value, label) => createMutation.mutateAsync({ vocabulary, value, label })}
      onRename={(vocabulary, id, label) => renameMutation.mutateAsync({ vocabulary, id, label })}
      onDelete={(vocabulary, id) => deleteMutation.mutateAsync({ vocabulary, id })}
    />
  )
}

/**
 * The two answers a catalog copies when it is **created** (Slice 31).
 *
 * Creation, not import: the catalog's columns are never null, so an import has
 * no unset state to detect, and one that re-applied these would silently undo
 * the edit the catalog's own Pricing drawer exists to allow. What an import
 * applies is what the file itself states — which is why a supplier's own VAT
 * rate can still overrule this one.
 */
function PricingDefaultsPanel() {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['pricing-defaults'], queryFn: getPricingDefaults })

  const save = useMutation({
    mutationFn: (defaults: PricingDefaults) => updatePricingDefaults(defaults),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing-defaults'] }),
  })

  const fields = (
    <div className="flex flex-col gap-4 px-3 py-3">
      <label className="flex max-w-sm flex-col gap-1">
        <MicroLabel>Which days a hire is charged for</MicroLabel>
        <Select
          size={isMobile ? undefined : 'sm'}
          value={data?.charged_days ?? 'onsite'}
          onChange={(event) =>
            save.mutate({
              charged_days: event.target.value as PricingDefaults['charged_days'],
              vat_percent: data?.vat_percent ?? 25,
            })
          }
        >
          <option value="onsite">{CHARGED_DAYS_LABELS.onsite}</option>
          <option value="show">{CHARGED_DAYS_LABELS.show}</option>
        </Select>
      </label>

      <label className="flex w-28 flex-col gap-1">
        <MicroLabel>VAT %</MicroLabel>
        <Input
          size={isMobile ? undefined : 'sm'}
          type="number"
          min={0}
          key={`vat-${data?.vat_percent}`}
          defaultValue={data?.vat_percent ?? 25}
          onBlur={(event) => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value >= 0 && value !== data?.vat_percent) {
              save.mutate({ charged_days: data?.charged_days ?? 'onsite', vat_percent: value })
            }
          }}
        />
      </label>

      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        A catalog takes a copy of both when you <b className="font-medium text-zinc-400">create</b> it — except that a
        price list stating its own VAT rate overrules this one when you import it. Changing these never changes a
        catalog you already have; open that catalog's Pricing drawer instead.
      </p>
    </div>
  )

  const strip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
      <span className="text-zinc-500">seeds new catalogs · changes nothing that exists</span>
    </div>
  )

  if (isMobile) {
    return (
      <MobilePanel title="Rental pricing">
        {fields}
        {strip}
      </MobilePanel>
    )
  }

  return (
    <PatchPanel bar={<span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Rental pricing</span>}>
      {fields}
      {strip}
    </PatchPanel>
  )
}
