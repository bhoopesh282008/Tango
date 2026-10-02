import { Check } from 'lucide-react'
import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useDamageData } from '../../hooks/useDamageData'
import { useCopilotStore } from '../../store/copilotStore'
import { APP, EVENT } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'

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

// Optional background footage. Drop the files into public/videos/ and they are used;
// without them the splash keeps its plain dark background.
const VIDEO = {
  webm: '/videos/tango-splash.webm',
  mp4: '/videos/tango-splash.mp4',
  poster: '/videos/splash-poster.jpg',
}

// Footage is skipped where it would cost the user: slow or metered connections,
// and for people who have asked for reduced motion.
function videoAllowed() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  const connection = navigator.connection
  if (connection?.saveData) return false
  return !['slow-2g', '2g', '3g'].includes(connection?.effectiveType)
}

function SplashBackground() {
  const [playing, setPlaying] = useState(false)
  const [allowed] = useState(videoAllowed)

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* The poster is a CSS background, so a missing file simply shows nothing. */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${VIDEO.poster})` }} />
      {allowed && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            playing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <source src={VIDEO.webm} type="video/webm" />
          <source src={VIDEO.mp4} type="video/mp4" />
        </video>
      )}
      {/* Darkens whatever is behind so the text keeps its contrast. */}
      <div className="absolute inset-0 bg-[rgba(15,15,30,0.62)]" />
    </div>
  )
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
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center bg-[#0f0f1e] px-5 py-16 text-center text-white"
    >
      <SplashBackground />

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

      <div className="flex w-full max-w-md flex-col items-center">
        <h1 className="text-5xl font-bold leading-none tracking-[2px] text-[#ff6b6b] [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] sm:text-[64px]">
          {APP.name}
        </h1>
        <p className="mt-3 text-base text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.7)] sm:text-lg">{t.subtitle}</p>
        <p className="mt-2 text-sm italic text-[#c0c0c0] [text-shadow:0_1px_5px_rgba(0,0,0,0.7)]">{t.tagline}</p>

        <ul className="mt-8 flex flex-col gap-2.5 rounded-lg border border-[rgba(255,107,107,0.2)] bg-[rgba(26,26,46,0.55)] px-6 py-4 text-left backdrop-blur-md">
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

        <p className="mt-6 text-sm text-[#d0d0d0] [text-shadow:0_1px_5px_rgba(0,0,0,0.7)]" role="status">
          {error ? t.failed : ready ? t.ready : t.loading}
        </p>

        {/* Fixed height so nothing shifts when the button appears. */}
        <div className="mt-4 h-12 w-full sm:w-auto">
          {ready && (
            <button
              type="button"
              autoFocus
              onClick={onReady}
              className="h-12 w-full rounded-lg bg-gradient-to-br from-[#ff6b6b] to-[#ff8800] px-10 text-[15px] font-bold text-[#1a1a1a] shadow-[0_8px_24px_rgba(255,107,107,0.4)] transition hover:-translate-y-0.5 sm:w-auto"
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

        <p className="mt-10 text-[11px] leading-relaxed text-[#b0b0b0] [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
          {t.imagery}: {formatDate(EVENT.afterDate)} · {EVENT.location}
          {USE_MOCK && <span className="font-semibold text-[#ffcc00]"> · {t.demo}</span>}
        </p>
      </div>
    </div>
  )
}
