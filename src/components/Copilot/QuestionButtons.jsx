import { ArrowUpRight, Building2, MapPin, Siren, Unplug } from 'lucide-react'
import { QUESTIONS } from '../../utils/constants'

const ICONS = {
  'flood-extent': MapPin,
  infrastructure: Building2,
  'cut-off': Unplug,
  priority: Siren,
}

// A list of the four questions before the conversation starts, compact buttons once it is under way.
export default function QuestionButtons({ language, disabled, compact, onAsk }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.map((question) => {
          const Icon = ICONS[question.id]
          return (
            <button
              key={question.id}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(question.id)}
              className="btn text-xs"
            >
              <Icon size={14} className="text-ink-soft" aria-hidden /> {question[language] ?? question.en}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="card grid grid-cols-1 divide-y divide-line overflow-hidden sm:grid-cols-2 sm:divide-y-0">
      {QUESTIONS.map((question, index) => {
        const Icon = ICONS[question.id]
        return (
          <button
            key={question.id}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(question.id)}
            // Hairlines between the four cells of the 2 x 2 grid
            className={`group flex min-h-[56px] items-center gap-3 px-4 text-left text-sm font-medium transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50 ${
              index % 2 === 0 ? 'sm:border-r sm:border-line' : ''
            } ${index < 2 ? 'sm:border-b sm:border-line' : ''}`}
          >
            <Icon size={16} className="shrink-0 text-ink-soft" aria-hidden />
            <span className="min-w-0 flex-1">{question[language] ?? question.en}</span>
            <ArrowUpRight
              size={15}
              className="shrink-0 text-ink-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
}
