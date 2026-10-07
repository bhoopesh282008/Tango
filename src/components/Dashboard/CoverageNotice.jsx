import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { formatPercent } from '../../utils/formatters'

const range = ([low, high]) =>
  formatPercent(low) === formatPercent(high) ? formatPercent(low) : `${formatPercent(low)} to ${formatPercent(high)}`

// The figures beside it are what the map found, not everything the flood did.
// With a reference check the notice carries that check's numbers; a run that
// was never checked says so. The demo dataset is already labelled as a demo.
// Plain text with a rule at its edge, not a coloured box: it has to be read, not noticed.
export default function CoverageNotice({ validation }) {
  if (USE_MOCK && !validation) return null
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
        )}{' '}
        An area with nothing marked is not known to be safe.{' '}
        <Link to="/about" className="underline">
          Method and limitations
        </Link>
      </p>
    </div>
  )
}
