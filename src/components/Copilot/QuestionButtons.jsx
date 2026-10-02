import { Building2, MapPin, Siren, Unplug } from 'lucide-react'
import { QUESTIONS } from '../../utils/constants'

const ICONS = {
  'flood-extent': MapPin,
  infrastructure: Building2,
  'cut-off': Unplug,
  priority: Siren,
}

// Large tiles before the conversation starts, compact chips once it is under way.
export default function QuestionButtons({ language, disabled, compact, onAsk }) {
  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-3'}>
      {QUESTIONS.map((question) => {
        const Icon = ICONS[question.id]
        const label = question[language] ?? question.en
        if (compact) {
          return (
            <button
              key={question.id}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(question.id)}
              className="btn rounded-full text-xs"
            >
              <Icon size={14} className="text-primary" aria-hidden /> {label}
            </button>
          )
        }
        return (
          <button
            key={question.id}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(question.id)}
            className="card flex min-h-[72px] items-center gap-3 p-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 sm:p-4 sm:text-base"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon size={18} aria-hidden />
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
