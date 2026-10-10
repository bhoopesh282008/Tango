import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { MAP_DEFAULTS } from '../../config/mapConfig'
import { useDamageData } from '../../hooks/useDamageData'
import { useCopilotStore } from '../../store/copilotStore'
import { imageryDates } from '../../utils/calculations'
import { APP, EVENT } from '../../utils/constants'
import { formatDate, formatNumber } from '../../utils/formatters'
import SpaceScene from './SpaceScene'
import './splash.css'

// The ledger is the loading indicator: each line comes up when its files have actually
// arrived (see DATA_PARTS in useDamageData), and shows what was loaded. Counts are of inputs
// (buildings mapped, settlements listed), never of findings: those belong on the dashboard,
// next to the note that says they are a lower bound.
const SOURCES = [
  { id: 'sentinel1', parts: ['satelliteData', 'floodZones'] },
  { id: 'layers', parts: ['buildings', 'roads'] },
  { id: 'settlements', parts: ['settlements', 'infrastructure'] },
]
const PART_COUNT = SOURCES.reduce((total, source) => total + source.parts.length, 0)

const TEXT = {
  en: {
    subtitle: APP.subtitle,
    tagline: '“When satellites and rescuers dance together”',
    sentinel1: 'Radar images compared',
    layers: 'Buildings and roads mapped',
    settlements: 'Villages checked for road access',
    buildings: 'buildings',
    settlementsUnit: 'settlements',
    loading: 'Receiving data…',
    ready: 'System operational. Ready to begin.',
    failed: 'Could not load the flood data.',
    retry: 'Try again',
    start: 'Launch monitoring',
    demo: 'Demo data',
    done: 'loaded',
    pending: 'loading',
  },
  np: {
    subtitle: 'बाढी प्रतिकार्य प्रणाली',
    tagline: '“जब भू-उपग्रह र उद्धारकर्ता सँगै ताल मिलाउँछन्”',
    sentinel1: 'राडार तस्बिरहरूको तुलना',
    layers: 'भवन र सडक नक्साङ्कन',
    settlements: 'बस्तीहरूमा सडक पहुँचको जाँच',
    buildings: 'भवन',
    settlementsUnit: 'बस्ती',
    loading: 'तथ्याङ्क प्राप्त हुँदैछ…',
    ready: 'प्रणाली सञ्चालनमा छ। सुरु गर्न तयार।',
    failed: 'बाढीको तथ्याङ्क लोड हुन सकेन।',
    retry: 'फेरि प्रयास गर्नुहोस्',
    start: 'अनुगमन सुरु गर्नुहोस्',
    demo: 'नमुना तथ्याङ्क',
    done: 'लोड भयो',
    pending: 'लोड हुँदैछ',
  },
}

const LANGUAGES = [
  { id: 'en', label: 'EN' },
  { id: 'np', label: 'नेपाली' },
]

// Where the run is, for the mark on the Earth: the middle of its area, and the radar track.
function targetOf(data) {
  const area = data.satelliteData.area
  const [west, south, east, north] = area?.bbox ?? []
  const known = area?.bbox && [west, south, east, north].every(Number.isFinite)
  const after = data.satelliteData.after
  return {
    latitude: known ? (south + north) / 2 : MAP_DEFAULTS.center.lat,
    longitude: known ? (west + east) / 2 : MAP_DEFAULTS.center.lng,
    name: area?.name ?? data.run?.name ?? EVENT.location,
    track: after?.relative_orbit != null ? { orbit: after.relative_orbit, state: after.orbit_state ?? '' } : null,
  }
}

export default function SplashScreen({ onReady }) {
  const { data, stats, error, reload } = useDamageData()
  const language = useCopilotStore((s) => s.language)
  const setLanguage = useCopilotStore((s) => s.setLanguage)
  const startButton = useRef(null)

  const t = TEXT[language] ?? TEXT.en
  const ready = data.loaded
  const progress = ready ? 1 : Object.keys(data.loadedParts).length / PART_COUNT
  const { before, after } = imageryDates(data.satelliteData)

  // Straight to the button with a keyboard or mouse; not on a phone, where moving focus
  // alone can pull the page around.
  useEffect(() => {
    if (ready && window.matchMedia?.('(pointer: fine)').matches) startButton.current?.focus()
  }, [ready])

  // What each ledger line says once its files are in
  const detail = {
    sentinel1: before && after ? `${formatDate(before)} to ${formatDate(after)}` : '',
    layers: stats ? `${formatNumber(stats.totalStructures)} ${t.buildings}` : '',
    settlements: stats ? `${formatNumber(stats.settlementRows.length)} ${t.settlementsUnit}` : '',
  }

  return (
    <div
      lang={language === 'np' ? 'ne' : 'en'}
      className="splash relative isolate flex min-h-[100dvh] flex-col px-6 pb-16 pt-20 sm:px-10 lg:justify-center lg:pl-[6vw] lg:pt-16"
    >
      <SpaceScene target={targetOf(data)} settled={ready} />

      <div role="group" aria-label="Language" className="absolute right-4 top-3 flex sm:right-6">
        {LANGUAGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={language === option.id}
            className={`min-h-[44px] px-3 text-[13px] font-semibold underline-offset-[6px] transition-colors ${
              language === option.id
                ? 'text-[#f2f1ed] underline decoration-[#f2f1ed] decoration-2'
                : 'text-[#a9aba8] hover:text-[#f2f1ed]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <main className="w-full max-w-[26rem]">
        <p className="splash-in text-[13px] font-medium uppercase tracking-[0.16em] text-[#a9aba8]" style={{ '--i': 0 }}>
          {t.subtitle}
          {USE_MOCK && <span className="text-[#ffcc00]"> · {t.demo}</span>}
        </p>
        <h1
          className="splash-in mt-3 text-[clamp(4.5rem,11vw,9.5rem)] font-extrabold leading-[0.88] tracking-[-0.045em] text-[#f2f1ed]"
          style={{ '--i': 1 }}
        >
          {APP.name}
        </h1>
        <p className="splash-in mt-5 max-w-[22rem] text-lg leading-snug text-[#f2f1ed]/85" style={{ '--i': 2 }}>
          {t.tagline}
        </p>

        <ul className="splash-in mt-9 border-t border-[var(--line)]" style={{ '--i': 3 }}>
          {SOURCES.map((source) => {
            const done = source.parts.every((part) => data.loadedParts[part])
            return (
              <li
                key={source.id}
                className={`splash-row grid grid-cols-[1fr_auto_1.1rem] items-center gap-3 border-b border-[var(--line)] py-2.5 text-[13px] ${
                  done ? 'opacity-100' : 'opacity-45'
                }`}
              >
                <span className="font-medium">{t[source.id]}</span>
                <span className="num text-[#a9aba8]">{done ? detail[source.id] : ''}</span>
                <span className="flex justify-end" aria-hidden>
                  {done && <Check size={14} strokeWidth={2.5} />}
                </span>
                <span className="sr-only">{done ? t.done : t.pending}</span>
              </li>
            )
          })}
        </ul>

        {/* Announced to screen readers; the button says the same to everyone else */}
        <p className="sr-only" role="status">
          {error ? t.failed : ready ? t.ready : t.loading}
        </p>

        <div className="splash-in mt-8" style={{ '--i': 4 }}>
          {error ? (
            <>
              <p className="mb-3 text-sm text-[#f2f1ed]">{t.failed}</p>
              <button
                type="button"
                onClick={reload}
                className="h-12 min-w-[15rem] rounded-[4px] border border-[#f2f1ed] px-7 text-[15px] font-semibold text-[#f2f1ed] transition-colors hover:bg-[#f2f1ed]/10"
              >
                {t.retry}
              </button>
            </>
          ) : (
            <button
              ref={startButton}
              type="button"
              disabled={!ready}
              onClick={onReady}
              className={`splash-cta h-12 min-w-[15rem] rounded-[4px] border px-7 text-[15px] font-semibold ${
                ready
                  ? 'border-[#f2f1ed] bg-[#f2f1ed] text-[#0b0c0d] hover:bg-white active:scale-[0.98]'
                  : 'border-[var(--line)] text-[#f2f1ed]'
              }`}
            >
              {!ready && <span className="splash-cta__fill" style={{ width: `${Math.max(progress, 0.04) * 100}%` }} />}
              {ready ? t.start : t.loading}
            </button>
          )}
        </div>
      </main>

      <p className="absolute bottom-4 left-6 text-[11px] leading-relaxed text-[#a9aba8] sm:left-10 lg:left-[6vw]" lang="en">
        Earth: NASA Blue Marble. Star map and satellite model: NASA.
      </p>
    </div>
  )
}
