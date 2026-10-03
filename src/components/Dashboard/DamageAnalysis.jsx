import { useMapStore } from '../../store/mapStore'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPeople, formatPercent } from '../../utils/formatters'

const ACCESS = {
  cutOff: { order: 0, label: 'Cut off', className: 'bg-critical-soft text-critical' },
  unknown: { order: 1, label: 'Access unknown', className: 'bg-surface-alt text-ink-soft' },
  connected: { order: 2, label: 'Connected', className: 'bg-success-soft text-ink' },
}
const accessOf = (s) =>
  s.connected === true ? ACCESS.connected : s.connected === false ? ACCESS.cutOff : ACCESS.unknown

function ConfidenceCard({ stats }) {
  return (
    <div className="card p-4">
      <h3 className="section-title">Detection confidence</h3>
      <ul className="mt-3 space-y-3.5">
        {Object.entries(DAMAGE_TYPES).map(([type, meta]) => {
          const confidence = stats.confidenceByType[type]
          const detected = stats.areaByType[type] > 0
          return (
            <li key={type}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">{meta.label}</span>
                <span className="font-semibold">{detected ? formatPercent(confidence.mean) : 'none'}</span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt"
                role="meter"
                aria-label={`${meta.label} detection confidence`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(confidence.mean * 100)}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${confidence.mean * 100}%`, background: meta.color }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {formatNumber(stats.areaByType[type], 1)} km²
                {detected &&
                  ` · zones range ${formatPercent(confidence.min)} to ${formatPercent(confidence.max)}`}
                {' · '}
                {meta.hint}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
        Area-weighted mean across all zones: {formatPercent(stats.meanConfidence)}
      </p>
    </div>
  )
}

function InfrastructureCard({ stats }) {
  const groups = [
    ...(stats.infrastructureAssessed
      ? [
          { label: 'Bridges destroyed', items: stats.bridgesDestroyed, total: String(stats.bridgesDestroyed.length) },
          {
            label: 'Health posts unreachable',
            items: stats.healthPostsUnreachable,
            total: String(stats.healthPostsUnreachable.length),
          },
          { label: 'Power lines down', items: stats.powerLinesDown, total: `${formatNumber(stats.powerLineKmDown, 1)} km` },
        ]
      : []),
    { label: 'Road destroyed', items: stats.damagedRoads, total: `${formatNumber(stats.damagedRoadKm, 1)} km` },
  ]
  return (
    <div className="card p-4">
      <h3 className="section-title">Damaged infrastructure</h3>
      <ul className="mt-3 space-y-2.5 text-sm">
        {groups.map((g) => (
          <li key={g.label}>
            <span className="flex justify-between gap-3">
              <span className="font-medium">{g.label}</span>
              <span className="font-semibold text-critical">{g.total}</span>
            </span>
            {g.items.length > 0 && (
              <ul className="mt-0.5 list-disc pl-5 text-xs text-ink-soft">
                {g.items.map((item, i) => (
                  // Roads from a pipeline run carry no id
                  <li key={item.id ?? i}>{item.name}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!stats.infrastructureAssessed && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
          Bridges, health posts and power lines were not assessed in this run.
        </p>
      )}
    </div>
  )
}

function SettlementsCard({ stats }) {
  const setHighlighted = useMapStore((s) => s.setHighlightedSettlement)
  // Cut-off settlements first, then unknown access, then by population.
  const rows = [...stats.settlementRows].sort(
    (a, b) => accessOf(a).order - accessOf(b).order || (b.population ?? 0) - (a.population ?? 0),
  )
  return (
    <div className="card p-4">
      <h3 className="section-title">
        Cut-off settlements{' '}
        <span className="font-normal text-ink-soft">
          ({stats.cutOff.length} of {rows.length})
        </span>
      </h3>
      <ul className="mt-3 max-h-64 overflow-y-auto pr-1 text-sm print:max-h-none">
        {rows.map((s) => (
          <li
            key={s.id}
            onMouseEnter={() => setHighlighted(s.id)}
            onMouseLeave={() => setHighlighted(null)}
            className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block text-xs text-ink-soft">
                {formatPeople(s.population)} · {formatNumber(s.damaged)} of {formatNumber(s.total)}{' '}
                structures damaged
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${accessOf(s).className}`}
            >
              {accessOf(s).label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DamageAnalysis({ stats }) {
  return (
    <section aria-label="Damage analysis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ConfidenceCard stats={stats} />
      <InfrastructureCard stats={stats} />
      <SettlementsCard stats={stats} />
    </section>
  )
}
