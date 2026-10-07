import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { BUILD } from '../../config/build'
import { ATTRIBUTION } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-3 py-3 text-xs text-ink-soft sm:px-5 lg:px-6">
        <p>
          Flood extent from Sentinel-1 change detection; buildings and roads from OpenStreetMap
          (ODbL). Figures are satellite estimates from an educational prototype and must be
          confirmed on the ground before any operational use.{' '}
          <Link to="/about" className="underline">
            Method and limitations
          </Link>
        </p>
        <p className="mt-1">{ATTRIBUTION.join(' ')}</p>
        {USE_MOCK && (
          <p className="mt-1">
            Running on bundled demo data: no backend is configured, so all figures and imagery are
            illustrative.
          </p>
        )}
        <p className="num mt-1 text-ink-muted" data-testid="build">
          <span translate="no">TANGO</span> {BUILD.version} · {BUILD.commit} · built {formatDate(BUILD.built)}
        </p>
      </div>
    </footer>
  )
}
