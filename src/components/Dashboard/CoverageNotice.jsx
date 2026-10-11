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
    <p>
      Between two images from before the flood the same rule marks{' '}
      <Fig>{spread(pairs.map((p) => p.flood_km2), (v) => formatNumber(v, 1))} km²</Fig> (
      <Fig>{spread(pairs.map((p) => p.share_of_real), formatPercent)}</Fig> of the {formatNumber(nullTest.real_flood_km2, 1)} km² mapped), so some of
      what is mapped is ordinary change, not the flood.
    </p>
  )
}

// A measured figure inside the note's sentences: in ink, so the eye finds the numbers first
function Fig({ children }) {
  return <span className="num font-semibold text-ink">{children}</span>
}

// The figures beside it are what the map found, not everything the flood did.
// With a reference check the notice carries that check's numbers; a run that
// was never checked says so. The demo dataset is already labelled as a demo.
// Plain text with a rule at its edge, not a coloured box: it has to be read, not noticed.
// One sentence to a line, the headline first, so each check can be found without reading it all.
// Below this share the satellite pass missed part of the area: nothing there was mapped, and that
// is not the same as nothing happening there.
const FULL_COVERAGE = 0.97

export default function CoverageNotice({ validation, nullTest = null, coverage = null }) {
  if (USE_MOCK && !validation && !nullTest) return null
  const partial = coverage != null && coverage < FULL_COVERAGE
  return (
    <div role="note" className="space-y-1.5 border-l-2 border-l-warning pl-3.5 text-[13px] leading-snug text-ink-soft">
      {validation ? (
        <>
          <p className="text-sm font-semibold text-ink">These figures are a lower bound.</p>
          <p>
            Checked against {validation.reference} in {validation.areas} {validation.areas === 1 ? 'area' : 'areas'}, this map found{' '}
            <Fig>{range(validation.recall)}</Fig> of the affected area
            {validation.building_recall != null && (
              <>
                {' '}
                and <Fig>{formatPercent(validation.building_recall)}</Fig> of the affected buildings
              </>
            )}
            .
          </p>
          <p>
            Where it marks flood it is usually right (<Fig>{range(validation.precision)}</Fig> of the mapped area lies inside the reference).
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold text-ink">This map has not been checked against a reference.</p>
      )}
      <FalseAlarmFloor nullTest={nullTest} />
      {partial && (
        <p>
          <strong className="font-semibold text-ink">The radar images cover {formatPercent(coverage)} of this area.</strong> The rest was not
          mapped at all.
        </p>
      )}
      <p>
        An area with nothing marked is not known to be safe.{' '}
        <Link to="/about" className="whitespace-nowrap font-medium text-ink underline underline-offset-2">
          Method and limitations
        </Link>
      </p>
    </div>
  )
}
