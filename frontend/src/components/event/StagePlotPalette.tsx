import type { StagePlotShapeKind } from '../../types'
import type { StagePlotElementCreate } from '../../api/stagePlots'
import { iconViewBox, STAGE_PLOT_ICONS } from '../../lib/stagePlotIcons'

interface StagePlotPaletteProps {
  /** Called with a ready-to-create element (position filled by the tab). */
  onPlace: (template: Omit<StagePlotElementCreate, 'layer_id' | 'x_cm' | 'y_cm'>) => void
  disabled: boolean
  /** The event's lighting rig, for placing real fixtures on the plot. */
  rigFixtures: Array<{ id: number; name: string; trussName?: string; placed: boolean }>
}

const SHAPES: Array<{ kind: StagePlotShapeKind; label: string; defaults: { width_cm: number; depth_cm: number } }> = [
  { kind: 'rect', label: 'Rectangle', defaults: { width_cm: 200, depth_cm: 100 } },
  { kind: 'ellipse', label: 'Ellipse', defaults: { width_cm: 100, depth_cm: 100 } },
  { kind: 'line', label: 'Line', defaults: { width_cm: 200, depth_cm: 0 } },
  { kind: 'text', label: 'Text', defaults: { width_cm: 100, depth_cm: 30 } },
]

const shapePreview: Record<StagePlotShapeKind, JSX.Element> = {
  rect: <rect x="3" y="6" width="18" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  line: <path d="M4 19 L20 5" />,
  text: <path d="M5 6h14M12 6v13" />,
}

function PaletteItem({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-md border border-zinc-800 px-1 py-2 text-[11px] leading-tight text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
      title={`Place ${label}`}
    >
      <span className="h-6 w-6">{children}</span>
      <span className="text-center">{label}</span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  )
}

/** Left-hand palette: click an entry to drop it at the viewport centre
 *  on the active layer, sized with the icon's real-world defaults. */
export function StagePlotPalette({ onPlace, disabled, rigFixtures }: StagePlotPaletteProps) {
  const resources = STAGE_PLOT_ICONS.filter((icon) => icon.group === 'resource')
  const instruments = STAGE_PLOT_ICONS.filter((icon) => icon.group === 'instrument')
  const fixtureIcon = STAGE_PLOT_ICONS.find((icon) => icon.id === 'fixture')

  const placeIcon = (iconId: string) => {
    const icon = STAGE_PLOT_ICONS.find((entry) => entry.id === iconId)
    if (!icon) return
    onPlace({
      kind: 'resource',
      icon: icon.id,
      name: '',
      z_cm: 0,
      width_cm: icon.defaults.width_cm,
      depth_cm: icon.defaults.depth_cm,
      height_cm: icon.defaults.height_cm,
      rotation_deg: 0,
    })
  }

  const iconButton = (icon: (typeof STAGE_PLOT_ICONS)[number]) => (
    <PaletteItem key={icon.id} label={icon.label} disabled={disabled} onClick={() => placeIcon(icon.id)}>
      {/* Preview keeps the glyph's true aspect (meet) inside the tile. */}
      <svg viewBox={iconViewBox(icon.id, 'top')} preserveAspectRatio="xMidYMid meet" className="h-full w-full text-zinc-300">
        {icon.glyphs.top}
      </svg>
    </PaletteItem>
  )

  return (
    <div className="flex w-44 flex-none flex-col gap-4 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
      <Section title="Shapes">
        {SHAPES.map((shape) => (
          <PaletteItem
            key={shape.kind}
            label={shape.label}
            disabled={disabled}
            onClick={() =>
              onPlace({
                kind: 'shape',
                shape_kind: shape.kind,
                name: shape.kind === 'text' ? 'Text' : '',
                z_cm: 0,
                width_cm: shape.defaults.width_cm,
                depth_cm: shape.defaults.depth_cm,
                height_cm: 0,
                rotation_deg: 0,
              })
            }
          >
            <svg viewBox="0 0 24 24" className="h-full w-full text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.5">
              {shapePreview[shape.kind]}
            </svg>
          </PaletteItem>
        ))}
      </Section>
      <Section title="Resources">{resources.map(iconButton)}</Section>
      <Section title="Instruments">{instruments.map(iconButton)}</Section>
      {/* Real rig fixtures (not generic symbols): place one, then drag
          it onto a truss bar to hang it there. */}
      <div>
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Rig fixtures</p>
        {rigFixtures.length === 0 ? (
          <p className="px-0.5 text-[11px] leading-snug text-zinc-600">No fixtures in the lighting rig yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {rigFixtures.map((fixture) => {
              const unavailable = fixture.placed || fixture.trussName != null
              return (
                <button
                  key={fixture.id}
                  type="button"
                  disabled={disabled || unavailable}
                  onClick={() =>
                    fixtureIcon &&
                    onPlace({
                      kind: 'fixture',
                      fixture_id: fixture.id,
                      name: '',
                      z_cm: 0,
                      width_cm: fixtureIcon.defaults.width_cm,
                      depth_cm: fixtureIcon.defaults.depth_cm,
                      height_cm: fixtureIcon.defaults.height_cm,
                      rotation_deg: 0,
                    })
                  }
                  className="flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-1.5 text-left text-[11px] leading-tight text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                  title={
                    fixture.trussName
                      ? `Hanging on ${fixture.trussName} — detach it in Trusses… to place it freely`
                      : fixture.placed
                        ? 'Already on this plot'
                        : `Place ${fixture.name}, then drag it onto a truss to hang it`
                  }
                >
                  {fixtureIcon && (
                    <svg viewBox={iconViewBox('fixture', 'top')} preserveAspectRatio="xMidYMid meet" className="h-5 w-5 flex-none text-zinc-300">
                      {fixtureIcon.glyphs.top}
                    </svg>
                  )}
                  <span className="min-w-0 flex-1 truncate">{fixture.name}</span>
                  {fixture.trussName && <span className="flex-none text-[10px] text-amber-500/80">on truss</span>}
                  {!fixture.trussName && fixture.placed && <span className="flex-none text-[10px] text-zinc-500">placed</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
