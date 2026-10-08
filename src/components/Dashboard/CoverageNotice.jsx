import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { formatNumber, formatPercent } from '../../utils/formatters'

const range = ([low, high]) =>
  formatPercent(low) === formatPercent(high) ? formatPercent(low) : `${formatPercent(low)} to ${formatPercent(high)}`

// "0.6 to 0.8" km2, or one figure when the two agree
const spread = (values, format) => {
  const low = Math.min(...values)
  const high = Math.max(...values)
  return format(low) === format(high) ? format(low) : `${format(low)} to ${format(high)}`
}

// What the same rule marks between two images that are both from before the flood: change that
// was not the flood, so part of the area mapped is ordinary change between two dates.
function FalseAlarmFloor({ nullTest }) {
  const pairs = nullTest?.pairs?.filter((p) => p.share_of_real != null)
  if (!pairs?.length || !(nullTest.real_flood_km2 > 0)) return null
  return (
    <>
      {' '}
      Between two images from before the flood the same rule marks {spread(pairs.map((p) => p.flood_km2), (v) => formatNumber(v, 1))} km²
      ({spread(pairs.map((p) => p.share_of_real), formatPercent)} of the {formatNumber(nullTest.real_flood_km2, 1)} km² mapped), so some of what is
      mapped is ordinary change, not the flood.
    </>
  )
}

// The figures beside it are what the map found, not everything the flood did.
// With a reference check the notice carries that check's numbers; a run that
// was never checked says so. The demo dataset is already labelled as a demo.
// Plain text with a rule at its edge, not a coloured box: it has to be read, not noticed.
export default function CoverageNotice({ validation, nullTest = null }) {
  if (USE_MOCK && !validation && !nullTest) return null
  return (
    <div role="note" className="border-l-2 border-l-warning pl-3 text-[13px] leading-relaxed text-ink-soft">
      <p>
        {validation ? (
          <>
            <strong className="font-semibold text-ink">These figures are a lower bound.</strong> Checked against {validation.reference} in{' '}
            {validation.areas} {validation.areas === 1 ? 'area' : 'areas'}, this map found {range(validation.recall)} of
            the affected area
            {validation.building_recall != null &&
              ` and ${formatPercent(validation.building_recall)} of the affected buildings`}
            . Where it marks flood it is usually right ({range(validation.precision)} of the mapped area lies inside
            the reference).
          </>
        ) : (
          <strong className="font-semibold text-ink">This map has not been checked against a reference.</strong>
        )}
        <FalseAlarmFloor nullTest={nullTest} /> An area with nothing marked is not known to be safe.{' '}
        <Link to="/about" className="underline">
          Method and limitations
        </Link>
      </p>
    </div>
  )
}
