import { ArrowLeft, Copy, Download, FileText, SendHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCopilot } from '../../hooks/useCopilot'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import LanguageToggle from './LanguageToggle'
import MessageThread from './MessageThread'
import QuestionButtons from './QuestionButtons'

const PLACEHOLDER = {
  en: 'Ask about extent, infrastructure, cut-off settlements or priorities…',
  np: 'क्षेत्र, पूर्वाधार, सम्पर्कविहीन बस्ती वा प्राथमिकताबारे सोध्नुहोस्…',
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="btn no-print w-10 px-0" aria-label="Back to dashboard">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Situation-Report Copilot</h1>
          <p className="text-xs text-ink-soft">Answers for rescue teams, from the satellite analysis.</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <LanguageToggle language={copilot.language} onChange={copilot.setLanguage} />
          {started && (
            <button
              type="button"
              className={`btn ${confirmClear ? 'border-critical text-critical' : 'w-10 px-0'}`}
              onClick={() => {
                if (confirmClear) copilot.clear()
                setConfirmClear(!confirmClear)
              }}
              aria-label={confirmClear ? 'Confirm: clear conversation' : 'Clear conversation'}
            >
              <Trash2 size={16} aria-hidden />
              {confirmClear && 'Clear all?'}
            </button>
          )}
        </div>
      </div>

      <MessageThread conversation={copilot.conversation} loading={copilot.loading} />

      {/* Stays within reach at the bottom of the screen while the thread scrolls. */}
      <div className="no-print sticky bottom-0 -mx-3 flex flex-col gap-3 border-t border-line bg-surface-alt px-3 py-3 sm:-mx-5 sm:px-5">
        <QuestionButtons language={copilot.language} disabled={busy} compact={started} onAsk={copilot.ask} />

        <form className="flex gap-2" onSubmit={submit}>
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
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted"
          />
          <button
            type="submit"
            className="btn btn-primary min-h-[44px] w-12 px-0"
            disabled={busy || !input.trim()}
            aria-label="Send question"
          >
            <SendHorizontal size={18} />
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn flex-1 sm:flex-none"
            onClick={copilot.generateFullReport}
            disabled={busy}
          >
            <FileText size={16} aria-hidden /> Generate full report
          </button>
          <button type="button" className="btn" onClick={copilot.copy} disabled={!copilot.latestAnswer}>
            <Copy size={16} aria-hidden /> Copy
          </button>
          <button type="button" className="btn" onClick={copilot.download} disabled={!copilot.latestAnswer}>
            <Download size={16} aria-hidden /> Download
          </button>
        </div>
      </div>
    </div>
  )
}
