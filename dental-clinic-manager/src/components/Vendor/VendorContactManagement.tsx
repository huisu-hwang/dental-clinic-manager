'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { dataService } from '@/lib/dataService'
import Toast from '@/components/ui/Toast'
import * as XLSX from 'xlsx'
import {
  Search,
  Plus,
  Phone,
  Star,
  StarOff,
  Edit2,
  Trash2,
  Building2,
  User,
  Mail,
  MapPin,
  FileText,
  Upload,
  X,
  ChevronDown,
  Settings,
  PhoneCall,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download
} from 'lucide-react'
import type { VendorContact, VendorCategory, VendorContactFormData, VendorCategoryFormData, VendorContactImportData } from '@/types'

// 섹션 헤더 컴포넌트 (일일보고서 스타일)
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
    </div>
    <h3 className="text-sm sm:text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

// 전화번호 패턴 감지 함수
const isPhoneNumber = (value: string): boolean => {
  if (!value || typeof value !== 'string') return false
  const cleaned = value.replace(/[\s\-\.\(\)]/g, '')
  // 한국 전화번호 패턴: 02, 031~064, 010~019, 070, 080, 1588 등
  const phonePatterns = [
    /^0\d{1,2}\d{7,8}$/, // 지역번호 + 번호
    /^01[0-9]\d{7,8}$/, // 휴대폰
    /^070\d{7,8}$/, // 인터넷전화
    /^080\d{7,8}$/, // 수신자부담
    /^1[5-9]\d{2}\d{4}$/, // 대표번호 (1588, 1544 등)
    /^0\d{9,11}$/, // 일반 전화번호 패턴
  ]
  return phonePatterns.some(pattern => pattern.test(cleaned))
}

// 데이터에서 전화번호 컬럼 자동 감지
const detectPhoneColumns = (data: string[][]): number[] => {
  if (data.length < 2) return []

  const phoneColumnIndices: number[] = []
  const headerRow = data[0] || []
  const sampleRows = data.slice(1, Math.min(6, data.length))

  for (let colIdx = 0; colIdx < (data[0]?.length || 0); colIdx++) {
    const header = (headerRow[colIdx] || '').toLowerCase()
    // 헤더에 전화, phone, tel, 연락처 등이 있으면 전화번호 컬럼으로 간주
    if (header.includes('전화') || header.includes('phone') || header.includes('tel') ||
        header.includes('연락') || header.includes('핸드폰') || header.includes('휴대')) {
      phoneColumnIndices.push(colIdx)
      continue
    }

    // 샘플 데이터에서 전화번호 패턴 감지
    let phoneCount = 0
    for (const row of sampleRows) {
      if (row[colIdx] && isPhoneNumber(String(row[colIdx]))) {
        phoneCount++
      }
    }
    // 50% 이상이 전화번호 패턴이면 전화번호 컬럼으로 간주
    if (phoneCount >= sampleRows.length * 0.5) {
      phoneColumnIndices.push(colIdx)
    }
  }

  return phoneColumnIndices
}

export default function VendorContactManagement() {
  const { hasPermission } = usePermissions()

  // 권한 체크
  const canView = hasPermission('vendor_contacts_view')
  const canCreate = hasPermission('vendor_contacts_create')
  const canEdit = hasPermission('vendor_contacts_edit')
  const canDelete = hasPermission('vendor_contacts_delete')
  const canImport = hasPermission('vendor_contacts_import')

  // 상태 관리
  const [contacts, setContacts] = useState<VendorContact[]>([])
  const [categories, setCategories] = useState<VendorCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // 모달 상태
  const [showContactModal, setShowContactModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  // 선택 상태
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())

  // 폼 상태
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null)
  const [editingCategory, setEditingCategory] = useState<VendorCategory | null>(null)
  const [contactForm, setContactForm] = useState<VendorContactFormData>({
    company_name: '',
    category_id: '',
    contact_person: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    notes: '',
    is_favorite: false
  })
  const [categoryForm, setCategoryForm] = useState<VendorCategoryFormData>({
    name: '',
    description: '',
    color: '#3B82F6'
  })

  // 파일 업로드 관련 상태
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [importPreview, setImportPreview] = useState<VendorContactImportData[]>([])
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload')
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!canView) return

    setLoading(true)
    try {
      const [contactsResult, categoriesResult] = await Promise.all([
        dataService.getVendorContacts({
          categoryId: selectedCategory || undefined,
          searchQuery: searchQuery || undefined,
          isFavorite: showFavoritesOnly ? true : undefined
        }),
        dataService.getVendorCategories()
      ])

      if (contactsResult.data) {
        setContacts(contactsResult.data)
      }
      if (categoriesResult.data) {
        setCategories(categoriesResult.data)
      }
    } catch (error) {
      console.error('Failed to load vendor contacts:', error)
      showToast('데이터를 불러오는데 실패했습니다.', 'error')
    } finally {
      setLoading(false)
    }
  }, [canView, selectedCategory, searchQuery, showFavoritesOnly])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 검색 필터링된 연락처
  const filteredContacts = useMemo(() => {
    return contacts
  }, [contacts])

  // 연락처 저장
  const handleSaveContact = async () => {
    if (!contactForm.company_name.trim()) {
      showToast('업체명을 입력해주세요.', 'warning')
      return
    }

    try {
      if (editingContact) {
        const result = await dataService.updateVendorContact(editingContact.id, contactForm)
        if (result.error) {
          showToast(`수정 실패: ${result.error}`, 'error')
          return
        }
        showToast('업체 정보가 수정되었습니다.', 'success')
      } else {
        const result = await dataService.createVendorContact(contactForm)
        if (result.error) {
          showToast(`등록 실패: ${result.error}`, 'error')
          return
        }
        showToast('새 업체가 등록되었습니다.', 'success')
      }

      setShowContactModal(false)
      resetContactForm()
      loadData()
    } catch (error) {
      showToast('저장에 실패했습니다.', 'error')
    }
  }

  // 연락처 삭제
  const handleDeleteContact = async (contactId: string) => {
    try {
      const result = await dataService.deleteVendorContact(contactId)
      if (result.error) {
        showToast(`삭제 실패: ${result.error}`, 'error')
        return
      }
      showToast('업체가 삭제되었습니다.', 'success')
      setShowDeleteConfirm(null)
      setSelectedContacts(prev => {
        const newSet = new Set(prev)
        newSet.delete(contactId)
        return newSet
      })
      loadData()
    } catch (error) {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  // 선택 토글
  const toggleSelectContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(contactId)) {
        newSet.delete(contactId)
      } else {
        newSet.add(contactId)
      }
      return newSet
    })
  }

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)))
    }
  }

  // 선택 항목 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return

    let successCount = 0
    let failCount = 0

    for (const contactId of selectedContacts) {
      try {
        const result = await dataService.deleteVendorContact(contactId)
        if (result.error) {
          failCount++
        } else {
          successCount++
        }
      } catch {
        failCount++
      }
    }

    setShowBulkDeleteConfirm(false)
    setSelectedContacts(new Set())

    if (successCount > 0) {
      showToast(`${successCount}개 업체가 삭제되었습니다.${failCount > 0 ? ` (${failCount}개 실패)` : ''}`, 'success')
      loadData()
    } else {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  // 즐겨찾기 토글
  const handleToggleFavorite = async (contact: VendorContact) => {
    try {
      const result = await dataService.toggleVendorContactFavorite(contact.id, !contact.is_favorite)
      if (result.error) {
        showToast(`즐겨찾기 변경 실패: ${result.error}`, 'error')
        return
      }
      loadData()
    } catch (error) {
      showToast('즐겨찾기 변경에 실패했습니다.', 'error')
    }
  }

  // 카테고리 저장
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      showToast('카테고리명을 입력해주세요.', 'warning')
      return
    }

    try {
      if (editingCategory) {
        const result = await dataService.updateVendorCategory(editingCategory.id, categoryForm)
        if (result.error) {
          showToast(`수정 실패: ${result.error}`, 'error')
          return
        }
        showToast('카테고리가 수정되었습니다.', 'success')
      } else {
        const result = await dataService.createVendorCategory(categoryForm)
        if (result.error) {
          showToast(`등록 실패: ${result.error}`, 'error')
          return
        }
        showToast('새 카테고리가 등록되었습니다.', 'success')
      }

      setShowCategoryModal(false)
      resetCategoryForm()
      loadData()
    } catch (error) {
      showToast('저장에 실패했습니다.', 'error')
    }
  }

  // 카테고리 삭제
  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const result = await dataService.deleteVendorCategory(categoryId)
      if (result.error) {
        showToast(`삭제 실패: ${result.error}`, 'error')
        return
      }
      showToast('카테고리가 삭제되었습니다.', 'success')
      setShowCategoryModal(false)
      resetCategoryForm()
      if (selectedCategory === categoryId) {
        setSelectedCategory('')
      }
      loadData()
    } catch (error) {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  // 파일 파싱 (CSV/TXT/Excel 지원) - 모든 데이터 빠짐없이 캡처
  const parseFile = async (file: File): Promise<VendorContactImportData[]> => {
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    const contacts: VendorContactImportData[] = []

    // 2D 배열로 파일 데이터 읽기
    let data: string[][] = []
    let headers: string[] = []

    if (extension === '.xlsx' || extension === '.xls') {
      // Excel 파일 처리
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) return contacts

      const worksheet = workbook.Sheets[sheetName]
      const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })
      data = rawData.map(row =>
        (Array.isArray(row) ? row : []).map(cell => String(cell ?? '').trim())
      )
    } else {
      // CSV/TXT 파일 처리
      const text = await file.text()
      const lines = text.trim().split('\n')

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        let parts: string[]
        if (trimmedLine.includes('\t')) {
          parts = trimmedLine.split('\t')
        } else if (trimmedLine.includes(';')) {
          parts = trimmedLine.split(';')
        } else {
          parts = trimmedLine.split(',')
        }
        data.push(parts.map(p => p.trim()))
      }
    }

    if (data.length < 1) return contacts

    // 첫 줄이 헤더인지 확인
    const firstRowLower = (data[0] || []).join(' ').toLowerCase()
    const hasHeaderRow = firstRowLower.includes('업체') || firstRowLower.includes('회사') ||
                         firstRowLower.includes('전화') || firstRowLower.includes('phone') ||
                         firstRowLower.includes('company') || firstRowLower.includes('상호') ||
                         firstRowLower.includes('이름') || firstRowLower.includes('담당')

    if (hasHeaderRow) {
      headers = data[0] || []
      data = data.slice(1)
    } else {
      // 헤더가 없으면 기본 헤더 생성
      const maxCols = Math.max(...data.map(row => row.length))
      headers = Array.from({ length: maxCols }, (_, i) => `컬럼${i + 1}`)
    }

    // 컬럼 매핑 분석
    const columnMap: Record<string, number> = {}
    const mappedColumns = new Set<number>()

    headers.forEach((header, idx) => {
      const h = (header || '').toLowerCase()

      // 업체명/회사명
      if ((h.includes('업체') || h.includes('회사') || h.includes('company') || h.includes('상호') || h.includes('거래처'))
          && !('company_name' in columnMap)) {
        columnMap.company_name = idx
        mappedColumns.add(idx)
      }
      // 담당자
      else if ((h.includes('담당') || h.includes('contact') || h.includes('성명') || h === '이름')
          && !('contact_person' in columnMap)) {
        columnMap.contact_person = idx
        mappedColumns.add(idx)
      }
      // 카테고리
      else if ((h.includes('카테고리') || h.includes('분류') || h.includes('category') || h.includes('종류') || h.includes('구분'))
          && !('category_name' in columnMap)) {
        columnMap.category_name = idx
        mappedColumns.add(idx)
      }
      // 이메일
      else if ((h.includes('이메일') || h.includes('email') || h.includes('메일') || h.includes('e-mail'))
          && !('email' in columnMap)) {
        columnMap.email = idx
        mappedColumns.add(idx)
      }
      // 주소
      else if ((h.includes('주소') || h.includes('address') || h.includes('소재지'))
          && !('address' in columnMap)) {
        columnMap.address = idx
        mappedColumns.add(idx)
      }
      // 메모/비고
      else if ((h.includes('메모') || h.includes('비고') || h.includes('note') || h.includes('remarks') || h.includes('참고'))
          && !('notes' in columnMap)) {
        columnMap.notes = idx
        mappedColumns.add(idx)
      }
      // 전화번호
      else if ((h.includes('전화') || h.includes('phone') || h.includes('tel') || h.includes('연락') ||
                h.includes('핸드폰') || h.includes('휴대') || h.includes('모바일') || h.includes('번호'))) {
        if (!('phone' in columnMap)) {
          columnMap.phone = idx
          mappedColumns.add(idx)
        } else if (!('phone2' in columnMap)) {
          columnMap.phone2 = idx
          mappedColumns.add(idx)
        }
      }
    })

    // 전화번호 컬럼 자동 감지 (헤더로 못 찾은 경우)
    const phoneColumns = detectPhoneColumns([headers, ...data.slice(0, 5)])
    phoneColumns.forEach((colIdx) => {
      if (!mappedColumns.has(colIdx)) {
        if (!('phone' in columnMap)) {
          columnMap.phone = colIdx
          mappedColumns.add(colIdx)
        } else if (!('phone2' in columnMap)) {
          columnMap.phone2 = colIdx
          mappedColumns.add(colIdx)
        }
      }
    })

    // 업체명 컬럼을 못 찾았으면 첫 번째 컬럼을 업체명으로
    if (!('company_name' in columnMap) && headers.length > 0) {
      columnMap.company_name = 0
      mappedColumns.add(0)
    }

    // 데이터 파싱
    for (const row of data) {
      if (!row || row.every(cell => !cell)) continue

      // 업체명 가져오기
      let companyName = row[columnMap.company_name] || ''

      // 업체명이 없으면 첫 번째 비어있지 않은 셀을 업체명으로
      if (!companyName) {
        for (let i = 0; i < row.length; i++) {
          if (row[i] && row[i].trim()) {
            companyName = row[i].trim()
            break
          }
        }
      }

      if (!companyName) continue // 업체명이 없으면 스킵

      // 전화번호 가져오기 - 매핑된 컬럼에서
      let phone = columnMap.phone !== undefined ? row[columnMap.phone] || '' : ''
      let phone2 = columnMap.phone2 !== undefined ? row[columnMap.phone2] || '' : ''

      // 전화번호가 없으면 전체 row에서 탐색
      if (!phone || !isPhoneNumber(phone)) {
        for (let j = 0; j < row.length; j++) {
          if (row[j] && isPhoneNumber(row[j])) {
            if (!phone || !isPhoneNumber(phone)) {
              phone = row[j]
            } else if (!phone2) {
              phone2 = row[j]
            }
          }
        }
      }

      // 매핑되지 않은 추가 데이터 수집
      const extra_data: Record<string, string> = {}
      headers.forEach((header, idx) => {
        if (!mappedColumns.has(idx) && row[idx] && row[idx].trim()) {
          const headerName = header || `컬럼${idx + 1}`
          extra_data[headerName] = row[idx].trim()
        }
      })

      contacts.push({
        company_name: companyName,
        phone: phone || undefined,
        phone2: phone2 || undefined,
        category_name: columnMap.category_name !== undefined ? row[columnMap.category_name] || undefined : undefined,
        contact_person: columnMap.contact_person !== undefined ? row[columnMap.contact_person] || undefined : undefined,
        email: columnMap.email !== undefined ? row[columnMap.email] || undefined : undefined,
        address: columnMap.address !== undefined ? row[columnMap.address] || undefined : undefined,
        notes: columnMap.notes !== undefined ? row[columnMap.notes] || undefined : undefined,
        extra_data: Object.keys(extra_data).length > 0 ? extra_data : undefined
      })
    }

    return contacts
  }

  // 파일 선택 처리
  const handleFileSelect = async (file: File) => {
    const validExtensions = ['.csv', '.txt', '.xls', '.xlsx']
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()

    if (!validExtensions.includes(extension)) {
      showToast('CSV, TXT, XLS, XLSX 파일만 업로드 가능합니다.', 'error')
      return
    }

    try {
      const parsed = await parseFile(file)
      if (parsed.length === 0) {
        showToast('유효한 데이터가 없습니다. 파일 형식을 확인해주세요.', 'warning')
        return
      }
      setImportPreview(parsed)
      setImportStep('preview')
    } catch (error) {
      console.error('File parsing error:', error)
      showToast('파일을 읽는 중 오류가 발생했습니다.', 'error')
    }
  }

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      await handleFileSelect(file)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleFileSelect(file)
    }
  }

  // 미리보기에서 항목 제거
  const removePreviewItem = (index: number) => {
    setImportPreview(prev => prev.filter((_, i) => i !== index))
  }

  // 미리보기에서 항목 수정
  const updatePreviewItem = (index: number, field: keyof VendorContactImportData, value: string) => {
    setImportPreview(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ))
  }

  // 일괄 등록 실행
  const handleImport = async () => {
    if (importPreview.length === 0) {
      showToast('등록할 데이터가 없습니다.', 'warning')
      return
    }

    setIsImporting(true)
    try {
      const result = await dataService.importVendorContacts(importPreview)
      setImportResult(result)
      setImportStep('result')

      if (result.success > 0) {
        loadData()
      }
    } catch (error) {
      showToast('일괄 등록 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsImporting(false)
    }
  }

  // 폼 초기화
  const resetContactForm = () => {
    setEditingContact(null)
    setContactForm({
      company_name: '',
      category_id: '',
      contact_person: '',
      phone: '',
      phone2: '',
      email: '',
      address: '',
      notes: '',
      is_favorite: false
    })
  }

  const resetCategoryForm = () => {
    setEditingCategory(null)
    setCategoryForm({
      name: '',
      description: '',
      color: '#3B82F6'
    })
  }

  const resetImportModal = () => {
    setImportStep('upload')
    setImportPreview([])
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 연락처 수정 모달 열기
  const openEditContact = (contact: VendorContact) => {
    setEditingContact(contact)
    setContactForm({
      company_name: contact.company_name,
      category_id: contact.category_id || '',
      contact_person: contact.contact_person || '',
      phone: contact.phone,
      phone2: contact.phone2 || '',
      email: contact.email || '',
      address: contact.address || '',
      notes: contact.notes || '',
      is_favorite: contact.is_favorite
    })
    setShowContactModal(true)
  }

  // 카테고리 수정 모달 열기
  const openEditCategory = (category: VendorCategory) => {
    setEditingCategory(category)
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      color: category.color
    })
    setShowCategoryModal(true)
  }

  // 전화 걸기 (모바일)
  const makePhoneCall = (phone: string) => {
    window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`
  }

  // 전화번호 포맷팅
  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/[^0-9]/g, '')
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
    } else if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    } else if (cleaned.length === 9) {
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`
    } else if (cleaned.length === 8) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
    }
    return phone
  }

  // 샘플 파일 다운로드
  const downloadSampleFile = () => {
    const sampleData = `업체명,전화번호,카테고리,담당자,전화번호2,이메일,주소,메모
ABC의료기,02-1234-5678,의료장비,홍길동,010-1111-2222,abc@example.com,서울시 강남구,정기 점검 업체
XYZ기공소,031-9876-5432,기공,김철수,,,경기도 성남시,
가나다치과재료,010-5555-6666,재료,,,,서울시 서초구,월요일 배송`

    const blob = new Blob(['\ufeff' + sampleData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '업체연락처_샘플.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!canView) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-gray-500">
        업체 연락처를 조회할 권한이 없습니다.
      </div>
    )
  }

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F97316'
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 헤더 - 일일보고서 스타일 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">업체 연락처 관리</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Vendor Contacts</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {loading && (
              <span className="px-2 sm:px-3 py-1 bg-white/20 rounded-full text-white text-xs">
                로딩 중...
              </span>
            )}
            <span className="px-2 sm:px-3 py-1 bg-white/20 rounded-full text-white text-xs">
              {contacts.length}개 업체
            </span>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* 1. 검색 및 필터 섹션 */}
        <div>
          <SectionHeader number={1} title="검색 및 필터" icon={Search} />
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 검색 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="업체명, 담당자, 전화번호 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* 카테고리 필터 */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none w-full sm:w-auto pl-4 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
              >
                <option value="">전체 카테고리</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* 즐겨찾기 필터 */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg border transition-colors text-sm ${
                showFavoritesOnly
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-yellow-400' : ''}`} />
              <span>즐겨찾기</span>
            </button>
          </div>
        </div>

        {/* 2. 액션 버튼 섹션 */}
        {canCreate && (
          <div>
            <SectionHeader number={2} title="업체 관리" icon={Settings} />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  resetContactForm()
                  setShowContactModal(true)
                }}
                className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>새 업체 등록</span>
              </button>
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>카테고리 관리</span>
              </button>
              {canImport && (
                <button
                  onClick={() => {
                    resetImportModal()
                    setShowImportModal(true)
                  }}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>파일로 일괄 등록</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. 업체 목록 섹션 */}
        <div>
          <SectionHeader number={canCreate ? 3 : 2} title="업체 목록" icon={Building2} />

          {/* 선택 툴바 */}
          {canDelete && filteredContacts.length > 0 && (
            <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">전체 선택</span>
                </label>
                {selectedContacts.size > 0 && (
                  <span className="text-sm text-blue-600 font-medium">
                    {selectedContacts.size}개 선택됨
                  </span>
                )}
              </div>
              {selectedContacts.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  선택 삭제 ({selectedContacts.size})
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-3 text-slate-500 text-sm">데이터를 불러오는 중...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                {searchQuery || selectedCategory || showFavoritesOnly
                  ? '검색 결과가 없습니다.'
                  : '등록된 업체가 없습니다.'}
              </p>
              {canCreate && !searchQuery && !selectedCategory && !showFavoritesOnly && (
                <button
                  onClick={() => {
                    resetContactForm()
                    setShowContactModal(true)
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  첫 번째 업체 등록하기
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    selectedContacts.has(contact.id)
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* 체크박스 */}
                    {canDelete && (
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedContacts.has(contact.id)}
                          onChange={() => toggleSelectContact(contact.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    )}

                    {/* 업체 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {contact.is_favorite && (
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                        )}
                        <h4 className="font-semibold text-slate-800 truncate">
                          {contact.company_name}
                        </h4>
                        {contact.category && (
                          <span
                            className="px-2 py-0.5 text-xs rounded-full text-white flex-shrink-0"
                            style={{ backgroundColor: contact.category.color }}
                          >
                            {contact.category.name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        {contact.contact_person && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {contact.contact_person}
                          </span>
                        )}
                        {contact.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {contact.email}
                          </span>
                        )}
                        {contact.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {contact.address}
                          </span>
                        )}
                      </div>

                      {contact.notes && (
                        <p className="mt-2 text-sm text-slate-500 flex items-start gap-1">
                          <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                          <span className="line-clamp-2">{contact.notes}</span>
                        </p>
                      )}
                    </div>

                    {/* 전화번호 및 액션 */}
                    <div className="flex flex-col items-end gap-2">
                      {/* 전화번호 */}
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => makePhoneCall(contact.phone)}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                          <PhoneCall className="w-4 h-4" />
                          <span>{formatPhone(contact.phone)}</span>
                        </button>
                        {contact.phone2 && (
                          <button
                            onClick={() => makePhoneCall(contact.phone2!)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{formatPhone(contact.phone2)}</span>
                          </button>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleFavorite(contact)}
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                          title={contact.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                        >
                          {contact.is_favorite ? (
                            <StarOff className="w-4 h-4 text-slate-400" />
                          ) : (
                            <Star className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEditContact(contact)}
                            className="p-2 hover:bg-white rounded-lg transition-colors"
                            title="수정"
                          >
                            <Edit2 className="w-4 h-4 text-slate-400" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setShowDeleteConfirm(contact.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 연락처 추가/수정 모달 */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-semibold text-white">
                {editingContact ? '업체 정보 수정' : '새 업체 등록'}
              </h3>
              <button
                onClick={() => {
                  setShowContactModal(false)
                  resetContactForm()
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 업체명 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  업체명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactForm.company_name}
                  onChange={(e) => setContactForm({ ...contactForm, company_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="업체명을 입력하세요"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  카테고리
                </label>
                <select
                  value={contactForm.category_id}
                  onChange={(e) => setContactForm({ ...contactForm, category_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">카테고리 선택</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* 담당자 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  담당자
                </label>
                <input
                  type="text"
                  value={contactForm.contact_person}
                  onChange={(e) => setContactForm({ ...contactForm, contact_person: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="담당자명"
                />
              </div>

              {/* 전화번호 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    전화번호
                  </label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="010-0000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    전화번호 2
                  </label>
                  <input
                    type="tel"
                    value={contactForm.phone2}
                    onChange={(e) => setContactForm({ ...contactForm, phone2: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="추가 연락처"
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="email@example.com"
                />
              </div>

              {/* 주소 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  주소
                </label>
                <input
                  type="text"
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="주소를 입력하세요"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  메모
                </label>
                <textarea
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  rows={3}
                  placeholder="추가 메모"
                />
              </div>

              {/* 즐겨찾기 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contactForm.is_favorite}
                  onChange={(e) => setContactForm({ ...contactForm, is_favorite: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-slate-700">즐겨찾기에 추가</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t px-6 py-4 flex justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => {
                  setShowContactModal(false)
                  resetContactForm()
                }}
                className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSaveContact}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {editingContact ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 관리 모달 */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-semibold text-white">카테고리 관리</h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  resetCategoryForm()
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 기존 카테고리 목록 */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3">기존 카테고리</h4>
                {categories.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg text-center">
                    등록된 카테고리가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categories.map(cat => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-medium text-sm">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditCategory(cat)}
                            className="p-1.5 hover:bg-white rounded transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-slate-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 hover:bg-white rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <hr className="border-slate-200" />

              {/* 카테고리 추가/수정 폼 */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3">
                  {editingCategory ? '카테고리 수정' : '새 카테고리 추가'}
                </h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="카테고리명"
                  />
                  <input
                    type="text"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="설명 (선택)"
                  />
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">색상 선택</label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map(color => (
                        <button
                          key={color}
                          onClick={() => setCategoryForm({ ...categoryForm, color })}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            categoryForm.color === color ? 'border-slate-800 scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {editingCategory && (
                      <button
                        onClick={resetCategoryForm}
                        className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleSaveCategory}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {editingCategory ? '수정' : '추가'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 등록 모달 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">파일로 업체 일괄 등록</h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false)
                  resetImportModal()
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6">
              {/* 단계 1: 파일 업로드 */}
              {importStep === 'upload' && (
                <div className="space-y-6">
                  {/* 파일 업로드 영역 */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                      isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.xls,.xlsx"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
                    <p className="text-slate-700 font-medium mb-2">
                      파일을 드래그하여 놓거나 클릭하여 선택하세요
                    </p>
                    <p className="text-sm text-slate-500 mb-4">
                      Excel(.xlsx, .xls), CSV, TXT 파일 지원
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      파일 선택
                    </button>
                  </div>

                  {/* 파일 형식 안내 */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-600" />
                      파일 형식 안내
                    </h4>
                    <p className="text-sm text-slate-600 mb-3">
                      엑셀 파일(.xlsx, .xls)을 직접 업로드하거나 CSV 파일을 사용하세요.
                    </p>
                    <div className="bg-white rounded-lg p-3 border border-slate-200 text-sm text-slate-600 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold">✓</span>
                        <span><strong>자동 컬럼 인식:</strong> 헤더명을 기반으로 컬럼을 자동 매핑합니다</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold">✓</span>
                        <span><strong>전화번호 자동 감지:</strong> 전화번호가 어느 열에 있든 자동으로 찾습니다</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold">✓</span>
                        <span><strong>유연한 형식:</strong> 열 순서가 달라도 자동 처리됩니다</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">
                      * 업체명은 필수입니다. 전화번호가 없어도 등록은 가능합니다.
                    </p>
                    <button
                      onClick={downloadSampleFile}
                      className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Download className="w-4 h-4" />
                      샘플 파일 다운로드
                    </button>
                  </div>
                </div>
              )}

              {/* 단계 2: 미리보기 */}
              {importStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-800">
                      등록할 업체 목록 ({importPreview.length}개)
                    </h4>
                    <button
                      onClick={() => setImportStep('upload')}
                      className="text-sm text-slate-600 hover:text-slate-800"
                    >
                      다시 선택
                    </button>
                  </div>

                  {/* 카테고리 자동 생성 안내 */}
                  {importPreview.some(item => item.category_name) && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm text-green-700">
                        <strong>카테고리 자동 생성:</strong> 파일에 포함된 카테고리가 자동으로 생성됩니다.
                      </p>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-x-auto overflow-y-auto">
                      <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">업체명</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">전화번호</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">카테고리</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">담당자</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">이메일</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">주소</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">추가정보</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importPreview.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-50">
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.company_name}
                                  onChange={(e) => updatePreviewItem(index, 'company_name', e.target.value)}
                                  className="w-full min-w-[120px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.phone || ''}
                                  onChange={(e) => updatePreviewItem(index, 'phone', e.target.value)}
                                  className="w-full min-w-[100px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                  placeholder="-"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.category_name || ''}
                                  onChange={(e) => updatePreviewItem(index, 'category_name', e.target.value)}
                                  className="w-full min-w-[80px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                  placeholder="-"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.contact_person || ''}
                                  onChange={(e) => updatePreviewItem(index, 'contact_person', e.target.value)}
                                  className="w-full min-w-[80px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                  placeholder="-"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.email || ''}
                                  onChange={(e) => updatePreviewItem(index, 'email', e.target.value)}
                                  className="w-full min-w-[120px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                  placeholder="-"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.address || ''}
                                  onChange={(e) => updatePreviewItem(index, 'address', e.target.value)}
                                  className="w-full min-w-[150px] px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-sm"
                                  placeholder="-"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {item.extra_data && Object.keys(item.extra_data).length > 0 ? (
                                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded" title={
                                    Object.entries(item.extra_data).map(([k, v]) => `${k}: ${v}`).join('\n')
                                  }>
                                    +{Object.keys(item.extra_data).length}개
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removePreviewItem(index)}
                                  className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-blue-700">
                      <strong>팁:</strong> 표에서 직접 값을 수정할 수 있습니다. 등록하지 않을 항목은 X 버튼으로 제거하세요.
                    </p>
                    {importPreview.some(item => item.extra_data) && (
                      <p className="text-sm text-blue-600">
                        <strong>추가정보:</strong> 매핑되지 않은 컬럼 데이터는 메모에 자동 저장됩니다.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 단계 3: 결과 */}
              {importStep === 'result' && importResult && (
                <div className="space-y-4">
                  <div className={`p-6 rounded-xl text-center ${
                    importResult.success > 0 ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    {importResult.success > 0 ? (
                      <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    ) : (
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                    )}
                    <h4 className="text-lg font-semibold text-slate-800 mb-2">
                      {importResult.success > 0 ? '등록 완료' : '등록 실패'}
                    </h4>
                    <p className="text-slate-600">
                      {importResult.success}개 성공
                      {importResult.failed > 0 && `, ${importResult.failed}개 실패`}
                    </p>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h5 className="font-medium text-red-800 mb-2">오류 내역</h5>
                      <ul className="text-sm text-red-700 space-y-1">
                        {importResult.errors.slice(0, 5).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li className="text-red-600">
                            외 {importResult.errors.length - 5}개 오류
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t px-6 py-4 flex justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => {
                  setShowImportModal(false)
                  resetImportModal()
                }}
                className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                {importStep === 'result' ? '닫기' : '취소'}
              </button>
              {importStep === 'preview' && (
                <button
                  onClick={handleImport}
                  disabled={isImporting || importPreview.length === 0}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      등록 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {importPreview.length}개 업체 등록
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">업체 삭제</h3>
            </div>
            <p className="text-slate-600 mb-6">
              이 업체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteContact(showDeleteConfirm)}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 삭제 확인 모달 */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">일괄 삭제</h3>
            </div>
            <p className="text-slate-600 mb-2">
              선택한 <strong className="text-red-600">{selectedContacts.size}개</strong> 업체를 삭제하시겠습니까?
            </p>
            <p className="text-sm text-slate-500 mb-6">
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {selectedContacts.size}개 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}
