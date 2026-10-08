import { Copy, Download } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { formatPercent } from '../../utils/formatters'
import { TypingDots } from '../Common/Animated'
import AnswerBody from './AnswerBody'

// A message easing in as it joins the thread
const arrive = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
}

// Who is speaking is said once, in words, above an answer. There are no avatars: the question
// sits in a tinted block on the right and the answer runs as plain text on the page.
function Speaker() {
  return <p className="mb-2 text-xs font-medium text-ink-soft">Copilot</p>
}

function UserMessage({ text }) {
  return (
    <motion.li {...arrive} className="flex justify-end">
      <p className="max-w-[85%] rounded-[6px] bg-[var(--surface-2)] px-4 py-2.5 text-[15px] leading-snug text-ink sm:max-w-[70%]">{text}</p>
    </motion.li>
  )
}

function AssistantMessage({ response, onCopy, onDownload }) {
  const lang = response.language === 'np' ? 'ne' : 'en'
  return (
    <motion.li {...arrive} className="max-w-[46rem]">
      <Speaker />
      {response.notice ? (
        <p lang={lang} className="text-[15px] leading-relaxed text-ink-soft">
          {response.notice}
        </p>
      ) : (
        <article lang={lang} className="min-w-0">
          {response.title && <h2 className="mb-3 text-lg font-semibold leading-snug tracking-tight">{response.title}</h2>}
          <AnswerBody text={response.answer} />
          <p className="mt-4 text-xs text-ink-muted" lang="en">
            Source: {response.dataSource}
            {response.confidence != null && `. Model confidence ${formatPercent(response.confidence)}`}
          </p>
          {/* Copy and Download act on the newest answer, so only that one carries them */}
          {onCopy && (
            <div className="no-print -ml-2.5 mt-2 flex gap-1">
              <button type="button" className="btn-quiet" onClick={onCopy}>
                <Copy size={15} aria-hidden /> Copy
              </button>
              <button type="button" className="btn-quiet" onClick={onDownload}>
                <Download size={15} aria-hidden /> Download
              </button>
            </div>
          )}
        </article>
      )}
    </motion.li>
  )
}

export default function MessageThread({ conversation, loading, onCopy, onDownload }) {
  const end = useRef(null)
  const lastAnswer = conversation.findLastIndex((m) => m.role === 'assistant' && m.response?.answer)

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [conversation, loading])

  return (
    <ol className="flex flex-col gap-9 pt-8" role="log" aria-live="polite" aria-label="Conversation">
      {conversation.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} text={message.text} />
        ) : (
          <AssistantMessage
            key={message.id}
            response={message.response}
            onCopy={index === lastAnswer ? onCopy : undefined}
            onDownload={index === lastAnswer ? onDownload : undefined}
          />
        ),
      )}
      {loading && (
        <li>
          <Speaker />
          <TypingDots label="Reading satellite analysis" />
        </li>
      )}
      <li ref={end} aria-hidden />
    </ol>
  )
}
