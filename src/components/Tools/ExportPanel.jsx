import { ChevronDown, Download, FileText, Map, Table } from 'lucide-react'
import { useState } from 'react'
import {
  combinedGeoJson,
  downloadBlob,
  settlementsCsv,
  statisticsCsv,
} from '../../services/exportService'
import { useDamageData } from '../../hooks/useDamageData'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../Common/Spinner'

export default function ExportPanel() {
  const { data, stats } = useDamageData()
  const addToast = useUIStore((s) => s.addToast)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const options = [
    {
      id: 'pdf',
      label: 'PDF report',
      hint: 'Opens the print dialog; choose "Save as PDF"',
      icon: FileText,
      run: () => window.print(),
      silent: true,
    },
    {
      id: 'settlements',
      label: 'Settlements (CSV)',
      hint: 'Population, road access, structures',
      icon: Table,
      run: () => downloadBlob(settlementsCsv(stats), 'trishuli-settlements.csv', 'text/csv;charset=utf-8'),
    },
    {
      id: 'statistics',
      label: 'Damage statistics (CSV)',
      hint: 'Headline metrics',
      icon: Table,
      run: () => downloadBlob(statisticsCsv(stats), 'trishuli-statistics.csv', 'text/csv;charset=utf-8'),
    },
    {
      id: 'geojson',
      label: 'Map layers (GeoJSON)',
      hint: 'Flood zones, roads, buildings, points',
      icon: Map,
      run: () => downloadBlob(combinedGeoJson(data), 'trishuli-flood.geojson', 'application/geo+json'),
    },
  ]

  const handle = async (option) => {
    setOpen(false)
    setBusy(true)
    // Let the menu close and the spinner paint before the export work starts.
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      option.run()
      if (!option.silent) addToast('Report exported successfully!')
    } catch (error) {
      addToast(error.message || 'Export failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="btn"
        disabled={!stats || busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Spinner size={16} /> : <Download size={16} aria-hidden />}
        <span className="sr-only sm:not-sr-only">Export</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} aria-hidden />
          <ul role="menu" className="card absolute right-0 top-full mt-1 w-72 overflow-hidden p-1 shadow-lg">
            {options.map((option) => (
              <li key={option.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handle(option)}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-alt"
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
        </>
      )}
    </div>
  )
}
