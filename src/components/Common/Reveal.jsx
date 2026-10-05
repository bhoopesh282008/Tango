import { motion } from 'motion/react'

// A section easing into place when it first renders. `order` staggers
// neighbours. With "reduce motion" set, MotionConfig (in App) drops the
// movement and keeps only the fade.
export default function Reveal({ order = 0, className, children }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: order * 0.06, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
