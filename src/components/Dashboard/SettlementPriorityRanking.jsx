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

function RiskSummary({ priority }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
        className={`flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--surface-2)] ${
          selected ? 'bg-[var(--surface-2)] shadow-[inset_3px_0_0_0_var(--text-primary)]' : ''
        }`}
      >
        <span className="num w-5 shrink-0 pt-px text-sm text-ink-muted" aria-label={`Rank ${s.rank}`}>
          {s.rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold leading-snug">{s.name}</span>
            <span className="num shrink-0 text-[15px] font-semibold">
              <span className="sr-only">Score </span>
              {s.priority}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
            <span className={`h-2 w-2 shrink-0 ${BAND_FILL[s.band]}`} aria-hidden />
            <span>{band.label}</span>
            <span aria-hidden>·</span>
            <span className="num">{size}</span>
            <span aria-hidden>·</span>
            <span className="num">{formatPercent(s.damageRatio)} damaged</span>
          </span>
          {notes.length > 0 && <span className="mt-0.5 block text-xs text-ink-muted">{notes.join(' · ')}</span>}
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

  if (settlements.length === 0) {
    return (
      <section aria-labelledby="priority-heading" className="border-t border-line px-5 py-4">
        <h2 id="priority-heading" className="section-title">
          Rescue priority
        </h2>
        <p className="mt-1 text-sm text-ink-soft">No settlement is cut off in this run, so there is nothing to rank.</p>
      </section>
    )
  }

  const used = settlements[0].factorsUsed
  const missing = Object.keys(PRIORITY_WEIGHTS).filter((f) => !used.includes(f))

  return (
    <section aria-labelledby="priority-heading" className="border-t border-line">
      {/* Stays at the top of the pane while the rows scroll under it */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-2 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="priority-heading" className="section-title">
            Rescue priority
          </h2>
          <span className="num text-xs text-ink-soft">{settlements.length} cut-off settlements</span>
        </div>
        <RiskSummary priority={stats.priority} />
        <div className="no-print -ml-2.5 mt-2 flex flex-wrap" role="group" aria-label="Sort settlements by">
          {sorts.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortId(option.id)}
              aria-pressed={sortId === option.id}
              className="btn-quiet min-h-[32px] px-2.5 text-[13px]"
            >
              {(buildings && option.buildingsLabel) || option.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="divide-y divide-line">
        {settlements.map((settlement) => (
          <PriorityRow key={settlement.id} settlement={settlement} buildings={buildings} selected={selectedId === settlement.id} />
        ))}
      </ol>

      <details className="border-t border-line px-5 py-4 text-xs leading-relaxed text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">How the score is worked out</summary>
        {missing.length === 0 ? (
          <p className="mt-2">
            Score out of 100: population 35%, structure damage 25%, access difficulty 20%, critical
            infrastructure 15%, vulnerable residents 5%. The rank number always follows the priority
            score. Access, water supply and age figures come from field reports, not from the
            satellite analysis{USE_MOCK ? '; in demo mode they are illustrative' : ''}.
          </p>
        ) : (
          <p className="mt-2">
            Score out of 100, from the factors recorded for every settlement:{' '}
            {used.map((f) => `${FACTOR_LABELS[f]} ${Math.round(FACTOR_WEIGHTS[f] * 100)}%`).join(', ')},
            rescaled to add up to 100%. Not scored, because the data is missing for some or all
            settlements: {missing.map((f) => FACTOR_LABELS[f]).join(', ')}.
            A score built from fewer factors is a weaker guide; treat the order as provisional.
          </p>
        )}
      </details>
    </section>
  )
}
