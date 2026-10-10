import { Moon, Sun } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { CAN_SWITCH_SOURCE, DATA_SOURCE, USE_MOCK } from '../../config/apiConfig'
import { setDataSource } from '../../config/dataSource'
import { openRun } from '../../config/run'
import { useDataStore } from '../../store/dataStore'
import { useUIStore } from '../../store/uiStore'
import { imageryDates } from '../../utils/calculations'
import { EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import TangoIcon from '../Icons/TangoIcon'
import ExportPanel from '../Tools/ExportPanel'

const PAGES = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/copilot', label: 'Copilot' },
  { to: '/report', label: 'Report' },
  { to: '/about', label: 'Method' },
]

const navClass = ({ isActive }) =>
  `flex h-full items-center border-b-2 px-3 text-sm font-medium transition-colors ${
    isActive ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
  }`

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
      <div className="mx-auto flex max-w-[110rem] flex-wrap items-stretch gap-x-3 px-3 sm:px-5 lg:h-[3.25rem] lg:flex-nowrap lg:px-5">
        <Link to="/" className="flex shrink-0 items-center gap-2 py-2.5" aria-label="TANGO, dashboard">
          <TangoIcon size={26} animated={false} />
          <span translate="no" className="text-[15px] font-bold uppercase tracking-[0.14em] text-ink">
            Tango
          </span>
        </Link>

        <div className="my-2.5 w-px shrink-0 bg-[var(--border-strong)]" aria-hidden />

        {/* The area is the title of the page; with several to choose from it is a selector */}
        <div className="flex min-w-0 flex-1 flex-col justify-center py-1.5 lg:flex-none lg:basis-72">
          {runs.length > 1 ? (
            <>
              <label htmlFor="area" className="sr-only">
                Area
              </label>
              <select
                id="area"
                className="area-select -ml-1 max-w-full self-start truncate text-sm font-semibold leading-tight"
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
          ) : (
            <span className="truncate text-sm font-semibold leading-tight">{areaName}</span>
          )}
          <span className="num truncate text-xs leading-tight text-ink-soft">
            {before && after ? `${formatDate(before)} to ${formatDate(after)}` : 'Flood damage from satellite radar'}
          </span>
        </div>

        {USE_MOCK && (
          <span
            className="my-auto shrink-0 border border-warning px-1.5 py-0.5 text-xs font-semibold text-warning"
            title={CAN_SWITCH_SOURCE ? 'You chose the demo data. Figures are illustrative.' : 'No backend configured. Figures are illustrative.'}
          >
            Demo data
          </span>
        )}

        <nav aria-label="Pages" className="no-print order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto border-t border-line px-2 sm:-mx-5 sm:w-[calc(100%+2.5rem)] sm:px-4 lg:order-none lg:mx-0 lg:ml-4 lg:w-auto lg:overflow-visible lg:border-0 lg:px-0">
          {PAGES.map((page) => (
            <NavLink key={page.to} to={page.to} end={page.end} className={navClass}>
              <span className="whitespace-nowrap py-2.5 lg:py-0">{page.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="no-print ml-auto flex items-center gap-1 py-1.5">
          {/* Only where this build has run data to show: the demo dataset is always there */}
          {CAN_SWITCH_SOURCE && (
            <div role="group" aria-label="Data source" className="mr-1 flex">
              {[
                ['real', 'Run data', 'The satellite analysis of the published areas'],
                ['demo', 'Demo', 'The bundled demo dataset, with illustrative figures'],
              ].map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  className="btn-quiet px-2.5 text-[13px]"
                  aria-pressed={DATA_SOURCE === id}
                  title={hint}
                  onClick={() => DATA_SOURCE !== id && setDataSource(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <ExportPanel />
          <button
            type="button"
            className="btn-quiet w-10 px-0"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
    </header>
  )
}
