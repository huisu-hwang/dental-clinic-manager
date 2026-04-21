'use client'

import { useEffect, useState } from 'react'
import { Calculator, Save, Loader2, Info } from 'lucide-react'
import type { ClinicTaxSettings } from '@/types/financial'
import { appAlert } from '@/components/ui/AppDialog'

interface Props {
  clinicId: string
  onSaved?: () => void
}

const DEFAULTS: ClinicTaxSettings = {
  clinic_id: '',
  business_type: 'individual',
  bookkeeping_type: 'double',
  dependent_count: 1,
  spouse_deduction: false,
  apply_standard_deduction: true,
  noranumbrella_monthly: 0,
  national_pension_monthly: 0,
  health_insurance_monthly: 0,
}

export default function TaxSettingsForm({ clinicId, onSaved }: Props) {
  const [settings, setSettings] = useState<ClinicTaxSettings>({ ...DEFAULTS, clinic_id: clinicId })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!clinicId) return
    (async () => {
      try {
        const res = await fetch(`/api/financial/tax-settings?clinicId=${clinicId}`)
        const json = await res.json()
        if (json.success && json.data) {
          setSettings({ ...DEFAULTS, ...json.data, clinic_id: clinicId })
        }
      } catch (err) {
        console.error('Failed to load tax settings:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [clinicId])

  const update = <K extends keyof ClinicTaxSettings>(key: K, value: ClinicTaxSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/financial/tax-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, clinicId }),
      })
      const json = await res.json()
      if (json.success) {
        await appAlert('세무 설정이 저장되었습니다. 현황 조회 탭의 예상 세금이 자동으로 갱신됩니다.')
        onSaved?.()
      } else {
        await appAlert(json.error || '저장에 실패했습니다.')
      }
    } catch (err) {
      console.error('Save tax settings error:', err)
      await appAlert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-at-text flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-500" />
            세무 설정
          </h2>
          <p className="text-sm text-at-text mt-1">
            예상 세금(종합소득세·지방소득세) 계산 정확도를 높이기 위해 아래 항목을 미리 설정하세요.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 사업자 유형 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">사업자 유형</label>
          <div className="flex gap-2">
            {(['individual', 'corporate'] as const).map(val => (
              <button
                key={val}
                type="button"
                onClick={() => update('business_type', val)}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  settings.business_type === val
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-semibold'
                    : 'bg-white border-at-border text-at-text hover:bg-at-surface-alt'
                }`}
              >
                {val === 'individual' ? '개인사업자' : '법인사업자'}
              </button>
            ))}
          </div>
        </div>

        {/* 기장 방식 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            기장 방식
            <span className="ml-1 text-xs font-normal text-at-text-weak">(복식부기: 기장세액공제 20%, 한도 100만원)</span>
          </label>
          <div className="flex gap-2">
            {(['simple', 'double'] as const).map(val => (
              <button
                key={val}
                type="button"
                onClick={() => update('bookkeeping_type', val)}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  settings.bookkeeping_type === val
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-semibold'
                    : 'bg-white border-at-border text-at-text hover:bg-at-surface-alt'
                }`}
              >
                {val === 'simple' ? '간편장부' : '복식부기'}
              </button>
            ))}
          </div>
        </div>

        {/* 인적공제 대상 인원 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            인적공제 대상 인원
            <span className="ml-1 text-xs font-normal text-at-text-weak">(본인 포함, 1인당 150만원)</span>
          </label>
          <input
            type="number"
            min={1}
            value={settings.dependent_count}
            onChange={e => update('dependent_count', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 border border-at-border rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* 배우자 공제 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            배우자 공제
            <span className="ml-1 text-xs font-normal text-at-text-weak">(연 150만원 추가)</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-2 border border-at-border rounded-xl cursor-pointer hover:bg-at-surface-alt">
            <input
              type="checkbox"
              checked={settings.spouse_deduction}
              onChange={e => update('spouse_deduction', e.target.checked)}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm">배우자 공제 적용</span>
          </label>
        </div>

        {/* 노란우산공제 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            노란우산공제 월 납부액
            <span className="ml-1 text-xs font-normal text-at-text-weak">(연 최대 600만원 공제)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={10000}
              value={settings.noranumbrella_monthly}
              onChange={e => update('noranumbrella_monthly', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 pr-12 border border-at-border rounded-xl focus:outline-none focus:border-indigo-500"
              placeholder="예: 250000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-at-text-weak">원</span>
          </div>
        </div>

        {/* 국민연금 월 납부액 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            국민연금 월 납부액 <span className="ml-1 text-xs font-normal text-at-text-weak">(본인 부담분, 전액 공제)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={10000}
              value={settings.national_pension_monthly}
              onChange={e => update('national_pension_monthly', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 pr-12 border border-at-border rounded-xl focus:outline-none focus:border-indigo-500"
              placeholder="예: 300000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-at-text-weak">원</span>
          </div>
        </div>

        {/* 건강보험료 월 납부액 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            건강보험료 월 납부액 <span className="ml-1 text-xs font-normal text-at-text-weak">(지역가입자 본인 부담분)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={10000}
              value={settings.health_insurance_monthly}
              onChange={e => update('health_insurance_monthly', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 pr-12 border border-at-border rounded-xl focus:outline-none focus:border-indigo-500"
              placeholder="예: 400000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-at-text-weak">원</span>
          </div>
        </div>

        {/* 표준세액공제 */}
        <div>
          <label className="block text-sm font-semibold text-at-text mb-2">
            표준세액공제 <span className="ml-1 text-xs font-normal text-at-text-weak">(연 7만원)</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-2 border border-at-border rounded-xl cursor-pointer hover:bg-at-surface-alt">
            <input
              type="checkbox"
              checked={settings.apply_standard_deduction}
              onChange={e => update('apply_standard_deduction', e.target.checked)}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm">표준세액공제 적용</span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 text-xs text-at-text bg-at-surface-alt rounded-xl p-3">
        <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <p>
          이 설정은 예상 세금 추정용입니다. 실제 납부액은 개별 신고·업종별 감면·추가 공제 항목에 따라 달라질 수 있으며,
          정확한 신고는 세무 전문가의 도움을 받으세요.
        </p>
      </div>
    </div>
  )
}
