'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function PendingApprovalBanner({ clinicId, role }: { clinicId: string; role: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!['owner', 'master_admin'].includes(role)) return
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/staff/pending-count?clinicId=${clinicId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!cancelled) setCount(data.count ?? 0)
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [clinicId, role])

  if (count === 0) return null

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <span>직원 <b>{count}명</b>이 승인 대기 중입니다.</span>
      </div>
      <Link
        href="/management?tab=requests"
        className="font-medium text-amber-700 underline dark:text-amber-300"
      >
        지금 확인
      </Link>
    </div>
  )
}
