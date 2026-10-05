import { animate, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { formatNumber } from '../../utils/formatters'

const EASE_OUT = [0.16, 1, 0.3, 1]

// A figure that counts up to its value the first time it scrolls into view.
// `text` is the already formatted figure ("16,145", "2.6"); anything that is
// not a plain number is shown as it is. The count is a transition, not data:
// it always ends on exactly `text`, and is skipped under "reduce motion" or
// where the browser cannot report visibility.
export function AnimatedNumber({ text }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const value = String(text)

  useLayoutEffect(() => {
    const node = ref.current
    node.textContent = value
    const countable = /^[\d,]+(\.\d+)?$/.test(value)
    if (!countable || reduce || typeof IntersectionObserver === 'undefined') return undefined

    const target = Number(value.replace(/,/g, ''))
    const digits = (value.split('.')[1] ?? '').length
    let controls
    node.textContent = formatNumber(0, digits)
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      controls = animate(0, target, {
        duration: 0.9,
        ease: EASE_OUT,
        onUpdate: (current) => {
          node.textContent = formatNumber(current, digits)
        },
        onComplete: () => {
          node.textContent = value
        },
      })
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      controls?.stop()
      node.textContent = value
    }
  }, [value, reduce])

  // The text is written by the effect above, so React never fights the count.
  return <span ref={ref} />
}

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
      transition={{ duration: 0.7, ease: EASE_OUT }}
    />
  )
}

// Three dots while an answer is being put together.
export function TypingDots({ label }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-4 py-3 shadow-sm">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink-muted"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          aria-hidden
        />
      ))}
      <span className="sr-only">{label}…</span>
    </span>
  )
}

// A card or list item that eases up into place as it scrolls into view.
export const riseIn = (index = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.45, delay: (index % 3) * 0.07, ease: EASE_OUT },
})

// The same lift and press on every interactive card.
export const liftOnHover = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.985 },
  transition: { type: 'spring', stiffness: 400, damping: 28 },
}
