'use client'

import { useState, useEffect } from 'react'
import { dataService } from '@/lib/dataService'
import { PREMIUM_FEATURE_IDS, PREMIUM_FEATURE_LABELS } from '@/config/menuConfig'
import type { PremiumFeatureId } from '@/config/menuConfig'
import { X, Sparkles, BarChart3, Megaphone, PhoneCall, FileBarChart2, Heart } from 'lucide-react'

interface PremiumFeatureModalProps {
  clinic: { id: string; name: string }
  grantedBy: string  // master admin user id
  onClose: () => void
  onUpdated?: () => void
}

const FEATURE_ICONS: Record<PremiumFeatureId, React.ElementType> = {
  'recall': PhoneCall,
  'ai-analysis': Sparkles,
  'financial': BarChart3,
  'monthly-report': FileBarChart2,
  'referral': Heart,
  'marketing': Megaphone,
  'investment': BarChart3,
}

export default function PremiumFeatureModal({ clinic, grantedBy, onClose, onUpdated }: PremiumFeatureModalProps) {
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    loadFeatures()
  }, [clinic.id])

  const loadFeatures = async () => {
    setLoading(true)
    try {
      const { data } = await dataService.getClinicPremiumFeaturesAll(clinic.id)
      const featureMap: Record<string, boolean> = {}
      for (const id of PREMIUM_FEATURE_IDS) {
        const found = data.find((f: { feature_id: string; enabled: boolean }) => f.feature_id === id)
        featureMap[id] = found ? found.enabled : false
      }
      setFeatures(featureMap)
    } catch (err) {
      console.error('[PremiumFeatureModal] Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (featureId: PremiumFeatureId) => {
    const newValue = !features[featureId]
    setSaving(featureId)
    try {
      const { error } = await dataService.setClinicPremiumFeature(clinic.id, featureId, newValue, grantedBy)
      if (error) {
        console.error('[PremiumFeatureModal] Toggle error:', error)
        alert('기능 설정 변경에 실패했습니다.')
        return
      }
      setFeatures(prev => ({ ...prev, [featureId]: newValue }))
      onUpdated?.()
    } catch (err) {
      console.error('[PremiumFeatureModal] Toggle error:', err)
      alert('기능 설정 변경에 실패했습니다.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-at-border">
          <div>
            <h3 className="text-lg font-bold text-at-text">프리미엄 기능 관리</h3>
            <p className="text-sm text-at-text-weak mt-0.5">{clinic.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-at-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-at-text-weak" />
          </button>
        </div>

        {/* 기능 목록 */}
        <div className="p-5 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
            </div>
          ) : (
            PREMIUM_FEATURE_IDS.map(featureId => {
              const Icon = FEATURE_ICONS[featureId]
              const isEnabled = features[featureId] || false
              const isSaving = saving === featureId

              return (
                <div
                  key={featureId}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    isEnabled
                      ? 'border-at-border bg-at-accent-light/50'
                      : 'border-at-border bg-at-surface-alt/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isEnabled ? 'bg-at-tag text-at-accent' : 'bg-at-border text-at-text-weak'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isEnabled ? 'text-at-text' : 'text-at-text-weak'}`}>
                        {PREMIUM_FEATURE_LABELS[featureId]}
                      </p>
                      <p className="text-xs text-at-text-weak">
                        {isEnabled ? '활성화됨' : '비활성화됨'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(featureId)}
                    disabled={isSaving}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                      ${isSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                      ${isEnabled ? 'bg-at-accent' : 'bg-at-border'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-at-card
                        ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* 하단 */}
        <div className="px-5 py-4 border-t border-at-border bg-at-surface-alt rounded-b-xl">
          <p className="text-xs text-at-text-weak text-center">
            활성화된 기능은 해당 병원의 대표 원장에게 즉시 적용됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
