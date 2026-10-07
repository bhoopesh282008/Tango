import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { BUILD } from '../../config/build'
import { ATTRIBUTION } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[110rem] gap-x-12 gap-y-3 px-3 py-6 text-xs leading-relaxed text-ink-soft sm:px-5 lg:grid-cols-2">
        <p>
          Flood extent from Sentinel-1 change detection; buildings and roads from OpenStreetMap
          (ODbL). Figures are satellite estimates from an educational prototype and must be
          confirmed on the ground before any operational use.{' '}
          <Link to="/about" className="underline">
            Method and limitations
          </Link>
        </p>
        <p>{ATTRIBUTION.join(' ')}</p>
        {USE_MOCK && (
          <p className="lg:col-span-2">
            Running on bundled demo data: no backend is configured, so all figures and imagery are
            illustrative.
          </p>
        )}
        <p className="num text-ink-muted lg:col-span-2" data-testid="build">
          <span translate="no">TANGO</span> {BUILD.version} · {BUILD.commit} · built {formatDate(BUILD.built)}
        </p>
      </div>
    </footer>
  )
}
