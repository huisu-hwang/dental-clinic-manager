'use client'
import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'

export default function KillSwitchToggle() {
  const [paused, setPaused] = useState<boolean | null>(null)

  const fetchState = async () => {
    try {
      const r = await fetch('/api/investment/rl-pause')
      if (!r.ok) return
      const j = (await r.json()) as { paused?: boolean }
      setPaused(Boolean(j.paused))
    } catch {
      setPaused(false)
    }
  }

  useEffect(() => { fetchState() }, [])

  const toggle = async () => {
    const next = !(paused ?? false)
    const r = await fetch('/api/investment/rl-pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paused: next }),
    })
    if (r.ok) setPaused(next)
  }

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${paused ? 'bg-at-error text-white' : 'bg-at-surface-alt text-at-text'}`}
      aria-label={paused ? 'RL 자동매매 재개' : 'RL 자동매매 일시정지'}
    >
      {paused
        ? <><Play className="w-4 h-4" aria-hidden="true" />RL 자동매매 재개</>
        : <><Pause className="w-4 h-4" aria-hidden="true" />RL 자동매매 일시정지</>
      }
    </button>
  )
}
