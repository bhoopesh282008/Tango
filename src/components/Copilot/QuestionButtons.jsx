import { ArrowUpRight, FileText } from 'lucide-react'
import { QUESTIONS } from '../../utils/constants'

// A button that has focus and then becomes `disabled` drops keyboard focus to the page, so
// while an answer is being prepared these stay focusable and simply ignore presses.
const paused = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

export const REPORT_LABEL = { en: 'Full situation report', np: 'पूर्ण स्थिति प्रतिवेदन' }
const REPORT_SHORT = { en: 'Full report', np: 'पूर्ण प्रतिवेदन' }

// Before the conversation starts: the questions as a plain list, each with the figure it will
// answer from, so the page already says something. Once it is under way: compact buttons.
// `hints` maps a question id to a short figure or name taken from the loaded data.
export default function QuestionButtons({ language, disabled, compact, onAsk, onReport, hints = {} }) {
  const ask = (id) => {
    if (!disabled) onAsk(id)
  }
  const report = () => {
    if (!disabled) onReport()
  }

  if (compact) {
    return (
      // One row that scrolls sideways on a narrow screen, so the thread keeps the height
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        {QUESTIONS.map((question) => (
          <button
            key={question.id}
            type="button"
            aria-disabled={disabled}
            onClick={() => ask(question.id)}
            className={`btn min-h-[36px] px-2.5 text-[13px] ${paused}`}
          >
            {question[language] ?? question.en}
          </button>
        ))}
        <button type="button" aria-disabled={disabled} onClick={report} className={`btn min-h-[36px] px-2.5 text-[13px] ${paused}`}>
          <FileText size={14} aria-hidden /> {REPORT_SHORT[language] ?? REPORT_SHORT.en}
        </button>
      </div>
    )
  }

  const row =
    'group flex min-h-[64px] w-full items-center gap-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] sm:px-3 sm:-mx-3 sm:w-[calc(100%+1.5rem)] ' +
    paused
  return (
    <ul className="mt-10 divide-y divide-line border-y border-line">
      {QUESTIONS.map((question) => (
        <li key={question.id}>
          <button type="button" aria-disabled={disabled} onClick={() => ask(question.id)} className={row}>
            <span className="min-w-0 flex-1 text-[17px] font-medium leading-snug">{question[language] ?? question.en}</span>
            {hints[question.id] && <span className="num shrink-0 text-sm text-ink-soft">{hints[question.id]}</span>}
            <ArrowUpRight
              size={16}
              className="shrink-0 text-ink-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        </li>
      ))}
      <li>
        <button type="button" aria-disabled={disabled} onClick={report} className={row}>
          <span className="min-w-0 flex-1 text-[17px] font-medium leading-snug">{REPORT_LABEL[language] ?? REPORT_LABEL.en}</span>
          <span className="shrink-0 text-sm text-ink-soft">all four topics</span>
          <FileText size={16} className="shrink-0 text-ink-muted" aria-hidden />
        </button>
      </li>
    </ul>
  )
}
