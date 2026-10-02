import { Building2, MapPin, Siren, Unplug } from 'lucide-react'
import { QUESTIONS } from '../../utils/constants'

const ICONS = {
  'flood-extent': MapPin,
  infrastructure: Building2,
  'cut-off': Unplug,
  priority: Siren,
}

export default function QuestionButtons({ language, activeId, disabled, onAsk }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {QUESTIONS.map((question) => {
        const Icon = ICONS[question.id]
        return (
          <button
            key={question.id}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(question.id)}
            aria-pressed={activeId === question.id}
            className={`card flex min-h-[72px] items-center gap-3 p-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 sm:p-4 sm:text-base ${
              activeId === question.id ? 'ring-2 ring-primary' : ''
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon size={18} aria-hidden />
            </span>
            {question[language] ?? question.en}
          </button>
        )
      })}
    </div>
  )
}
