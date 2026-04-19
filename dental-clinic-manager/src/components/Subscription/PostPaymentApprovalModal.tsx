'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'

interface Props {
  open: boolean
  onClose: () => void
  pendingCount: number
  newLimit: number
  newPlanName: string
}

export default function PostPaymentApprovalModal({ open, onClose, pendingCount, newLimit, newPlanName }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ approved: number; remaining: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleAutoApprove = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/staff/approve-bulk-auto', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? '자동 승인에 실패했습니다.')
        return
      }
      setResult({ approved: data.approvedCount, remaining: data.remainingPending })
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동 승인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleIndividual = () => {
    onClose()
    router.push('/management?tab=requests')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>결제 완료 · 대기 직원 승인</DialogTitle>
          <DialogDescription>
            {newPlanName} 플랜 결제가 완료되었습니다. 신규 상한 {newLimit}명.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p><b>{result.approved}명</b>이 자동 승인되었습니다.</p>
            {result.remaining > 0 && (
              <p className="text-amber-600">
                여전히 {result.remaining}명이 대기 중입니다 (신규 상한 {newLimit}명 초과).
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button onClick={onClose}>확인</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>대기 중인 직원 <b>{pendingCount}명</b>을 어떻게 처리할까요?</p>
              {pendingCount > newLimit && (
                <p className="text-amber-600">신규 상한 {newLimit}명보다 대기자가 많아 일부만 자동 승인됩니다.</p>
              )}
              {error && <p className="text-red-600">{error}</p>}
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleIndividual} disabled={loading}>개별 승인</Button>
              <Button onClick={handleAutoApprove} disabled={loading}>
                {loading ? '승인 중…' : '전체 자동 승인'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
