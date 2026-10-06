import { Info, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { openRun } from '../../config/run'
import { useDataStore } from '../../store/dataStore'
import { useUIStore } from '../../store/uiStore'
import { imageryDates } from '../../utils/calculations'
import { APP, EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import TangoIcon from '../Icons/TangoIcon'
import ExportPanel from '../Tools/ExportPanel'

export default function Header() {
  const darkMode = useUIStore((s) => s.darkMode)
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode)
  const satelliteData = useDataStore((s) => s.satelliteData)
  const runs = useDataStore((s) => s.runs)
  const run = useDataStore((s) => s.run)
  const { before, after } = imageryDates(satelliteData)
  const areaName = satelliteData.area?.name ?? run?.name ?? EVENT.location

  return (
    <header className="app-header sticky top-0 z-[1100] border-b border-line print:static">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5 lg:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <TangoIcon size={32} />
          </span>
          <span className="min-w-0">
            <span translate="no" className="block truncate text-[15px] font-semibold leading-tight tracking-tight text-brand sm:text-base">
              {APP.name} {APP.subtitle}
            </span>
            <span className="block truncate text-xs text-ink-soft">
              {areaName}
              {before && after && ` · ${formatDate(before)} to ${formatDate(after)}`}
            </span>
          </span>
        </Link>

        {USE_MOCK && (
          <span
            className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-ink"
            title="No backend configured. Figures are illustrative."
          >
            Demo data
          </span>
        )}

        <div className="no-print ml-auto flex items-center gap-2">
          {after && (
            <span className="hidden text-xs text-ink-soft lg:inline">Imagery as of {formatDate(after)}</span>
          )}
          {runs.length > 1 && (
            <>
              <label htmlFor="area" className="sr-only">
                Area
              </label>
              <select
                id="area"
                className="btn max-w-[11rem] pr-2 sm:max-w-[16rem]"
                value={run?.id ?? ''}
                onChange={(e) => openRun(e.target.value)}
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <ExportPanel />
          <Link to="/about" className="btn w-10 px-0" aria-label="Method and limitations" title="Method and limitations">
            <Info size={18} />
          </Link>
          <button
            type="button"
            className="btn w-10 px-0"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  )
}
