import { Building2, MapPin, Siren, Unplug } from 'lucide-react'
import { motion } from 'motion/react'
import { liftOnHover } from '../Common/Animated'
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
      {QUESTIONS.map((question, index) => {
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
          <motion.button
            key={question.id}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(question.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            {...liftOnHover}
            transition={{ duration: 0.3, delay: 0.1 + index * 0.06, ease: 'easeOut' }}
            className="card flex min-h-[72px] items-center gap-3 p-3 text-left text-sm font-medium transition-shadow duration-200 hover:shadow-md disabled:opacity-50 sm:p-4 sm:text-base"
          >
            <span className="icon-chip h-10 w-10 rounded-lg bg-primary-soft text-primary">
              <Icon size={18} aria-hidden />
            </span>
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}
