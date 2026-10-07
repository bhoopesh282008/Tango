import { lazy, Suspense } from 'react'
import { hasWebGL } from '../../utils/webgl'
import ErrorBoundary, { Failure } from '../Common/ErrorBoundary'
import Spinner from '../Common/Spinner'

// The map library is the largest dependency, so it loads after the figures are on screen.
const FloodMap = lazy(() => import('./FloodMap'))

const CARD_HEIGHT = 'h-[60vh] min-h-[360px] lg:h-[560px]'

// Stands in where the map should be. The figures, ranking and report do not depend on it.
function MapUnavailable({ reason, error, onRetry }) {
  return (
    <section className="card p-4" aria-labelledby="map-unavailable">
      <h2 id="map-unavailable" className="section-title">
        Flood damage map
      </h2>
      <Failure
        compact
        title="The map is not available"
        message={
          reason === 'webgl'
            ? 'The map needs WebGL, which this browser does not support or has turned off. Everything else on this page works without it.'
            : 'The map could not be drawn. The figures, rescue ranking and situation report on this page still work.'
        }
        error={error}
        onRetry={onRetry}
      />
    </section>
  )
}

// The map is the part most likely to fail on someone else's computer (WebGL, a blocked tile
// host, an old GPU driver), so it fails alone: the rest of the dashboard keeps working.
export default function MapBoundary(props) {
  if (!hasWebGL()) return <MapUnavailable reason="webgl" />
  return (
    <ErrorBoundary fallback={({ error, reset }) => <MapUnavailable reason="error" error={error} onRetry={reset} />}>
      <Suspense
        fallback={
          <div className={`card flex items-center justify-center ${CARD_HEIGHT}`}>
            <Spinner label="Loading map" />
          </div>
        }
      >
        <FloodMap {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
