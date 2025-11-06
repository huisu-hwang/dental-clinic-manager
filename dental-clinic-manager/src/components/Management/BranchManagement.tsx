'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { dataService } from '@/lib/dataService'
import type { ClinicBranch, CreateBranchInput, UpdateBranchInput } from '@/types/branch'
import { validateBranch } from '@/types/branch'
import { cn } from '@/lib/utils'
import { BuildingStorefrontIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'

interface BranchManagementProps {
  currentUser: {
    id: string
    role?: string | null
  }
}

export default function BranchManagement({ currentUser }: BranchManagementProps) {
  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<ClinicBranch | null>(null)
  const [deletingBranch, setDeletingBranch] = useState<ClinicBranch | null>(null)
  const [formData, setFormData] = useState({
    branch_name: '',
    branch_code: '',
    address: '',
    phone: '',
    latitude: '',
    longitude: '',
    attendance_radius_meters: '100',
    is_active: true,
    display_order: '0'
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 권한 체크
  const userRole = currentUser.role ?? ''
  const canManage = userRole === 'owner' || userRole === 'manager'
  const canDelete = userRole === 'owner'

  // 지점 목록 로드
  const loadBranches = async () => {
    setLoading(true)
    try {
      const result = await dataService.getBranches()
      if (result.error) {
        console.error('[BranchManagement] Error loading branches:', result.error)
      } else {
        setBranches((result.data ?? []) as ClinicBranch[])
      }
    } catch (error) {
      console.error('[BranchManagement] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBranches()
  }, [])

  // 폼 초기화
  const resetForm = () => {
    setFormData({
      branch_name: '',
      branch_code: '',
      address: '',
      phone: '',
      latitude: '',
      longitude: '',
      attendance_radius_meters: '100',
      is_active: true,
      display_order: '0'
    })
    setFormErrors({})
    setSubmitError(null)
    setEditingBranch(null)
  }

  // 지점 추가/수정 Dialog 열기
  const openDialog = (branch?: ClinicBranch) => {
    if (branch) {
      setEditingBranch(branch)
      setFormData({
        branch_name: branch.branch_name,
        branch_code: branch.branch_code || '',
        address: branch.address || '',
        phone: branch.phone || '',
        latitude: branch.latitude?.toString() || '',
        longitude: branch.longitude?.toString() || '',
        attendance_radius_meters: branch.attendance_radius_meters.toString(),
        is_active: branch.is_active,
        display_order: branch.display_order.toString()
      })
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  // 폼 입력 핸들러
  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // 입력 시 해당 필드의 에러 제거
    if (formErrors[field]) {
      setFormErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // 지점 저장
  const handleSave = async () => {
    setSubmitError(null)

    // 유효성 검증
    const input: CreateBranchInput | UpdateBranchInput = editingBranch
      ? {
          branch_name: formData.branch_name,
          branch_code: formData.branch_code || undefined,
          address: formData.address || undefined,
          phone: formData.phone || undefined,
          latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
          longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
          attendance_radius_meters: parseInt(formData.attendance_radius_meters),
          is_active: formData.is_active,
          display_order: parseInt(formData.display_order)
        }
      : {
          clinic_id: '', // dataService에서 자동으로 설정됨
          branch_name: formData.branch_name,
          branch_code: formData.branch_code || undefined,
          address: formData.address || undefined,
          phone: formData.phone || undefined,
          latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
          longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
          attendance_radius_meters: parseInt(formData.attendance_radius_meters),
          is_active: formData.is_active,
          display_order: parseInt(formData.display_order)
        }

    const validation = validateBranch(input)
    if (!validation.isValid) {
      setFormErrors(validation.errors)
      return
    }

    try {
      let result
      if (editingBranch) {
        // 수정
        result = await dataService.updateBranch(editingBranch.id, input as UpdateBranchInput)
      } else {
        // 생성
        result = await dataService.createBranch(input as CreateBranchInput)
      }

      if (result.error) {
        setSubmitError(result.error)
      } else {
        setIsDialogOpen(false)
        resetForm()
        await loadBranches()
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.')
    }
  }

  // 삭제 확인 Dialog 열기
  const openDeleteDialog = (branch: ClinicBranch) => {
    setDeletingBranch(branch)
    setIsDeleteDialogOpen(true)
  }

  // 지점 삭제
  const handleDelete = async () => {
    if (!deletingBranch) return

    try {
      const result = await dataService.deleteBranch(deletingBranch.id)
      if (result.error) {
        alert(`삭제 실패: ${result.error}`)
      } else {
        setIsDeleteDialogOpen(false)
        setDeletingBranch(null)
        await loadBranches()
      }
    } catch (error) {
      alert(`삭제 중 오류가 발생했습니다: ${error}`)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-5">
        <div>
          <h2 className="flex items-center text-2xl font-semibold text-slate-800">
            <BuildingStorefrontIcon className="mr-2 h-6 w-6" />
            지점 관리
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            병원의 지점을 관리하고 출퇴근 위치를 설정합니다
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => openDialog()}
            className={buttonClass()}
          >
            <PlusIcon className="mr-2 h-5 w-5" />
            지점 추가
          </button>
        )}
      </div>
      <div className="px-6 pb-6 pt-2">
        {branches.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <BuildingStorefrontIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>등록된 지점이 없습니다.</p>
            {canManage && (
              <button
                type="button"
                className={buttonClass('outline')}
                onClick={() => openDialog()}
              >
                첫 지점 추가하기
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-sm font-medium text-slate-500">
                  <th className="pb-2 pr-4">지점명</th>
                  <th className="pb-2 pr-4">주소</th>
                  <th className="pb-2 pr-4">전화번호</th>
                  <th className="pb-2 pr-4 text-center">출근 반경</th>
                  <th className="pb-2 pr-4 text-center">상태</th>
                  {canManage && <th className="pb-2 pr-4 text-center">작업</th>}
                </tr>
              </thead>
              <tbody>
              {branches.map((branch) => (
                <tr
                  key={branch.id}
                  className="rounded-lg border border-slate-200 bg-white text-sm text-slate-700 shadow-sm transition hover:border-slate-300"
                >
                  <td className="rounded-l-lg px-4 py-3 font-medium text-slate-900">
                    {branch.branch_name}
                  </td>
                  <td className="px-4 py-3 align-top">{branch.address || '-'}</td>
                  <td className="px-4 py-3 align-top">{branch.phone || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {branch.latitude && branch.longitude
                      ? `${branch.attendance_radius_meters}m`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {branch.is_active ? (
                      <span className={badgeClass('active')}>활성</span>
                    ) : (
                      <span className={badgeClass('inactive')}>비활성</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="rounded-r-lg px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          className={buttonClass('outline', 'sm')}
                          onClick={() => openDialog(branch)}
                          aria-label="지점 수정"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className={buttonClass('destructive', 'sm')}
                            onClick={() => openDeleteDialog(branch)}
                            aria-label="지점 삭제"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 지점 추가/수정 모달 */}
      {isDialogOpen && (
        <Modal onClose={() => {
          setIsDialogOpen(false)
          resetForm()
        }}>
          <div className="space-y-4">
            <header>
              <h3 className="text-xl font-semibold text-slate-900">
                {editingBranch ? '지점 수정' : '새 지점 추가'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                지점 정보를 입력해주세요. 위치 정보를 입력하면 출퇴근 인증에 사용됩니다.
              </p>
            </header>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                {submitError}
              </div>
            )}

            {/* 지점명 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                지점명 <span className="text-red-500">*</span>
              </label>
              <input
                value={formData.branch_name}
                onChange={(e) => handleInputChange('branch_name', e.target.value)}
                placeholder="예: 본점, 강남점, 서초점"
                className={inputClassName}
              />
              {formErrors.branch_name && (
                <p className="text-red-500 text-sm mt-1">{formErrors.branch_name}</p>
              )}
            </div>

            {/* 지점 코드 */}
            <div>
              <label className="block text-sm font-medium mb-2">지점 코드 (선택)</label>
              <input
                value={formData.branch_code}
                onChange={(e) => handleInputChange('branch_code', e.target.value)}
                placeholder="예: GN01, SC02"
                className={inputClassName}
              />
            </div>

            {/* 주소 */}
            <div>
              <label className="block text-sm font-medium mb-2">주소</label>
              <input
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="서울시 강남구 ..."
                className={inputClassName}
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label className="block text-sm font-medium mb-2">전화번호</label>
              <input
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="02-123-4567"
                className={inputClassName}
              />
              {formErrors.phone && (
                <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>
              )}
            </div>

            {/* 위치 정보 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">위도</label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => handleInputChange('latitude', e.target.value)}
                  placeholder="37.123456"
                  className={inputClassName}
                />
                {formErrors.latitude && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.latitude}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">경도</label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => handleInputChange('longitude', e.target.value)}
                  placeholder="127.123456"
                  className={inputClassName}
                />
                {formErrors.longitude && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.longitude}</p>
                )}
              </div>
            </div>

            {/* 출근 인증 반경 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                출근 인증 반경 (미터)
              </label>
              <input
                type="number"
                value={formData.attendance_radius_meters}
                onChange={(e) => handleInputChange('attendance_radius_meters', e.target.value)}
                placeholder="100"
                className={inputClassName}
              />
              {formErrors.attendance_radius_meters && (
                <p className="text-red-500 text-sm mt-1">{formErrors.attendance_radius_meters}</p>
              )}
            </div>

            {/* 표시 순서 */}
            <div>
              <label className="block text-sm font-medium mb-2">표시 순서</label>
              <input
                type="number"
                value={formData.display_order}
                onChange={(e) => handleInputChange('display_order', e.target.value)}
                placeholder="0"
                className={inputClassName}
              />
            </div>

            {/* 활성 상태 */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleInputChange('is_active', !formData.is_active)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  formData.is_active ? 'bg-blue-600' : 'bg-slate-300'
                )}
                aria-pressed={formData.is_active}
                aria-label="활성 상태 토글"
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                    formData.is_active ? 'translate-x-5' : 'translate-x-1'
                  )}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">활성 상태</span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className={buttonClass('outline')}
                onClick={() => {
                  setIsDialogOpen(false)
                  resetForm()
                }}
              >
                취소
              </button>
              <button type="button" className={buttonClass()} onClick={handleSave}>
                {editingBranch ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 삭제 확인 모달 */}
      {isDeleteDialogOpen && (
        <Modal onClose={() => setIsDeleteDialogOpen(false)}>
          <header className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-900">지점 삭제 확인</h3>
            <p className="text-sm text-slate-600">
              &quot;{deletingBranch?.branch_name}&quot; 지점을 비활성화하시겠습니까?
              <br />
              <span className="text-xs text-slate-500">
                (비활성화된 지점은 목록에서 숨겨지지만 데이터는 보존됩니다)
              </span>
            </p>
          </header>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className={buttonClass('outline')}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              취소
            </button>
            <button
              type="button"
              className={buttonClass('destructive')}
              onClick={handleDelete}
            >
              비활성화
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const inputClassName =
  'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

type ButtonVariant = 'primary' | 'outline' | 'destructive'
type ButtonSize = 'md' | 'sm'

function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
  const variantClass: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    outline:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-slate-300',
    destructive:
      'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
  }
  const sizeClass: Record<ButtonSize, string> = {
    md: 'px-4 py-2 text-sm',
    sm: 'px-3 py-1.5 text-xs',
  }

  return cn(base, variantClass[variant], sizeClass[size])
}

type BadgeVariant = 'active' | 'inactive'

function badgeClass(variant: BadgeVariant) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'
  const styles: Record<BadgeVariant, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-slate-200 text-slate-600',
  }

  return cn(base, styles[variant])
}

interface ModalProps {
  onClose: () => void
  children: ReactNode
}

function Modal({ onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
