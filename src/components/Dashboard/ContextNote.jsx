import { formatDate, formatNumber } from '../../utils/formatters'

// People as a modelled estimate: rounded, because a model of 100 m cells does not know a count to the person.
export function modelledPeople(people) {
  if (people == null) return null
  if (people < 50) return 'under 50'
  return formatNumber(people < 1000 ? Math.round(people / 10) * 10 : Math.round(people / 100) * 100)
}

// Two figures from open datasets that are not the satellite change detection: modelled people in the
// mapped buildings (WorldPop) and the river flow on the event date against the time of year's norm
// (GloFAS). They sit beside the map and nothing on it is calculated from them, which the heading says.
export default function ContextNote({ context }) {
  const population = context?.population
  const river = context?.river
  if (!population && !river) return null
  const times = river ? river.ratio_on_event : null
  return (
    <section aria-labelledby="context-heading">
      <h3 id="context-heading" className="section-title">
        Context, not part of the map
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        From open datasets other than the satellite images. No flood, damage or cut-off figure here is calculated from them.
      </p>
      <dl className="mt-2 divide-y divide-line border-t border-line text-sm">
        {population && (
          <div className="py-2.5">
            <dt className="flex items-baseline justify-between gap-3">
              <span className="font-medium">People living in the mapped buildings</span>
              <span className="num font-semibold">about {modelledPeople(population.people_in_mapped_buildings)}</span>
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-ink-soft">
              Modelled, not counted: {population.source}, shared over the OpenStreetMap buildings. People in cells with no mapped building are left out.
            </dd>
          </div>
        )}
        {river && (
          <div className="py-2.5">
            <dt className="flex items-baseline justify-between gap-3">
              <span className="font-medium">River flow on {formatDate(river.event)}</span>
              <span className="num font-semibold">{times} times the norm</span>
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-ink-soft">
              {formatNumber(river.on_event_m3s, 1)} m³/s against {formatNumber(river.normal_m3s, 1)} m³/s in the same weeks of {river.years} earlier
              years; the peak in the following week was {river.ratio_peak} times the norm. {river.limits}
            </dd>
          </div>
        )}
      </dl>
      {context.attribution?.length > 0 && <p className="mt-2 text-xs text-ink-muted">{context.attribution.join(' ')}</p>}
    </section>
  )
}
