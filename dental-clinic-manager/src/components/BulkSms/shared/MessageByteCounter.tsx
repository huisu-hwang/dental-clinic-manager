'use client'

export default function MessageByteCounter({ text }: { text: string }) {
  const bytes = new TextEncoder().encode(text).length
  const isLMS = bytes > 90
  const cls = bytes > 2000 ? 'text-red-600' : isLMS ? 'text-amber-700' : 'text-[var(--at-text-secondary)]'
  return (
    <div className={`text-xs ${cls}`}>
      {bytes} 바이트 · {isLMS ? 'LMS' : 'SMS'} {bytes > 2000 && '(2000바이트 초과)'}
    </div>
  )
}
