import { SendHorizontal, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useCopilot } from '../../hooks/useCopilot'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import { formatDate, formatNumber } from '../../utils/formatters'
import LanguageToggle from './LanguageToggle'
import MessageThread from './MessageThread'
import QuestionButtons from './QuestionButtons'

const PLACEHOLDER = {
  en: 'Ask about extent, infrastructure, cut-off settlements or priorities…',
  np: 'क्षेत्र, पूर्वाधार, सम्पर्कविहीन बस्ती वा प्राथमिकताबारे सोध्नुहोस्…',
}

// What the copilot is reading, in one line: the area and the radar images behind the figures.
function sourceLine(stats) {
  if (!stats) return 'Reading the satellite analysis…'
  const { before, after } = stats.imagery ?? {}
  const images = before && after ? `radar images of ${formatDate(before)} and ${formatDate(after)}` : null
  return ['Reading', [stats.areaName, images].filter(Boolean).join(', ')].filter(Boolean).join(' ')
}

// One figure from the data beside each starting question, so the page says something before anything is asked.
function hintsFrom(stats) {
  if (!stats) return {}
  return {
    'flood-extent': `${formatNumber(stats.floodedAreaKm2, 1)} km²`,
    infrastructure: `${formatNumber(stats.damagedStructures)} structures`,
    'cut-off': `${formatNumber(stats.cutOff.length)} of ${formatNumber(stats.settlementRows.length)}`,
    priority: stats.priority[0]?.name ? `${stats.priority[0].name} first` : undefined,
  }
}

export default function CopilotDashboard() {
  const { stats, error, reload } = useDamageData()
  const copilot = useCopilot(stats)
  const [input, setInput] = useState('')
  // Clearing throws the whole conversation away, so the first press asks and the second does it.
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!confirmClear) return undefined
    const timer = setTimeout(() => setConfirmClear(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  if (error) {
    return <ErrorPage title="Could not load flood data" message={error} onRetry={reload} />
  }

  const started = copilot.conversation.length > 0
  const busy = !stats || copilot.loading

  const submit = (event) => {
    event.preventDefault()
    if (busy) return
    copilot.askText(input)
    setInput('')
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-3xl flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold leading-tight">Situation-Report Copilot</h1>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{sourceLine(stats)}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          {started && (
            <button
              type="button"
              className={`btn-quiet ${confirmClear ? 'text-critical' : ''}`}
              onClick={() => {
                if (confirmClear) copilot.clear()
                setConfirmClear(!confirmClear)
              }}
              aria-label={confirmClear ? 'Confirm: clear conversation' : 'Clear conversation'}
            >
              <Trash2 size={15} aria-hidden />
              {confirmClear ? 'Clear all?' : 'Clear'}
            </button>
          )}
          <LanguageToggle language={copilot.language} onChange={copilot.setLanguage} />
        </div>
      </div>

      <div className="flex-1">
        {started ? (
          <MessageThread
            conversation={copilot.conversation}
            loading={copilot.loading}
            onCopy={copilot.copy}
            onDownload={copilot.download}
          />
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="pt-12 sm:pt-16"
          >
            <h2 className="max-w-[16ch] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">What would you like to know?</h2>
            <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
              Answers are filled in from the figures on the dashboard, using fixed templates, in English or Nepali. This is not a
              language model, so it only answers the topics below.
            </p>
            <QuestionButtons
              language={copilot.language}
              disabled={busy}
              hints={hintsFrom(stats)}
              onAsk={copilot.ask}
              onReport={copilot.generateFullReport}
            />
          </motion.section>
        )}
      </div>

      {/* Stays within reach at the bottom of the screen while the thread scrolls. */}
      <div className={`no-print sticky bottom-0 z-10 -mx-3 mt-6 flex flex-col gap-3 bg-surface px-3 pb-4 pt-3 sm:-mx-5 sm:px-5 ${started ? 'border-t border-line' : ''}`}>
        {started && (
          <QuestionButtons
            language={copilot.language}
            disabled={busy}
            compact
            onAsk={copilot.ask}
            onReport={copilot.generateFullReport}
          />
        )}

        <form
          className="flex items-center gap-1 rounded-[6px] border border-[var(--border-strong)] bg-surface pl-4 pr-1.5 transition-colors focus-within:border-ink focus-within:ring-1 focus-within:ring-[var(--text-primary)]"
          onSubmit={submit}
        >
          <label htmlFor="copilot-input" className="sr-only">
            Your question
          </label>
          <input
            id="copilot-input"
            name="question"
            type="text"
            enterKeyHint="send"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={PLACEHOLDER[copilot.language] ?? PLACEHOLDER.en}
            autoComplete="off"
            className="min-h-[52px] min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            className="btn btn-primary w-10 px-0"
            disabled={busy || !input.trim()}
            aria-label="Send question"
          >
            <SendHorizontal size={17} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  )
}
