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

function UserMessage({ text, anchor }) {
  return (
    // Scrolled to when its answer arrives; below lg the header is two rows deep, so it needs more room
    <motion.li ref={anchor} {...arrive} className="flex scroll-mt-16 justify-end lg:scroll-mt-2">
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
          {response.title && <h2 className="mb-3 text-xl font-semibold leading-snug tracking-tight">{response.title}</h2>}
          <AnswerBody text={response.answer} />
          {/* The answer's foot: where it came from, and what can be done with it */}
          <div className="mt-5 flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 border-t border-line pt-1">
            <p className="py-1.5 text-xs text-ink-muted" lang="en">
              Source: {response.dataSource}
              {response.confidence != null && `. Model confidence ${formatPercent(response.confidence)}`}
            </p>
            {/* Copy and Download act on the newest answer, so only that one carries them */}
            {onCopy && (
              <div className="no-print -mr-2.5 flex gap-1 max-sm:-ml-2.5">
                <button type="button" className="btn-quiet" onClick={onCopy}>
                  <Copy size={15} aria-hidden /> Copy
                </button>
                <button type="button" className="btn-quiet" onClick={onDownload}>
                  <Download size={15} aria-hidden /> Download
                </button>
              </div>
            )}
          </div>
        </article>
      )}
    </motion.li>
  )
}

export default function MessageThread({ conversation, loading, onCopy, onDownload }) {
  const end = useRef(null)
  const question = useRef(null)
  const lastAnswer = conversation.findLastIndex((m) => m.role === 'assistant' && m.response?.answer)
  const lastQuestion = conversation.findLastIndex((m) => m.role === 'user')

  // While an answer is on its way, the waiting dots are kept in view. Once it is there the page
  // goes to the question it answers, so reading starts at the top of the answer and not at its
  // last line under the input.
  useEffect(() => {
    const target = loading ? end.current : (question.current ?? end.current)
    target?.scrollIntoView?.({ behavior: 'smooth', block: loading ? 'nearest' : 'start' })
  }, [conversation, loading])

  return (
    <ol className="flex flex-col gap-10 pb-4 pt-8" role="log" aria-live="polite" aria-label="Conversation">
      {conversation.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} text={message.text} anchor={index === lastQuestion ? question : undefined} />
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
      {/* Scrolled to with room to spare, so it is never under the input */}
      <li ref={end} aria-hidden className="scroll-mb-48" />
    </ol>
  )
}
