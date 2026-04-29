'use client'
import { useState } from 'react'
import type { RLModel } from '@/types/rlTrading'
import ModelRegisterDialog from './ModelRegisterDialog'
import { Plus, Trash2 } from 'lucide-react'
import { appConfirm } from '@/components/ui/AppDialog'

interface Props { models: RLModel[]; onChange: () => void }

const STATUS_COLOR: Record<string, string> = {
  ready: 'bg-at-success-bg text-at-success',
  pending: 'bg-at-surface-alt text-at-text-secondary',
  downloading: 'bg-at-accent-light text-at-accent',
  failed: 'bg-at-error-bg text-at-error',
  archived: 'bg-at-surface-alt text-at-text-weak',
}

export default function ModelLibraryPanel({ models, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const onDelete = async (m: RLModel) => {
    const ok = await appConfirm({
      title: '모델 보관(archive)',
      description: `${m.name}을(를) 보관하면 참조 전략이 비활성화됩니다.`,
      variant: 'destructive',
      confirmText: '보관',
    })
    if (!ok) return
    await fetch(`/api/investment/rl-models/${m.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover"
          aria-label="모델 추가"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> 모델 추가
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-xl text-at-text-secondary">
          등록된 RL 모델이 없습니다. &quot;모델 추가&quot;를 눌러 사전학습 ckpt URL을 등록하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-at-border">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-at-surface-alt">
              <tr>
                {['이름','종류','알고리즘','시장/주기','상태','신뢰도 임계','작업'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-at-border bg-white">
              {models.map((m) => (
                <tr key={m.id} className="hover:bg-at-surface-alt">
                  <td className="px-3 py-2.5 font-medium">{m.name}</td>
                  <td className="px-3 py-2.5">{m.kind}</td>
                  <td className="px-3 py-2.5">{m.algorithm}</td>
                  <td className="px-3 py-2.5">{m.market} / {m.timeframe}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${STATUS_COLOR[m.status] ?? ''}`}>{m.status}</span>
                  </td>
                  <td className="px-3 py-2.5">{m.min_confidence.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => onDelete(m)}
                      aria-label={`${m.name} 보관`}
                      title="보관"
                      className="p-1.5 rounded-xl hover:bg-at-error-bg text-at-text-secondary hover:text-at-error"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModelRegisterDialog open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); onChange() }} />
    </div>
  )
}
