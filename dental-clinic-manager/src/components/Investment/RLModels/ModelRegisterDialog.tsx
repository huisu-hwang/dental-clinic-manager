'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props { open: boolean; onClose: () => void; onCreated: () => void }

export default function ModelRegisterDialog({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    algorithm: 'PPO',
    kind: 'portfolio',
    universe: 'AAPL,MSFT,GOOGL,AMZN,META',
    state_window: 60,
    input_features: 'open,high,low,close,volume',
    output_dim: 5,
    output_type: 'continuous' as 'continuous' | 'discrete',
    checkpoint_url: '',
    checkpoint_sha256: '',
    min_confidence: 0.6,
    source: 'finrl_pretrained' as 'finrl_pretrained' | 'sb3_pretrained' | 'custom',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const body = {
        name: form.name,
        algorithm: form.algorithm,
        kind: form.kind,
        source: form.source,
        universe: form.universe.split(',').map((s) => s.trim()).filter(Boolean),
        input_features: form.input_features.split(',').map((s) => s.trim()).filter(Boolean),
        output_shape: { type: form.output_type, dim: Number(form.output_dim) },
        state_window: Number(form.state_window),
        min_confidence: Number(form.min_confidence),
        checkpoint_url: form.checkpoint_url,
        checkpoint_sha256: form.checkpoint_sha256,
      }
      const r = await fetch('/api/investment/rl-models', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error ?? `${r.status}`)
      }
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>RL 모델 등록</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {error && <div className="p-2 rounded-xl bg-at-error-bg text-at-error text-sm">{error}</div>}
          <Field label="이름 *" v={form.name} on={(v) => setForm({ ...form, name: v })} />
          <Field label="알고리즘" v={form.algorithm} on={(v) => setForm({ ...form, algorithm: v })} />
          <Field label="종목 유니버스 (콤마 구분)" v={form.universe} on={(v) => setForm({ ...form, universe: v })} />
          <Field label="입력 피처 (콤마 구분)" v={form.input_features} on={(v) => setForm({ ...form, input_features: v })} />
          <Field label="state_window" v={String(form.state_window)} on={(v) => setForm({ ...form, state_window: Number(v) })} />
          <Field label="output dim" v={String(form.output_dim)} on={(v) => setForm({ ...form, output_dim: Number(v) })} />
          <Field label="ckpt URL *" v={form.checkpoint_url} on={(v) => setForm({ ...form, checkpoint_url: v })} />
          <Field label="ckpt sha256 *" v={form.checkpoint_sha256} on={(v) => setForm({ ...form, checkpoint_sha256: v })} />
          <Field label="min_confidence" v={String(form.min_confidence)} on={(v) => setForm({ ...form, min_confidence: Number(v) })} />
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 border border-at-border rounded-xl text-sm">취소</button>
          <button
            onClick={submit}
            disabled={submitting || !form.name || !form.checkpoint_url || !form.checkpoint_sha256}
            className="px-4 py-2 bg-at-accent text-white rounded-xl text-sm disabled:opacity-50"
          >
            {submitting ? '등록 중...' : '등록 + 다운로드'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-at-text mb-1 inline-block">{label}</span>
      <input
        value={v}
        onChange={(e) => on(e.target.value)}
        className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent"
      />
    </label>
  )
}
