import { motion } from 'motion/react'

// Three dots while an answer is being put together.
export function TypingDots({ label }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          aria-hidden
        />
      ))}
      <span className="sr-only">{label}…</span>
    </span>
  )
}
