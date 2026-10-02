import { ArrowLeft, Copy, Download, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCopilot } from '../../hooks/useCopilot'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import LanguageToggle from './LanguageToggle'
import QuestionButtons from './QuestionButtons'
import ResponseArea from './ResponseArea'

export default function CopilotDashboard() {
  const { stats, error, reload } = useDamageData()
  const copilot = useCopilot(stats)

  if (error) {
    return <ErrorPage title="Could not load flood data" message={error} onRetry={reload} />
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="btn no-print w-10 px-0" aria-label="Back to dashboard">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="mr-auto text-lg font-semibold">Situation-Report Copilot</h1>
        <div className="no-print">
          <LanguageToggle language={copilot.language} onChange={copilot.setLanguage} />
        </div>
      </div>

      <div className="no-print">
        <QuestionButtons
          language={copilot.language}
          activeId={copilot.response?.kind}
          disabled={!stats}
          onAsk={copilot.ask}
        />
      </div>

      <ResponseArea response={copilot.response} loading={copilot.loading || !stats} />

      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1 sm:flex-none"
          onClick={copilot.generateFullReport}
          disabled={!stats || copilot.loading}
        >
          <FileText size={16} aria-hidden /> Generate full report
        </button>
        <button type="button" className="btn" onClick={copilot.copy} disabled={!copilot.response}>
          <Copy size={16} aria-hidden /> Copy
        </button>
        <button type="button" className="btn" onClick={copilot.download} disabled={!copilot.response}>
          <Download size={16} aria-hidden /> Download
        </button>
      </div>
    </div>
  )
}
