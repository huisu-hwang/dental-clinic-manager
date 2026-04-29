'use client'
import { useEffect, useState } from 'react'
import type { RLModel } from '@/types/rlTrading'

interface Props { onCreated: () => void }

interface CredentialRow {
  id: string
  label: string | null
  isPaperTrading: boolean
  broker: string
}

export default function RLStrategyForm({ onCreated }: Props) {
  const [models, setModels] = useState<RLModel[]>([])
  const [cred, setCred] = useState<CredentialRow | null>(null)
  const [form, setForm] = useState({
    name: '',
    rl_model_id: '',
    automation_level: 1 as 1 | 2,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingCred, setLoadingCred] = useState(true)

  useEffect(() => {
    fetch('/api/investment/rl-models')
      .then((r) => r.json())
      .then((j: { data?: RLModel[] }) =>
        setModels((j.data ?? []).filter((m) => m.status === 'ready'))
      )
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false))

    // credentials endpoint returns a single credential (or null)
    fetch('/api/investment/credentials')
      .then((r) => r.json())
      .then((j: { data?: CredentialRow | null }) => {
        if (j.data) {
          setCred({
            id: j.data.id,
            label: j.data.label,
            isPaperTrading: j.data.isPaperTrading,
            broker: j.data.broker,
          })
        } else {
          setCred(null)
        }
      })
      .catch(() => setCred(null))
      .finally(() => setLoadingCred(false))
  }, [])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const model = models.find((m) => m.id === form.rl_model_id)
      if (!model) throw new Error('모델을 선택해주세요')
      if (!cred) throw new Error('연결된 증권사 계좌가 없습니다')

      const body = {
        name: form.name,
        target_market: model.market,
        timeframe: model.timeframe,
        strategy_type: model.kind === 'portfolio' ? 'rl_portfolio' : 'rl_single',
        rl_model_id: model.id,
        automation_level: form.automation_level,
        credential_id: cred.id,
        indicators: [],
        buy_conditions: { type: 'group', operator: 'AND', conditions: [] },
        sell_conditions: { type: 'group', operator: 'AND', conditions: [] },
        is_active: false,
      }

      const r = await fetch('/api/investment/strategies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(errBody.error ?? `오류 ${r.status}`)
      }

      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedModel = models.find((m) => m.id === form.rl_model_id)
  const isLive = cred && !cred.isPaperTrading

  return (
    <div className="space-y-5 max-w-xl">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* 전략 이름 */}
      <label className="block">
        <span className="text-sm text-at-text-secondary mb-1 inline-block">전략 이름 *</span>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="예: PPO 포트폴리오 분산투자"
          maxLength={100}
          className="w-full px-3 py-2 border border-at-border rounded-xl bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
        />
      </label>

      {/* RL 모델 선택 */}
      <label className="block">
        <span className="text-sm text-at-text-secondary mb-1 inline-block">RL 모델 *</span>
        {loadingModels ? (
          <div className="w-full px-3 py-2 border border-at-border rounded-xl text-sm text-at-text-weak">
            모델 목록 불러오는 중...
          </div>
        ) : models.length === 0 ? (
          <div className="w-full px-3 py-2 border border-at-border rounded-xl text-sm text-at-text-weak bg-at-surface-alt">
            사용 가능한 RL 모델이 없습니다. RL 모델 탭에서 모델을 먼저 등록하세요.
          </div>
        ) : (
          <select
            value={form.rl_model_id}
            onChange={(e) => setForm({ ...form, rl_model_id: e.target.value })}
            className="w-full px-3 py-2 border border-at-border rounded-xl bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
          >
            <option value="">선택</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.algorithm}, {m.kind === 'portfolio' ? '포트폴리오' : '단일 자산'})
              </option>
            ))}
          </select>
        )}
        {selectedModel && (
          <p className="text-xs text-at-text-secondary mt-1.5">
            시장: {selectedModel.market} · 주기: {selectedModel.timeframe} ·{' '}
            유니버스: {(selectedModel.universe ?? []).join(', ') || '-'} ·{' '}
            신뢰도 임계: {selectedModel.min_confidence}
          </p>
        )}
      </label>

      {/* 증권사 계좌 */}
      <div>
        <span className="text-sm text-at-text-secondary mb-1 inline-block">증권사 계좌</span>
        {loadingCred ? (
          <div className="w-full px-3 py-2 border border-at-border rounded-xl text-sm text-at-text-weak">
            계좌 정보 불러오는 중...
          </div>
        ) : cred ? (
          <div className="w-full px-3 py-2 border border-at-border rounded-xl text-sm text-at-text bg-at-surface-alt">
            {cred.label ?? cred.broker}{' '}
            <span className={`text-xs font-medium ${cred.isPaperTrading ? 'text-at-accent' : 'text-red-600'}`}>
              {cred.isPaperTrading ? '(모의투자)' : '(LIVE)'}
            </span>
          </div>
        ) : (
          <div className="w-full px-3 py-2 border border-red-300 rounded-xl text-sm text-red-600 bg-red-50">
            연결된 계좌가 없습니다. 증권사 연결 탭에서 KIS 계좌를 먼저 등록하세요.
          </div>
        )}
      </div>

      {/* 자동화 수준 */}
      <fieldset className="space-y-2">
        <legend className="text-sm text-at-text-secondary">자동화 수준 *</legend>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setForm({ ...form, automation_level: 1 })}
            className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${
              form.automation_level === 1
                ? 'border-at-accent bg-at-accent-light/30'
                : 'border-at-border hover:border-at-accent/50'
            }`}
          >
            <p className="font-medium text-at-text">Level 1: 알림만 (권장)</p>
            <p className="text-xs text-at-text-secondary mt-0.5">신호 발생 시 Telegram 알림만 전송</p>
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, automation_level: 2 })}
            className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${
              form.automation_level === 2
                ? 'border-at-accent bg-at-accent-light/30'
                : 'border-at-border hover:border-at-accent/50'
            }`}
          >
            <p className="font-medium text-at-text">Level 2: 자동 주문</p>
            <p className="text-xs text-at-text-secondary mt-0.5">모델 신호에 따라 자동 주문 실행</p>
          </button>
        </div>
        {form.automation_level === 2 && isLive && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700">
            ⚠ Live 계좌에서 자동 주문이 실행됩니다. 검증되지 않은 모델은 즉시 손실로 이어질 수 있습니다.
          </div>
        )}
      </fieldset>

      <button
        type="button"
        onClick={submit}
        disabled={
          submitting ||
          !form.name.trim() ||
          !form.rl_model_id ||
          !cred
        }
        className="w-full py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? '생성 중...' : 'RL 전략 생성'}
      </button>
    </div>
  )
}
