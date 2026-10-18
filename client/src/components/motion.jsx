// Small bits of motion: numbers that count up, sections that fade in as they scroll into
// view, cards that tilt toward the mouse, and a burst of confetti. All of it switches off
// when the person has asked their system for reduced motion.
import { useEffect, useRef, useState } from 'react'

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts from 0 up to `value` (numbers only; anything else is shown as it is). */
export function CountUp({ value, ms = 900 }) {
  const n = Number(value)
  const [shown, setShown] = useState(Number.isFinite(n) && !reducedMotion() ? 0 : value)
  useEffect(() => {
    if (!Number.isFinite(n) || reducedMotion()) return setShown(value)
    let raf
    const start = performance.now()
    const tick = (t) => {
      const k = Math.min(1, (t - start) / ms)
      setShown(Math.round(n * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [n, value, ms])
  return <>{shown}</>
}

/** Fades its children up into place the first time they scroll into view. */
export function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(reducedMotion())
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true)
        io.disconnect()
      }
    }, { threshold: 0.08 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return (
    <Tag ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}

/** Mouse handlers that tilt an element a few degrees toward the pointer (via CSS variables). */
export const tilt = {
  onMouseMove(e) {
    if (reducedMotion()) return
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -6}deg`)
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`)
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  },
  onMouseLeave(e) {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  },
}

const COLORS = ['#0d7c6f', '#12a28f', '#7fdccb', '#f0603f', '#ffb39f', '#d6efeb']
/** A one-off burst of confetti from the middle of `el`. */
export function confetti(el) {
  if (!el || reducedMotion()) return
  const box = document.createElement('div')
  box.className = 'confetti'
  for (let i = 0; i < 42; i++) {
    const s = document.createElement('i')
    const angle = Math.random() * Math.PI * 2
    const dist = 80 + Math.random() * 160
    s.style.setProperty('--x', `${Math.cos(angle) * dist}px`)
    s.style.setProperty('--y', `${Math.sin(angle) * dist - 60}px`)
    s.style.setProperty('--r', `${Math.random() * 720 - 360}deg`)
    s.style.background = COLORS[i % COLORS.length]
    s.style.animationDelay = `${Math.random() * 80}ms`
    box.appendChild(s)
  }
  el.appendChild(box)
  setTimeout(() => box.remove(), 1400)
}
