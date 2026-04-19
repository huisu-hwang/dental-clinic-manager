'use client'

import { useEffect, useState } from 'react'
import { useScrollAnimation } from './useScrollAnimation'

interface CountUpProps {
  end: number
  suffix?: string
  duration?: number
}

export default function CountUp({ end, suffix = '', duration = 2000 }: CountUpProps) {
  const [count, setCount] = useState(0)
  const { ref, isVisible } = useScrollAnimation()

  useEffect(() => {
    if (!isVisible) return

    let startTime: number
    let animationId = 0
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      }
    }
    animationId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationId)
  }, [isVisible, end, duration])

  return <span ref={ref}>{count}{suffix}</span>
}
