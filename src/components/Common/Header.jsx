import { Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { USE_MOCK } from '../../config/apiConfig'
import { useUIStore } from '../../store/uiStore'
import { APP, EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import ExportPanel from '../Tools/ExportPanel'

export default function Header() {
  const darkMode = useUIStore((s) => s.darkMode)
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode)

  return (
    <header className="sticky top-0 z-[1100] border-b border-line bg-surface print:static">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5 lg:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-3xl leading-none" aria-hidden>
            {APP.logo}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight tracking-wide text-ink">
              {APP.name} <span className="font-normal tracking-normal text-ink-soft">· Trishuli Response</span>
            </span>
            <span className="block truncate text-xs text-ink-soft">
              {EVENT.location} · {formatDate(EVENT.beforeDate)} to {formatDate(EVENT.afterDate)}
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
          <span className="hidden text-xs text-ink-soft lg:inline">
            Imagery as of {formatDate(EVENT.afterDate)}
          </span>
          <ExportPanel />
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
