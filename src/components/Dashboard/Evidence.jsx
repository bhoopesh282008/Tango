import { useState } from 'react'
import ContextNote from './ContextNote'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'

// Rows shown before "Show all": a real run lists dozens of bridges and road sections.
const LIST_LIMIT = 8

const range = (low, high) =>
  formatPercent(low) === formatPercent(high) ? formatPercent(low) : `${formatPercent(low)} to ${formatPercent(high)}`

// Four unnamed bridges are one line, "Unnamed bridge ×4", not four.
function grouped(items) {
  const byName = new Map()
  for (const item of items) {
    const entry = byName.get(item.name) ?? { name: item.name, count: 0, sections: 0, length_km: 0 }
    entry.count += 1
    entry.sections += item.sections ?? 0
    entry.length_km += item.length_km ?? 0
    byName.set(item.name, entry)
  }
  return [...byName.values()]
}

function ItemList({ items }) {
  const [all, setAll] = useState(false)
  const rows = grouped(items)
  const shown = all ? rows : rows.slice(0, LIST_LIMIT)
  return (
    <>
      <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-soft">
        {shown.map((row) => (
          <li key={row.name}>
            {row.name}
            {row.count > 1 && !row.sections && <span className="num"> ×{row.count}</span>}
            {row.sections > 1 && <span className="num"> ({formatNumber(row.length_km, row.length_km < 1 ? 2 : 1)} km in {row.sections} sections)</span>}
          </li>
        ))}
      </ul>
      {rows.length > LIST_LIMIT && (
        <button type="button" className="btn-quiet -ml-2.5 mt-1 min-h-[36px] text-[13px]" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? `Show first ${LIST_LIMIT}` : `Show all ${rows.length}`}
        </button>
      )}
    </>
  )
}

// What was found, by type. The confidence is the rule's own score for each zone, a ranking of
// how strong the radar change was, not a measured accuracy: so it is given as a range, as figures.
function Detection({ stats }) {
  const types = Object.keys(DAMAGE_TYPES)
  return (
    <section aria-labelledby="detection-heading">
      <h3 id="detection-heading" className="section-title">
        What was detected
      </h3>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Flooded area and detection confidence by type</caption>
        <thead>
          <tr className="text-left text-xs text-ink-soft">
            <th scope="col" className="pb-1.5 font-medium">Type</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Area</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {types.map((type) => {
            const area = stats.areaByType[type]
            const confidence = stats.confidenceByType[type]
            return (
              <tr key={type}>
                <th scope="row" className="py-2 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0" style={{ background: DAMAGE_TYPES[type].color }} aria-hidden />
                    {DAMAGE_TYPES[type].label}
                  </span>
                </th>
                <td className="num py-2 text-right">{formatNumber(area, 1)} km²</td>
                <td className="num py-2 text-right text-ink-soft">{area > 0 ? range(confidence.min, confidence.max) : 'none'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        Water is open water or wet sediment: the radar cannot tell them apart on a valley floor. Debris
        is sediment, a landslide or a debris deposit. Uncertain is change that needs checking.
        Confidence is a score for how strong the change was, not a measured accuracy; the check
        against a reference map is the note above the figures.
      </p>
    </section>
  )
}

function Infrastructure({ stats }) {
  const groups = [
    ...(stats.infrastructureAssessed
      ? [
          { label: WORDING.bridges, items: stats.bridgesDestroyed, total: String(stats.bridgesDestroyed.length) },
          { label: 'Health posts unreachable', items: stats.healthPostsUnreachable, total: String(stats.healthPostsUnreachable.length) },
          ...(stats.powerLinesAssessed
            ? [{ label: 'Power lines down', items: stats.powerLinesDown, total: `${formatNumber(stats.powerLineKmDown, 1)} km` }]
            : []),
        ]
      : []),
    { label: WORDING.road, items: stats.damagedRoadGroups, total: `${formatNumber(stats.damagedRoadKm, 1)} km` },
  ]
  return (
    <section aria-labelledby="infrastructure-heading">
      <h3 id="infrastructure-heading" className="section-title">
        Infrastructure in the flood zone
      </h3>
      <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
        {groups.map((group) => (
          <li key={group.label} className="py-2.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{group.label}</span>
              <span className="num font-semibold">{group.total}</span>
            </span>
            {group.items.length > 0 && <ItemList items={group.items} />}
          </li>
        ))}
      </ul>
      {!stats.powerLinesAssessed && (
        <p className="mt-2 text-xs text-ink-soft">
          {stats.infrastructureAssessed
            ? 'Power lines were not assessed in this run.'
            : 'Bridges, health posts and power lines were not assessed in this run.'}
        </p>
      )}
    </section>
  )
}

// How much of the answer rests on missing map data: the pre-event road map is what "cut off" is
// judged by, so a valley where it is thin has fewer answers, not safer ones.
function MapData({ quality }) {
  if (!quality) return null
  const near = quality.buildings_near_road
  return (
    <section aria-labelledby="mapdata-heading">
      <h3 id="mapdata-heading" className="section-title">
        How complete the road map is
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {near != null && (
          <>
            <span className="num font-semibold text-ink">{formatPercent(near)}</span> of the {formatNumber(quality.buildings)} mapped buildings are
            within {quality.near_road_m} m of a mapped road.{' '}
          </>
        )}
        <span className="num font-semibold text-ink">{formatNumber(quality.settlements_without_road)}</span> of {formatNumber(quality.settlements)}{' '}
        settlements have no mapped road at all, so for them &ldquo;cut off&rdquo; cannot be judged and they are listed as access unknown. A thin road
        map is not evidence of safety.
      </p>
    </section>
  )
}

// The pictures the map was made from, and what lies inside the zones it drew. Below the console
// because it backs the map up rather than being what a responder reads first.
export default function Evidence({ stats, children }) {
  return (
    <section aria-labelledby="evidence-heading" className="border-t border-line">
      <div className="mx-auto max-w-[110rem] px-3 py-10 sm:px-5">
        <h2 id="evidence-heading" className="section-title">
          Evidence
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          The radar images the map was made from, and what lies inside the flood zones.
        </p>
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-14">
          <div className="min-w-0">{children}</div>
          <div className="min-w-0 space-y-9">
            <Detection stats={stats} />
            <Infrastructure stats={stats} />
            <MapData quality={stats.osmQuality} />
            <ContextNote context={stats.context} />
          </div>
        </div>
      </div>
    </section>
  )
}
