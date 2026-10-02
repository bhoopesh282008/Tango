import { useMapStore } from '../../store/mapStore'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'

function ConfidenceCard({ stats }) {
  return (
    <div className="card p-4">
      <h3 className="section-title">Model confidence levels</h3>
      <ul className="mt-3 space-y-3">
        {Object.entries(DAMAGE_TYPES).map(([type, meta]) => {
          const zones = stats.zones.filter((z) => z.type === type)
          const range = zones.length
            ? `${formatPercent(Math.min(...zones.map((z) => z.confidence)))} to ${formatPercent(
                Math.max(...zones.map((z) => z.confidence)),
              )}`
            : 'none detected'
          return (
            <li key={type} className="flex items-start gap-3">
              <span
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-line"
                style={{ background: meta.color }}
                aria-hidden
              />
              <span className="min-w-0 text-sm">
                <span className="font-medium">{meta.label}</span>
                <span className="text-ink-soft">
                  {' '}
                  · {formatNumber(stats.areaByType[type], 1)} km² · confidence {range}
                </span>
                <span className="block text-xs text-ink-soft">{meta.hint}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
        Area-weighted mean confidence: {formatPercent(stats.meanConfidence)}
      </p>
    </div>
  )
}

function InfrastructureCard({ stats }) {
  const groups = [
    { label: 'Bridges destroyed', items: stats.bridgesDestroyed, total: String(stats.bridgesDestroyed.length) },
    {
      label: 'Health posts unreachable',
      items: stats.healthPostsUnreachable,
      total: String(stats.healthPostsUnreachable.length),
    },
    { label: 'Power lines down', items: stats.powerLinesDown, total: `${formatNumber(stats.powerLineKmDown, 1)} km` },
    { label: 'Road destroyed', items: [], total: `${formatNumber(stats.damagedRoadKm, 1)} km` },
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
                {g.items.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SettlementsCard({ stats }) {
  const setHighlighted = useMapStore((s) => s.setHighlightedSettlement)
  // Cut-off settlements first, then by population.
  const rows = [...stats.settlementRows].sort(
    (a, b) => Number(a.connected) - Number(b.connected) || b.population - a.population,
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
                {formatNumber(s.population)} people · {formatNumber(s.damaged)} of {formatNumber(s.total)}{' '}
                structures damaged
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                s.connected ? 'bg-success-soft text-ink' : 'bg-critical-soft text-critical'
              }`}
            >
              {s.connected ? 'Connected' : 'Cut off'}
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
