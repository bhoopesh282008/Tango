import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { DATA_PARTS, useDamageData } from '../../hooks/useDamageData'
import { useCopilotStore } from '../../store/copilotStore'
import { APP, EVENT } from '../../utils/constants'
import TangoIcon from '../Icons/TangoIcon'
import { formatDate } from '../../utils/formatters'

// Each status light turns on when its datasets have actually arrived.
const SOURCES = [
  { id: 'sentinel1', parts: ['satelliteData', 'floodZones'] },
  { id: 'layers', parts: ['buildings', 'roads'] },
  { id: 'settlements', parts: ['settlements', 'infrastructure'] },
]

const TEXT = {
  en: {
    subtitle: APP.subtitle,
    tagline: '“When satellites and rescuers dance together”',
    loading: 'Loading satellite data…',
    ready: 'Data loaded',
    failed: 'Could not load the flood data.',
    retry: 'Try again',
    start: 'Start monitoring',
    sentinel1: 'Sentinel-1 analysis',
    layers: 'Buildings and roads',
    settlements: 'Settlements',
    asOf: (date) => `Imagery as of ${date}`,
    demo: 'Demo data',
  },
  np: {
    subtitle: 'बाढी प्रतिकार्य प्रणाली',
    tagline: '“जब भू-उपग्रह र उद्धारकर्ता सँगै ताल मिलाउँछन्”',
    loading: 'भू-उपग्रह तथ्याङ्क लोड हुँदैछ…',
    ready: 'तथ्याङ्क तयार छ',
    failed: 'बाढीको तथ्याङ्क लोड हुन सकेन।',
    retry: 'फेरि प्रयास गर्नुहोस्',
    start: 'अनुगमन सुरु गर्नुहोस्',
    sentinel1: 'Sentinel-1 विश्लेषण',
    layers: 'भवन र सडक',
    settlements: 'बस्तीहरू',
    asOf: (date) => `तस्बिर मिति: ${date}`,
    demo: 'नमुना तथ्याङ्क',
  },
}

const LANGUAGES = [
  { id: 'en', label: 'EN' },
  { id: 'np', label: 'नेपाली' },
]

export default function SplashScreen({ onReady }) {
  const { data, error, reload } = useDamageData()
  const language = useCopilotStore((s) => s.language)
  const setLanguage = useCopilotStore((s) => s.setLanguage)
  const [leaving, setLeaving] = useState(false)

  const t = TEXT[language] ?? TEXT.en
  const parts = Object.keys(DATA_PARTS)
  const loadedCount = parts.filter((part) => data.loadedParts[part]).length
  const progress = Math.round((loadedCount / parts.length) * 100)
  const ready = data.loaded

  const start = () => {
    // Fade out, then hand over to the dashboard.
    setLeaving(true)
    setTimeout(onReady, 250)
  }

  return (
    <div
      lang={language === 'np' ? 'ne' : 'en'}
      className={`flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-br from-[#0f0f1e] to-[#1a1a2e] px-5 py-6 sm:gap-8 text-center text-white transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        <TangoIcon size={88} />
        <h1 className="text-4xl font-bold tracking-[0.12em] text-[#ff6b6b] sm:text-5xl">{APP.name}</h1>
        <p className="text-sm text-[#c0c0c0]">{t.subtitle}</p>
      </div>

      <p className="max-w-xs text-sm italic leading-relaxed text-[#a0a0a0]">{t.tagline}</p>

      <div className="flex w-full max-w-xs flex-col items-center gap-2.5">
        <p className="text-[13px] text-[#c0c0c0]" role="status">
          {error ? t.failed : ready ? t.ready : t.loading}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full border border-[rgba(255,107,107,0.2)] bg-[#1a1a2e]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ff6b6b] to-[#ff8800] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs font-semibold text-[#ff8800]">{progress}%</p>
      </div>

      <ul className="flex flex-wrap justify-center gap-3">
        {SOURCES.map((source) => {
          const active = source.parts.every((part) => data.loadedParts[part])
          return (
            <li
              key={source.id}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-300 ${
                active
                  ? 'border-[rgba(0,204,102,0.3)] bg-[rgba(0,204,102,0.05)] text-[#00cc66]'
                  : 'border-[rgba(255,107,107,0.1)] bg-[rgba(26,26,46,0.6)] text-[#a0a0a0]'
              }`}
            >
              <span className={`text-[8px] ${active ? '' : 'splash-pulse'}`} aria-hidden>
                ●
              </span>
              {t[source.id]}
              <span className="sr-only">{active ? ': loaded' : ': loading'}</span>
            </li>
          )
        })}
      </ul>

      <div
        role="group"
        aria-label="Language"
        className="flex gap-1 rounded-md border border-[rgba(255,107,107,0.1)] bg-[rgba(26,26,46,0.8)] p-1"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={language === option.id}
            className={`min-h-[40px] rounded px-4 text-xs font-semibold transition-colors ${
              language === option.id ? 'bg-[#ff6b6b] text-[#1a1a1a]' : 'text-[#c0c0c0] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Fixed height so the layout does not jump when the button appears. */}
      <div className="flex h-12 items-center">
        {ready && (
          <button
            type="button"
            autoFocus
            onClick={start}
            className="min-h-[48px] rounded-lg bg-gradient-to-br from-[#ff6b6b] to-[#ff8800] px-8 text-sm font-bold text-[#1a1a1a] shadow-[0_4px_16px_rgba(255,107,107,0.3)] transition hover:-translate-y-0.5"
          >
            {t.start}
          </button>
        )}
        {error && (
          <button
            type="button"
            onClick={reload}
            className="min-h-[48px] rounded-lg border border-[#ff6b6b] px-8 text-sm font-semibold text-white"
          >
            {t.retry}
          </button>
        )}
      </div>

      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#a0a0a0]">
        <span>{t.asOf(formatDate(EVENT.afterDate))}</span>
        {USE_MOCK && <span className="rounded bg-[rgba(255,204,0,0.15)] px-2 py-0.5 font-semibold text-[#ffcc00]">{t.demo}</span>}
      </p>
    </div>
  )
}
