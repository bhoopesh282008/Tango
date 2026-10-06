import { ChevronDown, Download, FileText, Map, Table } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  combinedGeoJson,
  downloadBlob,
  settlementsCsv,
  statisticsCsv,
} from '../../services/exportService'
import { filePrefix } from '../../config/run'
import { useDamageData } from '../../hooks/useDamageData'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../Common/Spinner'

export default function ExportPanel() {
  const { data, stats } = useDamageData()
  const addToast = useUIStore((s) => s.addToast)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const trigger = useRef(null)
  const menu = useRef(null)

  const options = [
    {
      id: 'pdf',
      label: 'Situation report (one page)',
      hint: 'English or Nepali; print it or save it as PDF',
      icon: FileText,
      run: () => navigate('/report'),
    },
    {
      id: 'settlements',
      label: 'Settlements (CSV)',
      hint: 'Population, road access, structures',
      icon: Table,
      run: () => downloadBlob(settlementsCsv(stats), `${filePrefix()}-settlements.csv`, 'text/csv;charset=utf-8'),
      done: 'Settlements CSV downloaded',
    },
    {
      id: 'statistics',
      label: 'Damage statistics (CSV)',
      hint: 'Headline metrics',
      icon: Table,
      run: () => downloadBlob(statisticsCsv(stats), `${filePrefix()}-statistics.csv`, 'text/csv;charset=utf-8'),
      done: 'Statistics CSV downloaded',
    },
    {
      id: 'geojson',
      label: 'Map layers (GeoJSON)',
      hint: 'Flood zones, roads, buildings, points',
      icon: Map,
      run: () => downloadBlob(combinedGeoJson(data), `${filePrefix()}-flood.geojson`, 'application/geo+json'),
      done: 'Map layers downloaded as GeoJSON',
    },
  ]

  // An open menu behaves like one: focus goes into it, the arrow keys move through it,
  // Escape closes it and gives focus back, and so does a press anywhere outside it.
  useEffect(() => {
    if (!open) return undefined
    const items = () => [...menu.current.querySelectorAll('[role="menuitem"]')]
    items()[0]?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const list = items()
        const at = list.indexOf(document.activeElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        list[(at + step + list.length) % list.length].focus()
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const list = items()
        list[event.key === 'Home' ? 0 : list.length - 1].focus()
      } else if (event.key === 'Tab') {
        setOpen(false)
      }
    }
    const onPointerDown = (event) => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const handle = async (option) => {
    setOpen(false)
    // The menu item that was pressed is about to unmount; keep keyboard focus on the button.
    if (option.done) trigger.current?.focus()
    setBusy(true)
    // Let the menu close and the spinner paint before the export work starts.
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      option.run()
      if (option.done) addToast(option.done)
    } catch (error) {
      addToast(error.message || 'Export failed. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        className="btn"
        disabled={!stats}
        aria-busy={busy}
        onClick={() => !busy && setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Spinner size={16} /> : <Download size={16} aria-hidden />}
        <span className="sr-only sm:not-sr-only">Export</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <ul
          ref={menu}
          role="menu"
          aria-label="Export"
          className="card absolute right-0 top-full mt-1 w-72 overflow-hidden p-1 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => handle(option)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-alt focus-visible:-outline-offset-2"
              >
                <option.icon size={18} className="shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="block text-xs text-ink-soft">{option.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
