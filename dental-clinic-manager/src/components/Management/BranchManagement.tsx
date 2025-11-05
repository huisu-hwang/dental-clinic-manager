'use client'

import { useState, useEffect } from 'react'
import { dataService } from '@/lib/dataService'
import type { ClinicBranch, CreateBranchInput, UpdateBranchInput } from '@/types/branch'
import { validateBranch } from '@/types/branch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BuildingStorefrontIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'

interface BranchManagementProps {
  currentUser: {
    id: string
    role: string
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
  const canManage = currentUser.role === 'owner' || currentUser.role === 'manager'
  const canDelete = currentUser.role === 'owner'

  // 지점 목록 로드
  const loadBranches = async () => {
    setLoading(true)
    try {
      const result = await dataService.getBranches()
      if (result.error) {
        console.error('[BranchManagement] Error loading branches:', result.error)
      } else {
        setBranches(result.data || [])
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
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center text-2xl">
              <BuildingStorefrontIcon className="h-6 w-6 mr-2" />
              지점 관리
            </CardTitle>
            <CardDescription>병원의 지점을 관리하고 출퇴근 위치를 설정합니다</CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => openDialog()}>
              <PlusIcon className="h-5 w-5 mr-2" />
              지점 추가
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {branches.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <BuildingStorefrontIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>등록된 지점이 없습니다.</p>
            {canManage && (
              <Button className="mt-4" variant="outline" onClick={() => openDialog()}>
                첫 지점 추가하기
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>지점명</TableHead>
                <TableHead>주소</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead className="text-center">출근 반경</TableHead>
                <TableHead className="text-center">상태</TableHead>
                {canManage && <TableHead className="text-center">작업</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.branch_name}</TableCell>
                  <TableCell>{branch.address || '-'}</TableCell>
                  <TableCell>{branch.phone || '-'}</TableCell>
                  <TableCell className="text-center">
                    {branch.latitude && branch.longitude
                      ? `${branch.attendance_radius_meters}m`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {branch.is_active ? (
                      <Badge variant="default">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDialog(branch)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openDeleteDialog(branch)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* 지점 추가/수정 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBranch ? '지점 수정' : '새 지점 추가'}
            </DialogTitle>
            <DialogDescription>
              지점 정보를 입력해주세요. 위치 정보를 입력하면 출퇴근 인증에 사용됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
              <Input
                value={formData.branch_name}
                onChange={(e) => handleInputChange('branch_name', e.target.value)}
                placeholder="예: 본점, 강남점, 서초점"
              />
              {formErrors.branch_name && (
                <p className="text-red-500 text-sm mt-1">{formErrors.branch_name}</p>
              )}
            </div>

            {/* 지점 코드 */}
            <div>
              <label className="block text-sm font-medium mb-2">지점 코드 (선택)</label>
              <Input
                value={formData.branch_code}
                onChange={(e) => handleInputChange('branch_code', e.target.value)}
                placeholder="예: GN01, SC02"
              />
            </div>

            {/* 주소 */}
            <div>
              <label className="block text-sm font-medium mb-2">주소</label>
              <Input
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="서울시 강남구 ..."
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label className="block text-sm font-medium mb-2">전화번호</label>
              <Input
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="02-123-4567"
              />
              {formErrors.phone && (
                <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>
              )}
            </div>

            {/* 위치 정보 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">위도</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => handleInputChange('latitude', e.target.value)}
                  placeholder="37.123456"
                />
                {formErrors.latitude && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.latitude}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">경도</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => handleInputChange('longitude', e.target.value)}
                  placeholder="127.123456"
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
              <Input
                type="number"
                value={formData.attendance_radius_meters}
                onChange={(e) => handleInputChange('attendance_radius_meters', e.target.value)}
                placeholder="100"
              />
              {formErrors.attendance_radius_meters && (
                <p className="text-red-500 text-sm mt-1">{formErrors.attendance_radius_meters}</p>
              )}
            </div>

            {/* 표시 순서 */}
            <div>
              <label className="block text-sm font-medium mb-2">표시 순서</label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => handleInputChange('display_order', e.target.value)}
                placeholder="0"
              />
            </div>

            {/* 활성 상태 */}
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => handleInputChange('is_active', checked)}
              />
              <label className="text-sm font-medium">활성 상태</label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave}>
              {editingBranch ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지점 삭제 확인</DialogTitle>
            <DialogDescription>
              &quot;{deletingBranch?.branch_name}&quot; 지점을 비활성화하시겠습니까?
              <br />
              <span className="text-sm text-slate-500">
                (비활성화된 지점은 목록에서 숨겨지지만 데이터는 보존됩니다)
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              비활성화
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
