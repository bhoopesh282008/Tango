import { USE_MOCK } from '../../config/apiConfig'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'

// The status colour appears once per figure, as a small square beside its label.
const KEY = { water: 'bg-water', cutOff: 'bg-critical', damaged: 'bg-debris' }

function Figure({ label, value, unit, note, tone, size = 'text-[28px]' }) {
  return (
    <div className="min-w-0">
      <dt className="label flex items-center gap-1.5">
        {tone && <span className={`h-2 w-2 shrink-0 ${KEY[tone]}`} aria-hidden />}
        {label}
      </dt>
      <dd className="mt-1.5">
        <span className={`num font-semibold leading-none tracking-tight text-ink ${size}`}>{value}</span>
        {/* A real space, so the number and its unit are two words to a screen reader as well */}
        {unit && (
          <>
            {' '}
            <span className="ml-1 text-sm text-ink-soft">{unit}</span>
          </>
        )}
        {note && <span className="mt-1.5 block text-xs leading-snug text-ink-soft">{note}</span>}
      </dd>
    </div>
  )
}

// What the map found and who it affects, in the order a responder asks: how much water, who is
// cut off, what is damaged. A figure is shown only if the run could produce it.
export default function Situation({ stats }) {
  const buildings = stats.sizeBasis === 'buildings'
  const types = Object.keys(DAMAGE_TYPES).filter((type) => stats.areaByType[type] > 0)
  // A pipeline run cannot tell open water from wet sediment on a valley floor.
  const waterNote = `${formatNumber(stats.areaByType.water, 1)} km² ${USE_MOCK ? 'open water' : 'water or wet sediment'}`

  return (
    <section aria-labelledby="figures-heading" className="px-5 pb-4 pt-4">
      <h2 id="figures-heading" className="sr-only">
        Key figures
      </h2>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="col-span-2">
          <Figure label="Flooded area" tone="water" value={formatNumber(stats.floodedAreaKm2, 1)} unit="km²" />
          {types.length > 0 && (
            <>
              {/* How the area splits: one bar, and the same figures in words below it */}
              <div className="mt-2.5 flex h-1.5 gap-px overflow-hidden" role="img" aria-label="Flooded area by type">
                {types.map((type) => (
                  <span
                    key={type}
                    style={{ flexGrow: stats.areaByType[type], background: DAMAGE_TYPES[type].color }}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">
                {types.length === 1 ? waterNote : types.map((type) => `${formatNumber(stats.areaByType[type], 1)} km² ${DAMAGE_TYPES[type].label.toLowerCase()}`).join(' · ')}
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
          size="text-[22px]"
        />
        <Figure label={WORDING.road} value={formatNumber(stats.damagedRoadKm, 1)} unit="km" size="text-[22px]" />
      </dl>

      {stats.infrastructureAssessed ? (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
          <Count label={WORDING.bridges} value={stats.bridgesDestroyed.length} />
          <Count label="Health posts unreachable" value={stats.healthPostsUnreachable.length} />
          {stats.powerLinesAssessed && <Count label="Power lines down" value={`${formatNumber(stats.powerLineKmDown, 1)} km`} />}
        </dl>
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
          Bridges, health posts and power lines were not assessed in this run.
        </p>
      )}
    </section>
  )
}

function Count({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-soft">{label}</dt>
      {/* The number reads first, so it is moved in front of its label on screen only */}
      <dd className="num order-first text-base font-semibold">{value}</dd>
    </div>
  )
}
