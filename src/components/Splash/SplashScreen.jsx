import { Check } from 'lucide-react'
import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useDamageData } from '../../hooks/useDamageData'
import { useCopilotStore } from '../../store/copilotStore'
import { imageryDates } from '../../utils/calculations'
import { APP, EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import SpaceScene, { sceneAllowed } from './SpaceScene'

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
    tagline: '“When satellites and rescuers dance together”',
    sentinel1: 'Flood extent mapped',
    layers: 'Damage assessed',
    settlements: 'Rescue priorities ranked',
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
    tagline: '“जब भू-उपग्रह र उद्धारकर्ता सँगै ताल मिलाउँछन्”',
    sentinel1: 'बाढीको क्षेत्र नक्साङ्कन',
    layers: 'क्षतिको मूल्याङ्कन',
    settlements: 'उद्धार प्राथमिकता निर्धारण',
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
  // On a phone the text sits high to leave the Earth room below; with no 3D scene it is centred.
  const [scene] = useState(sceneAllowed)
  const ready = data.loaded
  const imageryDate = imageryDates(data.satelliteData).after

  return (
    <div
      lang={language === 'np' ? 'ne' : 'en'}
      className={`relative isolate flex min-h-[100dvh] flex-col items-center bg-[#0f0f1e] px-5 pb-16 text-center text-white sm:justify-center sm:pt-16 lg:items-start lg:pl-[6vw] lg:text-left ${
        scene ? 'justify-start pt-[20vh]' : 'justify-center pt-16'
      }`}
    >
      <SpaceScene />

      <div
        role="group"
        aria-label="Language"
        className="absolute right-4 top-4 flex rounded-md border border-white/15 bg-[rgba(26,26,46,0.7)] p-0.5 backdrop-blur"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={language === option.id}
            className={`min-h-[40px] rounded px-3 text-xs font-semibold ${
              language === option.id ? 'bg-[#ff6b6b] text-[#1a1a1a]' : 'text-[#c0c0c0] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-md flex-col items-center lg:max-w-sm lg:items-start xl:max-w-md">
        <h1 className="text-5xl font-bold leading-none tracking-tight text-[#ff6b6b] [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] sm:text-[64px] lg:text-7xl">
          {APP.name}
        </h1>
        <p className="mt-3 text-base font-medium text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.7)] sm:text-lg lg:text-xl">{t.subtitle}</p>
        <p className="mt-2 text-sm italic text-[#c0c0c0] [text-shadow:0_1px_5px_rgba(0,0,0,0.7)]">{t.tagline}</p>

        <ul className="mt-6 flex flex-col gap-2.5 rounded-xl border border-white/10 bg-[rgba(18,18,36,0.6)] px-6 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:mt-8">
          {SOURCES.map((source) => {
            const done = source.parts.every((part) => data.loadedParts[part])
            return (
              <li key={source.id} className="flex items-center gap-3 text-[13px] font-medium">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                  {done ? (
                    <Check size={16} strokeWidth={3} className="text-[#00cc66]" />
                  ) : (
                    <span className="splash-pulse h-1.5 w-1.5 rounded-full bg-[#a0a0a0]" />
                  )}
                </span>
                <span className={done ? 'text-white' : 'text-[#a0a0a0]'}>{t[source.id]}</span>
                <span className="sr-only">{done ? t.done : t.pending}</span>
              </li>
            )
          })}
        </ul>

        <p className="mt-5 text-sm text-[#d0d0d0] [text-shadow:0_1px_5px_rgba(0,0,0,0.7)] sm:mt-6" role="status">
          {error ? t.failed : ready ? t.ready : t.loading}
        </p>

        {/* Fixed height so nothing shifts when the button appears. */}
        <div className="mt-4 h-12 w-full sm:w-auto">
          {ready && (
            <button
              type="button"
              // Straight to the one button with a keyboard or mouse; not on a phone, where focus
              // alone can pull the page around.
              autoFocus={!!window.matchMedia?.('(pointer: fine)').matches}
              onClick={onReady}
              className="h-12 w-full rounded-md bg-[#ff6b6b] px-10 text-[15px] font-bold text-[#1a1a1a] shadow-[0_6px_18px_rgba(3,3,10,0.55)] transition duration-150 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] sm:w-auto"
            >
              {t.start}
            </button>
          )}
          {error && (
            <button
              type="button"
              onClick={reload}
              className="h-12 w-full rounded-lg border border-[#ff8800] bg-[rgba(26,26,46,0.7)] px-10 text-sm font-semibold text-white sm:w-auto"
            >
              {t.retry}
            </button>
          )}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-[#c4c8d4] [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.9)] sm:mt-10">
          {imageryDate ? `${t.imagery}: ${formatDate(imageryDate)} · ` : ''}
          {data.satelliteData.area?.name ?? data.run?.name ?? EVENT.location}
          {USE_MOCK && <span className="font-semibold text-[#ffcc00]"> · {t.demo}</span>}
          <span className="block" lang="en">
            Earth imagery, star map and satellite model: NASA
          </span>
        </p>
      </div>
    </div>
  )
}
