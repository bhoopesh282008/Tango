import { Bot, User } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { formatPercent } from '../../utils/formatters'
import { TypingDots } from '../Common/Animated'
import AnswerBody from './AnswerBody'

function Avatar({ icon: Icon, className }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
      <Icon size={16} aria-hidden />
    </span>
  )
}

// A message easing in as it joins the thread
const arrive = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
}

function UserMessage({ text }) {
  return (
    <motion.li {...arrive} className="flex justify-end gap-2">
      <p className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-white sm:max-w-[70%]">
        {text}
      </p>
      <Avatar icon={User} className="bg-surface-alt text-ink-soft" />
    </motion.li>
  )
}

function AssistantMessage({ response }) {
  const lang = response.language === 'np' ? 'ne' : 'en'
  return (
    <motion.li {...arrive} className="flex gap-2">
      <Avatar icon={Bot} className="bg-primary-soft text-primary" />
      {response.notice ? (
        <p lang={lang} className="card max-w-[85%] rounded-tl-sm px-4 py-2.5 text-sm text-ink-soft sm:max-w-[70%]">
          {response.notice}
        </p>
      ) : (
        <article lang={lang} className="card min-w-0 max-w-[92%] rounded-tl-sm sm:max-w-[85%]">
          {response.title && (
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{response.title}</h2>
          )}
          <AnswerBody text={response.answer} />
          <footer className="border-t border-line px-4 py-2 text-xs text-ink-soft" lang="en">
            Source: {response.dataSource}
            {response.confidence != null && ` · Model confidence ${formatPercent(response.confidence)}`}
          </footer>
        </article>
      )}
    </motion.li>
  )
}

export default function MessageThread({ conversation, loading }) {
  const end = useRef(null)

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [conversation, loading])

  if (conversation.length === 0 && !loading) {
    return (
      <motion.div {...arrive} className="flex flex-col items-center px-4 py-12 text-center">
        <span className="icon-chip h-16 w-16 rounded-2xl bg-primary-soft text-primary">
          <Bot size={30} aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">What would you like to know?</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Ask about flood extent, damaged infrastructure, cut-off settlements or rescue priorities.
          Answers are assembled from the satellite analysis shown on the dashboard.
        </p>
      </motion.div>
    )
  }

  return (
    <ol className="flex flex-col gap-4" role="log" aria-live="polite" aria-label="Conversation">
      {conversation.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} text={message.text} />
        ) : (
          <AssistantMessage key={message.id} response={message.response} />
        ),
      )}
      {loading && (
        <li className="flex items-center gap-2">
          <Avatar icon={Bot} className="bg-primary-soft text-primary" />
          <TypingDots label="Reading satellite analysis" />
        </li>
      )}
      <li ref={end} aria-hidden />
    </ol>
  )
}
