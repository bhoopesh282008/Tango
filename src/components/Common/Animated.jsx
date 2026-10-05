import { motion } from 'motion/react'

const EASE_OUT = [0.16, 1, 0.3, 1]

// The filled part of a meter, growing from the left when it scrolls into view.
// `fraction` is 0 to 1. The bar keeps its true width; only its scale animates.
export function MeterFill({ fraction, className = '', style }) {
  return (
    <motion.div
      className={`h-full origin-left rounded-full ${className}`}
      style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, ...style }}
      // Not from zero: an element with no area is not reliably reported as "in view",
      // and some bars then never filled.
      initial={{ scaleX: 0.02 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    />
  )
}

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
