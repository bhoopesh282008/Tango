import { Check } from 'lucide-react'
import { USE_MOCK } from '../../config/apiConfig'
import { useDamageData } from '../../hooks/useDamageData'
import { useCopilotStore } from '../../store/copilotStore'
import { APP, EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import TangoIcon from '../Icons/TangoIcon'

// The checklist is the loading indicator: each line is ticked when its datasets
// have actually arrived (see DATA_PARTS in useDamageData).
const SOURCES = [
  { id: 'sentinel1', parts: ['satelliteData', 'floodZones'] },
  { id: 'layers', parts: ['buildings', 'roads'] },
  { id: 'settlements', parts: ['settlements', 'infrastructure'] },
]

const TEXT = {
  en: {
    subtitle: APP.subtitle,
    sentinel1: 'Sentinel-1 flood analysis',
    layers: 'Buildings and roads',
    settlements: 'Settlements and infrastructure',
    loading: 'Receiving data…',
    ready: 'System operational. Ready to begin.',
    failed: 'Could not load the flood data.',
    retry: 'Try again',
    start: 'Launch monitoring',
    imagery: 'Imagery',
    demo: 'Demo data',
    done: 'loaded',
    pending: 'loading',
  },
  np: {
    subtitle: 'बाढी प्रतिकार्य प्रणाली',
    sentinel1: 'Sentinel-1 बाढी विश्लेषण',
    layers: 'भवन र सडक',
    settlements: 'बस्ती र पूर्वाधार',
    loading: 'तथ्याङ्क प्राप्त हुँदैछ…',
    ready: 'प्रणाली सञ्चालनमा छ। सुरु गर्न तयार।',
    failed: 'बाढीको तथ्याङ्क लोड हुन सकेन।',
    retry: 'फेरि प्रयास गर्नुहोस्',
    start: 'अनुगमन सुरु गर्नुहोस्',
    imagery: 'तस्बिर',
    demo: 'नमुना तथ्याङ्क',
    done: 'लोड भयो',
    pending: 'लोड हुँदैछ',
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

  const t = TEXT[language] ?? TEXT.en
  const ready = data.loaded

  return (
    <div
      lang={language === 'np' ? 'ne' : 'en'}
      className="relative flex min-h-screen flex-col items-center justify-center bg-[#0f0f1e] px-6 py-16 text-white"
    >
      <div
        role="group"
        aria-label="Language"
        className="absolute right-4 top-4 flex rounded-md border border-[#2e2e48] p-0.5"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={language === option.id}
            className={`min-h-[40px] rounded px-3 text-xs font-semibold ${
              language === option.id ? 'bg-[#1a1a2e] text-white' : 'text-[#a0a0a0] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-sm flex-col">
        <TangoIcon size={48} animated={false} />
        <h1 className="mt-4 text-[56px] font-bold leading-none tracking-[1px] text-[#ff6b6b] sm:text-[64px]">
          {APP.name}
        </h1>
        <p className="mt-2 text-sm text-[#a0a0a0]">{t.subtitle}</p>

        <ul className="mt-10 flex flex-col gap-3">
          {SOURCES.map((source) => {
            const done = source.parts.every((part) => data.loadedParts[part])
            return (
              <li key={source.id} className="flex items-center gap-3 text-[13px] font-medium">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                  {done ? (
                    <Check size={16} strokeWidth={3} className="text-[#00cc66]" />
                  ) : (
                    <span className="splash-pulse h-1.5 w-1.5 rounded-full bg-[#707070]" />
                  )}
                </span>
                <span className={done ? 'text-white' : 'text-[#707070]'}>{t[source.id]}</span>
                <span className="sr-only">{done ? t.done : t.pending}</span>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 text-sm text-[#a0a0a0]" role="status">
          {error ? t.failed : ready ? t.ready : t.loading}
        </p>

        {/* Fixed height so nothing shifts when the button appears. */}
        <div className="mt-4 h-12">
          {ready && (
            <button
              type="button"
              autoFocus
              onClick={onReady}
              className="h-12 w-full rounded-lg bg-[#ff8800] px-8 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#ff9d2e] sm:w-auto"
            >
              {t.start}
            </button>
          )}
          {error && (
            <button
              type="button"
              onClick={reload}
              className="h-12 w-full rounded-lg border border-[#ff8800] px-8 text-sm font-semibold text-white sm:w-auto"
            >
              {t.retry}
            </button>
          )}
        </div>

        <p className="mt-12 font-mono text-[11px] leading-relaxed text-[#808080]">
          {t.imagery}: {formatDate(EVENT.afterDate)} · {EVENT.location}
          {USE_MOCK && <span className="text-[#ffcc00]"> · {t.demo}</span>}
        </p>
      </div>
    </div>
  )
}
