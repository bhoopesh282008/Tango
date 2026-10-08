import { USE_MOCK } from '../../config/apiConfig'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'

// The status colour appears once per figure, as a small square beside its label.
const KEY = { water: 'bg-water', cutOff: 'bg-critical', damaged: 'bg-debris' }

function Figure({ label, value, unit, note, tone }) {
  return (
    <div className="min-w-0">
      <dt className="label flex items-center gap-1.5">
        {tone && <span className={`h-2 w-2 shrink-0 ${KEY[tone]}`} aria-hidden />}
        {label}
      </dt>
      <dd className="mt-2">
        <span className="num text-[32px] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {/* A real space, so the number and its unit are two words to a screen reader as well */}
        {unit && (
          <>
            {' '}
            <span className="ml-1 text-sm text-ink-soft">{unit}</span>
          </>
        )}
        {note && <span className="mt-2 block text-xs leading-snug text-ink-soft">{note}</span>}
      </dd>
    </div>
  )
}

function Count({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-soft">{label}</dt>
      {/* The number reads first, so it is moved in front of its label on screen only */}
      <dd className="num order-first font-semibold">{value}</dd>
    </div>
  )
}

// What the map found and who it affects, in the order a responder asks: how much water, who is
// cut off, what is damaged. Four figures and one line of the rest; a figure is shown only if the
// run could produce it. `children` is the note on how far to trust them, kept beside the figures.
export default function Situation({ stats, children }) {
  const buildings = stats.sizeBasis === 'buildings'
  const types = Object.keys(DAMAGE_TYPES).filter((type) => stats.areaByType[type] > 0)
  // A pipeline run cannot tell open water from wet sediment on a valley floor.
  const waterNote = `${formatNumber(stats.areaByType.water, 1)} km² ${USE_MOCK ? 'open water' : 'water or wet sediment'}`

  return (
    <section aria-labelledby="figures-heading" className="border-b border-line">
      <div className="mx-auto grid max-w-[110rem] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <div className="px-3 py-4 sm:px-5">
          <h2 id="figures-heading" className="sr-only">
            Key figures
          </h2>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4">
            <div className="col-span-2 min-w-0 md:col-span-1">
              <Figure label="Flooded area" tone="water" value={formatNumber(stats.floodedAreaKm2, 1)} unit="km²" />
              {types.length > 0 && (
                <>
                  {/* How the area splits: one bar, and the same figures in words below it */}
                  <div className="mt-3 flex h-1.5 gap-px overflow-hidden" role="img" aria-label="Flooded area by type">
                    {types.map((type) => (
                      <span key={type} style={{ flexGrow: stats.areaByType[type], background: DAMAGE_TYPES[type].color }} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-snug text-ink-soft">
                    {types.length === 1
                      ? waterNote
                      : types.map((type) => `${formatNumber(stats.areaByType[type], 1)} km² ${DAMAGE_TYPES[type].label.toLowerCase()}`).join(', ')}
                  </p>
                </>
              )}
            </div>

            <Figure
              label="Settlements cut off"
              tone="cutOff"
              value={formatNumber(stats.cutOff.length)}
              unit={`of ${formatNumber(stats.settlementRows.length)}`}
              note={stats.unknownAccess.length > 0 ? `${formatNumber(stats.unknownAccess.length)} with road access unknown` : undefined}
            />
            <Figure
              label={buildings ? 'Buildings in them' : 'People in them'}
              value={formatNumber(buildings ? stats.buildingsInCutOff : stats.populationAffected)}
              note={buildings ? 'population not recorded' : undefined}
            />
            <Figure
              label="Structures in the flood zone"
              tone="damaged"
              value={formatNumber(stats.damagedStructures)}
              unit={stats.totalStructures ? formatPercent(stats.damagedStructures / stats.totalStructures) : undefined}
              note={`of ${formatNumber(stats.totalStructures)} mapped`}
            />
          </dl>

          {stats.infrastructureAssessed ? (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t border-line pt-3 text-sm">
              <Count label={WORDING.road} value={`${formatNumber(stats.damagedRoadKm, 1)} km`} />
              <Count label={WORDING.bridges} value={stats.bridgesDestroyed.length} />
              <Count label="Health posts unreachable" value={stats.healthPostsUnreachable.length} />
              {stats.powerLinesAssessed && <Count label="Power lines down" value={`${formatNumber(stats.powerLineKmDown, 1)} km`} />}
            </dl>
          ) : (
            <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
              <dl>
                <Count label={WORDING.road} value={`${formatNumber(stats.damagedRoadKm, 1)} km`} />
              </dl>
              <p className="text-xs text-ink-soft">Bridges, health posts and power lines were not assessed in this run.</p>
            </div>
          )}
        </div>

        {children && (
          <div className="flex items-center border-t border-line px-3 py-4 sm:px-5 xl:border-l xl:px-6 xl:border-t-0">{children}</div>
        )}
      </div>
    </section>
  )
}
