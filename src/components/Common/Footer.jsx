import { USE_MOCK } from '../../config/apiConfig'

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-3 py-3 text-xs text-ink-soft sm:px-5 lg:px-6">
        <p>
          Flood extent from Copernicus Sentinel-1 change detection. Buildings and roads ©
          OpenStreetMap contributors (ODbL). Figures are satellite estimates and should be confirmed
          on the ground before operational use.
        </p>
        {USE_MOCK && (
          <p className="mt-1">
            Running on bundled demo data: no backend is configured, so all figures and imagery are
            illustrative.
          </p>
        )}
      </div>
    </footer>
  )
}
