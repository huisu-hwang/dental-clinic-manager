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
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [isVisible, end, duration])

  return <span ref={ref}>{count}{suffix}</span>
}
