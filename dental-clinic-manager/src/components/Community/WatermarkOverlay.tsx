'use client'

interface WatermarkOverlayProps {
  nickname: string
}

export default function WatermarkOverlay({ nickname }: WatermarkOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden z-10"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 150px,
            rgba(0, 0, 0, 0.015) 150px,
            rgba(0, 0, 0, 0.015) 151px
          )`,
        }}
      />
      <div className="absolute inset-0 flex flex-wrap gap-x-32 gap-y-24 -rotate-[30deg] -translate-x-1/4 -translate-y-1/4 scale-150">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="text-[11px] text-gray-300/40 whitespace-nowrap select-none font-mono"
          >
            {nickname}
          </span>
        ))}
      </div>
    </div>
  )
}
