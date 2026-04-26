'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, BookOpen, TrendingUp, AlertTriangle, CheckCircle2, XCircle,
  Target, Clock, Sparkles, Activity,
} from 'lucide-react'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import { PRESET_METADATA } from '@/components/Investment/StrategyBuilder/presets-metadata'
import type { ConditionGroup, ConditionLeaf, IndicatorRef, ConstantRef, MarketRegime } from '@/types/investment'

const REGIME_LABELS: Record<MarketRegime, { label: string; color: string }> = {
  'strong-uptrend': { label: '강한 상승 추세', color: 'bg-red-100 text-red-700' },
  'weak-uptrend': { label: '약한 상승 추세', color: 'bg-orange-100 text-orange-700' },
  'sideways': { label: '횡보 구간', color: 'bg-yellow-100 text-yellow-700' },
  'high-volatility': { label: '변동성 확대', color: 'bg-purple-100 text-purple-700' },
  'downtrend': { label: '하락 추세', color: 'bg-blue-100 text-blue-700' },
  'oversold-bounce': { label: '과매도 반등 가능', color: 'bg-emerald-100 text-emerald-700' },
  'overbought': { label: '과매수 (조정 임박)', color: 'bg-pink-100 text-pink-700' },
}

const OPERATOR_LABELS: Record<string, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  'crossOver': '↗ 상향 돌파',
  'crossUnder': '↘ 하향 돌파',
}

export default function PresetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const preset = PRESET_STRATEGIES.find(p => p.id === id)
  const meta = PRESET_METADATA[id]

  if (!preset) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <p className="font-semibold text-at-text">전략을 찾을 수 없습니다</p>
          <p className="text-sm text-at-text-secondary mt-1">ID: {id}</p>
          <Link href="/investment/compare" className="inline-flex items-center gap-1 mt-4 text-sm text-at-accent hover:underline">
            <ArrowLeft className="w-4 h-4" /> 비교 페이지로
          </Link>
        </div>
      </div>
    )
  }

  const isDayTrading = preset.mode === 'daytrading'

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-at-text-secondary hover:text-at-text"
      >
        <ArrowLeft className="w-4 h-4" /> 뒤로
      </button>

      {/* 헤더 */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border border-at-border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">프리셋 전략</span>
              {isDayTrading && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">단타 (분봉)</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-at-text break-all">{preset.name}</h1>
            <p className="text-sm text-at-text-secondary mt-1.5">{preset.description}</p>
          </div>
        </div>

        {meta?.source && (
          <div className="mt-3 pt-3 border-t border-purple-200/60 flex items-center gap-2 text-xs text-purple-900">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="italic">{meta.source}</span>
          </div>
        )}
      </div>

      {/* 자세한 설명 */}
      {meta?.longDescription && (
        <Section title="📚 자세한 설명">
          <p className="text-sm leading-relaxed text-at-text">{meta.longDescription}</p>
        </Section>
      )}

      {/* 적합한 종목 / 시장 상황 / 보유 기간 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {meta?.bestFor && (
          <Section title="🎯 어떤 종목에 적합?" icon={<Target className="w-4 h-4 text-emerald-500" />}>
            <ul className="space-y-1.5">
              {meta.bestFor.map((item, i) => (
                <li key={i} className="text-xs text-at-text bg-emerald-50 rounded-lg px-2.5 py-1.5">
                  • {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {meta?.marketConditions && meta.marketConditions.length > 0 && (
          <Section title="🌡 적합한 시장 상황" icon={<TrendingUp className="w-4 h-4 text-blue-500" />}>
            <div className="flex flex-wrap gap-1.5">
              {meta.marketConditions.map(cond => (
                <span key={cond} className={`text-xs px-2 py-1 rounded-full ${REGIME_LABELS[cond]?.color || 'bg-gray-100 text-gray-700'}`}>
                  {REGIME_LABELS[cond]?.label || cond}
                </span>
              ))}
            </div>
          </Section>
        )}

        {meta?.typicalHolding && (
          <Section title="⏱ 평균 보유 기간" icon={<Clock className="w-4 h-4 text-amber-500" />}>
            <p className="text-lg font-semibold text-at-text">{meta.typicalHolding}</p>
          </Section>
        )}
      </div>

      {/* 장점 / 단점 */}
      {(meta?.pros || meta?.cons) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meta?.pros && (
            <Section title="✅ 장점">
              <ul className="space-y-1.5">
                {meta.pros.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-at-text">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {meta?.cons && (
            <Section title="⚠️ 단점/리스크">
              <ul className="space-y-1.5">
                {meta.cons.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-at-text">
                    <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* 매수/매도 조건 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="🟢 매수 조건">
          <ConditionTreeView tree={preset.buyConditions} accent="emerald" />
        </Section>
        <Section title="🔴 매도 조건">
          <ConditionTreeView tree={preset.sellConditions} accent="rose" />
        </Section>
      </div>

      {/* 사용 지표 */}
      <Section title="📊 사용 지표" icon={<Activity className="w-4 h-4 text-cyan-500" />}>
        <div className="flex flex-wrap gap-2">
          {preset.indicators.map(ind => (
            <span key={ind.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-900">
              <span className="font-mono font-semibold">{ind.id}</span>
              {Object.keys(ind.params).length > 0 && (
                <span className="text-[10px] text-cyan-700">
                  ({Object.entries(ind.params).map(([k, v]) => `${k}=${v}`).join(', ')})
                </span>
              )}
            </span>
          ))}
        </div>
      </Section>

      {/* 리스크 설정 */}
      <Section title="🛡 리스크 설정">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {preset.riskSettings.stopLossPercent !== undefined && preset.riskSettings.stopLossPercent > 0 && (
            <RiskBox label="손절" value={`${preset.riskSettings.stopLossPercent}%`} color="rose" />
          )}
          {preset.riskSettings.takeProfitPercent !== undefined && preset.riskSettings.takeProfitPercent > 0 && (
            <RiskBox label="익절" value={`${preset.riskSettings.takeProfitPercent}%`} color="emerald" />
          )}
          {preset.riskSettings.maxHoldingDays !== undefined && preset.riskSettings.maxHoldingDays > 0 && (
            <RiskBox label="최대 보유" value={`${preset.riskSettings.maxHoldingDays}${isDayTrading ? '봉' : '일'}`} color="amber" />
          )}
        </div>
      </Section>

      {/* CTA */}
      <div className="flex gap-3 pt-2">
        <Link
          href="/investment/compare"
          className="flex-1 px-4 py-2.5 text-center bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
        >
          이 전략으로 백테스트 비교하기 →
        </Link>
      </div>
    </div>
  )
}

// ============================================
// 보조 컴포넌트
// ============================================

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        {icon}
        <h2 className="text-sm font-semibold text-at-text">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function RiskBox({ label, value, color }: { label: string; value: string; color: 'rose' | 'emerald' | 'amber' }) {
  const colorMap = {
    rose: 'bg-rose-50 border-rose-200 text-rose-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
  }
  return (
    <div className={`rounded-xl border p-2.5 ${colorMap[color]}`}>
      <p className="text-[10px] font-medium opacity-80">{label}</p>
      <p className="text-base font-bold font-mono mt-0.5">{value}</p>
    </div>
  )
}

/** 조건 트리 시각화 */
function ConditionTreeView({ tree, accent }: { tree: ConditionGroup; accent: 'emerald' | 'rose' }) {
  const accentClass = accent === 'emerald' ? 'border-l-emerald-300' : 'border-l-rose-300'
  const opLabel = tree.operator === 'AND' ? '모두 충족 (AND)' : '하나라도 충족 (OR)'
  const opBg = tree.operator === 'AND' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'

  if (!tree.conditions || tree.conditions.length === 0) {
    return <p className="text-xs text-at-text-weak italic">조건 없음</p>
  }

  return (
    <div className={`pl-3 border-l-2 ${accentClass} space-y-1.5`}>
      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${opBg} font-medium`}>{opLabel}</span>
      {tree.conditions.map((node, i) => {
        if (node.type === 'leaf') {
          return <ConditionLeafView key={i} leaf={node} />
        }
        return (
          <div key={i} className="ml-2">
            <ConditionTreeView tree={node} accent={accent} />
          </div>
        )
      })}
    </div>
  )
}

function ConditionLeafView({ leaf }: { leaf: ConditionLeaf }) {
  const left = formatRef(leaf.left)
  const right = formatRef(leaf.right)
  const op = OPERATOR_LABELS[leaf.operator] || leaf.operator
  return (
    <div className="font-mono text-xs bg-at-surface-alt rounded-lg px-2.5 py-1.5">
      <span className="text-at-text">{left}</span>
      <span className="mx-2 text-at-accent font-semibold">{op}</span>
      <span className="text-at-text">{right}</span>
    </div>
  )
}

function formatRef(ref: IndicatorRef | ConstantRef): string {
  if (ref.type === 'constant') return String(ref.value)
  return ref.property ? `${ref.id}.${ref.property}` : ref.id
}
