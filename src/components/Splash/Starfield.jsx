import { useEffect, useRef } from 'react'

const STAR_COUNT = 260
const SPEED = 0.00045 // depth travelled per millisecond
const COLORS = ['#ffffff', '#ffffff', '#ffffff', '#cfe6ff', '#1e90ff']

// Deterministic PRNG so the field looks the same on every visit.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stars drifting towards the viewer, drawn on a 2D canvas. No dependencies.
export default function Starfield({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return undefined

    const random = mulberry32(2026)
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: random() * 2 - 1,
      y: random() * 2 - 1,
      z: random(),
      color: COLORS[Math.floor(random() * COLORS.length)],
    }))

    let width = 0
    let height = 0
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const draw = (elapsed) => {
      ctx.clearRect(0, 0, width, height)
      const reach = Math.max(width, height) * 0.6
      for (const star of stars) {
        star.z -= elapsed * SPEED
        if (star.z <= 0.02) star.z = 1
        // Perspective: nearer stars sit further from the centre, larger and brighter.
        const x = width / 2 + (star.x / star.z) * reach * 0.5
        const y = height / 2 + (star.y / star.z) * reach * 0.5
        if (x < 0 || x > width || y < 0 || y > height) continue
        const nearness = 1 - star.z
        ctx.globalAlpha = 0.25 + nearness * 0.75
        ctx.fillStyle = star.color
        ctx.beginPath()
        ctx.arc(x, y, 0.4 + nearness * 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    resize()
    draw(0)
    window.addEventListener('resize', resize)

    // A still field is enough for people who have asked for reduced motion.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()
    const tick = (now) => {
      // Clamp so a background tab does not resume with one huge jump.
      draw(Math.min(now - last, 50))
      last = now
      frame = requestAnimationFrame(tick)
    }
    if (!still) frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
