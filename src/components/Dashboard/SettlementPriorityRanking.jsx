import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useMapStore } from '../../store/mapStore'
import { FACTOR_WEIGHTS, summarisePriority } from '../../utils/calculations'
import { ACCESS_LEVELS, PRIORITY_BANDS, PRIORITY_WEIGHTS } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'

const FACTOR_LABELS = {
  population: 'population',
  damage: 'structure damage',
  access: 'access difficulty',
  critical: 'critical infrastructure',
  vulnerable: 'vulnerable residents',
  buildings: 'settlement size in mapped buildings',
}

const SORTS = [
  { id: 'priority', label: 'Priority', compare: (a, b) => a.rank - b.rank },
  {
    id: 'population',
    label: 'Population',
    // Listed as "Buildings" and ordered by them when populations are not recorded
    buildingsLabel: 'Buildings',
    compare: (a, b) => (b.population ?? -1) - (a.population ?? -1) || b.total - a.total,
  },
  { id: 'damage', label: 'Damage', compare: (a, b) => b.damageRatio - a.damageRatio },
  {
    id: 'access',
    label: 'Access',
    compare: (a, b) => (b.access_difficulty ?? 0) - (a.access_difficulty ?? 0) || a.rank - b.rank,
  },
]

// Each band is told apart by its name as well as its colour (a square, never the whole row).
const BAND_FILL = { critical: 'bg-critical', high: 'bg-danger', medium: 'bg-warning', low: 'bg-success' }

// One grid for the heading row and every settlement row, so the columns line up. Below the
// medium breakpoint a row is a name and score with the details stacked under the name.
const ROW =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 px-3 sm:px-5 md:grid-cols-[2.5rem_minmax(9rem,1.3fr)_8rem_minmax(7rem,1fr)_6rem_minmax(0,2.2fr)_3rem] md:items-center md:gap-x-5'

function RiskSummary({ priority }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {summarisePriority(priority).map((band) => (
        <li key={band.id} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 ${BAND_FILL[band.id]}`} aria-hidden />
          <span className="num font-semibold">{band.count}</span>
          <span className="text-ink-soft">{band.label}</span>
        </li>
      ))}
    </ul>
  )
}

function PriorityRow({ settlement: s, buildings, selected }) {
  const focusSettlement = useMapStore((state) => state.focusSettlement)
  const setHighlighted = useMapStore((state) => state.setHighlightedSettlement)
  const band = PRIORITY_BANDS.find((b) => b.id === s.band)
  const access = s.access_difficulty != null ? ACCESS_LEVELS[s.access_difficulty - 1] : null
  const notes = [
    access && `Access: ${access.label}`,
    s.healthPostUnreachable && 'Health post unreachable',
    s.bridgeDestroyed && WORDING.bridgeIssue,
    s.water_source_cut && 'Water supply cut',
  ].filter(Boolean)
  const size = buildings ? `${formatNumber(s.total)} buildings` : s.population != null ? `${formatNumber(s.population)} people` : 'population not recorded'

  return (
    // Off-screen rows are not laid out until they are near: a run can have well over a hundred.
    <li className="[contain-intrinsic-size:auto_68px] [content-visibility:auto]">
      <button
        type="button"
        onClick={() => focusSettlement(s)}
        onMouseEnter={() => setHighlighted(s.id)}
        onMouseLeave={() => setHighlighted(null)}
        aria-current={selected ? 'true' : undefined}
        title="Show on the map"
        className={`${ROW} w-full py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] ${
          selected ? 'bg-[var(--surface-2)] shadow-[inset_3px_0_0_0_var(--text-primary)]' : ''
        }`}
      >
        <span className="num text-sm text-ink-muted" aria-label={`Rank ${s.rank}`}>
          {s.rank}
        </span>
        <span className="truncate text-[15px] font-semibold leading-snug">{s.name}</span>
        {/* On a phone the score stays beside the name; from md it is the last column */}
        <span className="num col-start-3 row-start-1 text-right text-[15px] font-semibold md:order-last md:col-auto md:row-auto">
          <span className="sr-only">Score </span>
          {s.priority}
        </span>
        <span className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-soft md:contents">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 ${BAND_FILL[s.band]}`} aria-hidden />
            {band.label}
          </span>
          <span className="num">{size}</span>
          <span className="num">{formatPercent(s.damageRatio)} damaged</span>
        </span>
        {/* Kept as an empty cell from md up so the score stays in its column */}
        <span className={`col-span-2 col-start-2 text-[13px] leading-snug text-ink-muted md:col-auto ${notes.length ? '' : 'max-md:hidden'}`}>
          {notes.join(' · ')}
        </span>
      </button>
    </li>
  )
}

export default function SettlementPriorityRanking({ stats }) {
  const [sortId, setSortId] = useState('priority')
  const selectedId = useMapStore((state) => state.focus?.settlement?.id)
  const buildings = stats.sizeBasis === 'buildings'
  // Sorting by access is offered only when the data has access levels.
  const sorts = SORTS.filter((o) => o.id !== 'access' || stats.priority.some((p) => p.access_difficulty != null))
  const sort = SORTS.find((s) => s.id === sortId)
  const settlements = [...stats.priority].sort(sort.compare)

  const shell = 'mx-auto max-w-[110rem]'

  if (settlements.length === 0) {
    return (
      <section aria-labelledby="priority-heading" className="border-t border-line">
        <div className={`${shell} px-3 py-8 sm:px-5`}>
          <h2 id="priority-heading" className="section-title">
            Rescue priority
          </h2>
          <p className="mt-1 text-sm text-ink-soft">No settlement is cut off in this run, so there is nothing to rank.</p>
        </div>
      </section>
    )
  }

  const used = settlements[0].factorsUsed
  const missing = Object.keys(PRIORITY_WEIGHTS).filter((f) => !used.includes(f))

  return (
    <section aria-labelledby="priority-heading" className="border-t border-line">
      <div className={`${shell} px-3 pb-3 pt-8 sm:px-5`}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 id="priority-heading" className="text-xl font-semibold tracking-tight">
              Rescue priority
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              <span className="num">{settlements.length}</span> cut-off settlements. Choose one to see it on the map.
            </p>
          </div>
          <div className="no-print -mr-2.5 flex flex-wrap" role="group" aria-label="Sort settlements by">
            {sorts.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSortId(option.id)}
                aria-pressed={sortId === option.id}
                className="btn-quiet px-3"
              >
                {(buildings && option.buildingsLabel) || option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <RiskSummary priority={stats.priority} />
        </div>
      </div>

      <div className={shell}>
        {/* Column names, drawn only where the rows are a table; each row carries its own labels for a screen reader */}
        <div aria-hidden className={`${ROW} border-y border-line py-2 text-xs font-medium text-ink-soft max-md:hidden`}>
          <span>#</span>
          <span>Settlement</span>
          <span>Priority</span>
          <span>{buildings ? 'Buildings' : 'Population'}</span>
          <span>Damaged</span>
          <span>Notes</span>
          <span className="text-right">Score</span>
        </div>
        <ol className="divide-y divide-line border-t border-line md:border-t-0">
          {settlements.map((settlement) => (
            <PriorityRow key={settlement.id} settlement={settlement} buildings={buildings} selected={selectedId === settlement.id} />
          ))}
        </ol>

        <details className="border-t border-line px-3 py-5 text-sm leading-relaxed text-ink-soft sm:px-5">
          <summary className="cursor-pointer font-medium text-ink">How the score is worked out</summary>
          {missing.length === 0 ? (
            <p className="mt-2 max-w-prose">
              Score out of 100: population 35%, structure damage 25%, access difficulty 20%, critical
              infrastructure 15%, vulnerable residents 5%. The rank number always follows the priority
              score. Access, water supply and age figures come from field reports, not from the
              satellite analysis{USE_MOCK ? '; in demo mode they are illustrative' : ''}.
            </p>
          ) : (
            <p className="mt-2 max-w-prose">
              Score out of 100, from the factors recorded for every settlement:{' '}
              {used.map((f) => `${FACTOR_LABELS[f]} ${Math.round(FACTOR_WEIGHTS[f] * 100)}%`).join(', ')},
              rescaled to add up to 100%. Not scored, because the data is missing for some or all
              settlements: {missing.map((f) => FACTOR_LABELS[f]).join(', ')}.
              A score built from fewer factors is a weaker guide; treat the order as provisional.
            </p>
          )}
        </details>
      </div>
    </section>
  )
}
