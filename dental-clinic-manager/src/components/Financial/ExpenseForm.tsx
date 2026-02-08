'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  ExpenseCategory,
  ExpenseFormData,
  PaymentMethod,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  ExpenseCategoryType,
} from '@/types/financial'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import { Loader2, Plus, Receipt, CreditCard, Building2 } from 'lucide-react'

interface ExpenseFormProps {
  clinicId: string
  year: number
  month: number
  onSave: () => void
  onCancel: () => void
}

export default function ExpenseForm({
  clinicId,
  year,
  month,
  onSave,
  onCancel,
}: ExpenseFormProps) {
  const { user } = useAuth()
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState<ExpenseFormData>({
    category_id: '',
    year,
    month,
    amount: 0,
    description: '',
    vendor_name: '',
    has_tax_invoice: false,
    tax_invoice_number: '',
    tax_invoice_date: '',
    payment_method: null,
    is_business_card: false,
    is_hometax_synced: false,
    notes: '',
  })

  // 카테고리 목록 로드
  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch(`/api/financial/categories?clinicId=${clinicId}`)
        const result = await response.json()

        if (result.success && result.data.length > 0) {
          setCategories(result.data)
          setFormData(prev => ({ ...prev, category_id: result.data[0].id }))
        } else {
          // 기본 카테고리 생성
          await fetch('/api/financial/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinicId, action: 'create_defaults' }),
          })
          // 다시 로드
          const retryResponse = await fetch(`/api/financial/categories?clinicId=${clinicId}`)
          const retryResult = await retryResponse.json()
          if (retryResult.success) {
            setCategories(retryResult.data)
            if (retryResult.data.length > 0) {
              setFormData(prev => ({ ...prev, category_id: retryResult.data[0].id }))
            }
          }
        }
      } catch (error) {
        console.error('Error loading categories:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCategories()
  }, [clinicId])

  // 입력값 변경 핸들러
  const handleChange = (
    field: keyof ExpenseFormData,
    value: string | number | boolean | null
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // 세금계산서가 있으면 홈택스 조회 가능으로 설정
    if (field === 'has_tax_invoice' && value === true) {
      setFormData(prev => ({ ...prev, is_hometax_synced: true }))
    }

    // 사업용 카드 결제면 홈택스 조회 가능으로 설정
    if (field === 'is_business_card' && value === true) {
      setFormData(prev => ({ ...prev, is_hometax_synced: true }))
    }
  }

  // 숫자 입력 핸들러
  const handleNumberChange = (field: keyof ExpenseFormData, value: string) => {
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0
    handleChange(field, num)
  }

  // 저장
  const handleSave = async () => {
    if (!formData.category_id || formData.amount <= 0) {
      alert('카테고리와 금액을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/financial/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          ...formData,
          userId: user?.id,
        }),
      })

      const result = await response.json()

      if (result.success) {
        onSave()
      } else {
        alert(result.error || '저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 선택된 카테고리 정보
  const selectedCategory = categories.find(c => c.id === formData.category_id)

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold mb-4">
        {year}년 {month}월 지출 추가
      </h3>

      <div className="space-y-4">
        {/* 카테고리 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            지출 카테고리 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category_id}
            onChange={e => handleChange('category_id', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({EXPENSE_CATEGORY_LABELS[cat.type as ExpenseCategoryType]})
              </option>
            ))}
          </select>
          {selectedCategory && (
            <p className="mt-1 text-xs text-gray-500">
              {selectedCategory.is_hometax_trackable && (
                <span className="inline-flex items-center text-green-600">
                  <Receipt className="w-3 h-3 mr-1" />
                  홈택스 조회 가능
                </span>
              )}
            </p>
          )}
        </div>

        {/* 금액 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            금액 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.amount > 0 ? formData.amount.toLocaleString() : ''}
              onChange={e => handleNumberChange('amount', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right pr-10"
              placeholder="0"
            />
            <span className="absolute right-3 top-2 text-gray-400">원</span>
          </div>
        </div>

        {/* 거래처 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            거래처 (업체명)
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.vendor_name}
              onChange={e => handleChange('vendor_name', e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="거래처 이름"
            />
          </div>
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            지출 내역 설명
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={e => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="지출 내역에 대한 설명"
          />
        </div>

        {/* 결제 방법 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            결제 방법
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleChange('payment_method', value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    formData.payment_method === value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* 사업용 카드 여부 */}
        {formData.payment_method === 'card' && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_business_card"
              checked={formData.is_business_card}
              onChange={e => handleChange('is_business_card', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_business_card" className="text-sm text-gray-700 flex items-center">
              <CreditCard className="w-4 h-4 mr-1 text-blue-600" />
              사업용 카드로 결제 (홈택스 조회 가능)
            </label>
          </div>
        )}

        {/* 세금계산서 */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="has_tax_invoice"
              checked={formData.has_tax_invoice}
              onChange={e => handleChange('has_tax_invoice', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="has_tax_invoice" className="text-sm font-medium text-gray-700 flex items-center">
              <Receipt className="w-4 h-4 mr-1 text-green-600" />
              세금계산서 발급됨
            </label>
          </div>

          {formData.has_tax_invoice && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">세금계산서 번호</label>
                <input
                  type="text"
                  value={formData.tax_invoice_number}
                  onChange={e => handleChange('tax_invoice_number', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="선택사항"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">발급일</label>
                <input
                  type="date"
                  value={formData.tax_invoice_date}
                  onChange={e => handleChange('tax_invoice_date', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* 홈택스 조회 가능 여부 표시 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_hometax_synced"
            checked={formData.is_hometax_synced}
            onChange={e => handleChange('is_hometax_synced', e.target.checked)}
            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          />
          <label htmlFor="is_hometax_synced" className="text-sm text-gray-700">
            홈택스에서 조회 가능한 지출
          </label>
        </div>

        {/* 메모 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            메모
          </label>
          <textarea
            value={formData.notes}
            onChange={e => handleChange('notes', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={2}
            placeholder="추가 메모 사항"
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.category_id || formData.amount <= 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                지출 추가
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
