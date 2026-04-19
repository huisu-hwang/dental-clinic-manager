'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'

interface PreviewData {
  changeRequired: boolean
  currentPlan?: string
  targetPlan?: string
  refunded: number
}

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  triggerLabel: string
}

export default function DowngradeConfirmModal({ open, onClose, onConfirm, triggerLabel }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    setPreview(null)
    fetch('/api/subscription/downgrade/preview', { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => setPreview(data))
      .catch(() => setPreview({ changeRequired: false, refunded: 0 }))
    return () => ac.abort()
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{triggerLabel} 확인</DialogTitle>
          <DialogDescription>
            {preview === null
              ? '계산 중…'
              : preview.changeRequired
                ? `재직자가 감소하여 ${preview.currentPlan} → ${preview.targetPlan}로 전환됩니다. 일할 기준 환불 예상액 ${preview.refunded.toLocaleString()}원.`
                : '플랜 변경 없이 처리됩니다.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={async () => {
            setLoading(true)
            try { await onConfirm() } finally { setLoading(false); onClose() }
          }} disabled={loading}>
            {loading ? '처리 중…' : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
