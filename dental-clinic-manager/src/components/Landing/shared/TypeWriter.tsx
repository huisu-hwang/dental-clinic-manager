'use client'

import { useEffect, useState } from 'react'
import { useScrollAnimation } from './useScrollAnimation'

export default function TypeWriter({ text, delay = 50 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState('')
  const [isStarted, setIsStarted] = useState(false)
  const { ref, isVisible } = useScrollAnimation()

  useEffect(() => {
    if (isVisible && !isStarted) {
      setIsStarted(true)
      let i = 0
      const timer = setInterval(() => {
        if (i < text.length) {
          setDisplayText(text.slice(0, i + 1))
          i++
        } else {
          clearInterval(timer)
        }
      }, delay)
      return () => clearInterval(timer)
    }
  }, [isVisible, isStarted, text, delay])

  return (
    <span ref={ref}>
      {displayText}
      {displayText.length < text.length && isStarted && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  )
}
