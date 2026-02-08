'use client'

import { useEffect, useRef, ReactNode } from 'react'

interface ContentProtectionWrapperProps {
  children: ReactNode
  nickname?: string
}

export default function ContentProtectionWrapper({ children, nickname }: ContentProtectionWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 복사 방지
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault()
    }

    // 우클릭 방지
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    // 키보드 단축키 차단
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'p', 's', 'a', 'u'].includes(e.key.toLowerCase())) {
          e.preventDefault()
        }
      }
      // PrintScreen 키 차단
      if (e.key === 'PrintScreen') {
        e.preventDefault()
      }
    }

    container.addEventListener('copy', handleCopy)
    container.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('copy', handleCopy)
      container.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div ref={containerRef} className="community-content relative" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      {children}
    </div>
  )
}
