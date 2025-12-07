'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { dataService } from '@/lib/dataService'
import Toast from '@/components/ui/Toast'
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
  Tag,
  Upload,
  X,
  ChevronDown,
  Settings,
  PhoneCall
} from 'lucide-react'
import type { VendorContact, VendorCategory, VendorContactFormData, VendorCategoryFormData, VendorContactImportData } from '@/types'

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
  const [importData, setImportData] = useState('')

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

  // 검색 필터링된 연락처 (클라이언트 사이드 필터링)
  const filteredContacts = useMemo(() => {
    return contacts
  }, [contacts])

  // 연락처 저장
  const handleSaveContact = async () => {
    if (!contactForm.company_name.trim()) {
      showToast('업체명을 입력해주세요.', 'warning')
      return
    }
    if (!contactForm.phone.trim()) {
      showToast('전화번호를 입력해주세요.', 'warning')
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
      loadData()
    } catch (error) {
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

  // 일괄 등록
  const handleImport = async () => {
    if (!importData.trim()) {
      showToast('데이터를 입력해주세요.', 'warning')
      return
    }

    try {
      // 탭 또는 쉼표로 구분된 데이터 파싱
      const lines = importData.trim().split('\n')
      const contacts: VendorContactImportData[] = []

      for (const line of lines) {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',')
        if (parts.length >= 2) {
          contacts.push({
            company_name: parts[0]?.trim() || '',
            phone: parts[1]?.trim() || '',
            category_name: parts[2]?.trim() || undefined,
            contact_person: parts[3]?.trim() || undefined,
            phone2: parts[4]?.trim() || undefined,
            email: parts[5]?.trim() || undefined,
            address: parts[6]?.trim() || undefined,
            notes: parts[7]?.trim() || undefined
          })
        }
      }

      if (contacts.length === 0) {
        showToast('유효한 데이터가 없습니다.', 'warning')
        return
      }

      const result = await dataService.importVendorContacts(contacts)

      if (result.success > 0) {
        showToast(`${result.success}개 업체가 등록되었습니다.${result.failed > 0 ? ` (${result.failed}개 실패)` : ''}`, 'success')
        setShowImportModal(false)
        setImportData('')
        loadData()
      } else {
        showToast(`등록 실패: ${result.errors.join(', ')}`, 'error')
      }
    } catch (error) {
      showToast('일괄 등록에 실패했습니다.', 'error')
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

  if (!canView) {
    return (
      <div className="p-8 text-center text-gray-500">
        업체 연락처를 조회할 권한이 없습니다.
      </div>
    )
  }

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F97316'
  ]

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">업체 연락처</h2>
              <p className="text-teal-100 text-sm">Vendor Contacts</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {canCreate && (
              <>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="flex items-center space-x-1 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">카테고리</span>
                </button>
                {canImport && (
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center space-x-1 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">일괄 등록</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    resetContactForm()
                    setShowContactModal(true)
                  }}
                  className="flex items-center space-x-1 px-3 py-2 bg-white text-teal-700 hover:bg-teal-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 업체</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="업체명, 담당자, 전화번호 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* 카테고리 필터 */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
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
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
              showFavoritesOnly
                ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-yellow-400' : ''}`} />
            <span className="text-sm">즐겨찾기</span>
          </button>
        </div>
      </div>

      {/* 연락처 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
            <p className="mt-2 text-gray-500">로딩 중...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery || selectedCategory || showFavoritesOnly
              ? '검색 결과가 없습니다.'
              : '등록된 업체가 없습니다.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* 업체 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {contact.is_favorite && (
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                      )}
                      <h3 className="font-semibold text-gray-900 truncate">
                        {contact.company_name}
                      </h3>
                      {contact.category && (
                        <span
                          className="px-2 py-0.5 text-xs rounded-full text-white flex-shrink-0"
                          style={{ backgroundColor: contact.category.color }}
                        >
                          {contact.category.name}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      {contact.contact_person && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {contact.contact_person}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {contact.email}
                        </span>
                      )}
                      {contact.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {contact.address}
                        </span>
                      )}
                    </div>

                    {contact.notes && (
                      <p className="mt-1 text-sm text-gray-500 flex items-start gap-1">
                        <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
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
                        className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <PhoneCall className="w-4 h-4" />
                        {formatPhone(contact.phone)}
                      </button>
                      {contact.phone2 && (
                        <button
                          onClick={() => makePhoneCall(contact.phone2!)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {formatPhone(contact.phone2)}
                        </button>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleFavorite(contact)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title={contact.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        {contact.is_favorite ? (
                          <StarOff className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Star className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => openEditContact(contact)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4 text-gray-400" />
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

      {/* 연락처 추가/수정 모달 */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingContact ? '업체 정보 수정' : '새 업체 등록'}
              </h3>
              <button
                onClick={() => {
                  setShowContactModal(false)
                  resetContactForm()
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 업체명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  업체명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactForm.company_name}
                  onChange={(e) => setContactForm({ ...contactForm, company_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="업체명을 입력하세요"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  카테고리
                </label>
                <select
                  value={contactForm.category_id}
                  onChange={(e) => setContactForm({ ...contactForm, category_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">카테고리 선택</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* 담당자 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  담당자
                </label>
                <input
                  type="text"
                  value={contactForm.contact_person}
                  onChange={(e) => setContactForm({ ...contactForm, contact_person: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="담당자명"
                />
              </div>

              {/* 전화번호 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    전화번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="010-0000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    전화번호 2
                  </label>
                  <input
                    type="tel"
                    value={contactForm.phone2}
                    onChange={(e) => setContactForm({ ...contactForm, phone2: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="추가 연락처"
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="email@example.com"
                />
              </div>

              {/* 주소 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  주소
                </label>
                <input
                  type="text"
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="주소를 입력하세요"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모
                </label>
                <textarea
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                />
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-gray-700">즐겨찾기에 추가</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowContactModal(false)
                  resetContactForm()
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveContact}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
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
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">카테고리 관리</h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  resetCategoryForm()
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 기존 카테고리 목록 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">기존 카테고리</h4>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-500">등록된 카테고리가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map(cat => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-medium">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditCategory(cat)}
                            className="p-1.5 hover:bg-white rounded"
                          >
                            <Edit2 className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 hover:bg-white rounded"
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
              <hr />

              {/* 카테고리 추가/수정 폼 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {editingCategory ? '카테고리 수정' : '새 카테고리 추가'}
                </h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="카테고리명"
                  />
                  <input
                    type="text"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="설명 (선택)"
                  />
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">색상 선택</label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map(color => (
                        <button
                          key={color}
                          onClick={() => setCategoryForm({ ...categoryForm, color })}
                          className={`w-8 h-8 rounded-full border-2 ${
                            categoryForm.color === color ? 'border-gray-800' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {editingCategory && (
                      <button
                        onClick={resetCategoryForm}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleSaveCategory}
                      className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
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
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">업체 일괄 등록</h3>
              <button
                onClick={() => {
                  setShowImportModal(false)
                  setImportData('')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">입력 형식 안내</h4>
                <p className="text-sm text-blue-700 mb-2">
                  엑셀이나 스프레드시트에서 복사하여 붙여넣기 하세요.
                  각 줄에 하나의 업체 정보를 입력합니다.
                </p>
                <p className="text-sm text-blue-700 font-mono">
                  업체명, 전화번호, 카테고리, 담당자, 전화번호2, 이메일, 주소, 메모
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  * 업체명과 전화번호는 필수입니다. 나머지는 비워둘 수 있습니다.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  데이터 입력
                </label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm"
                  rows={10}
                  placeholder="ABC의료기, 02-1234-5678, 의료장비, 홍길동&#10;XYZ기공소, 010-9876-5432, 기공, 김철수"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">예시</h4>
                <pre className="text-xs text-gray-600 overflow-x-auto">
                  {`ABC의료기	02-1234-5678	의료장비	홍길동
XYZ기공소	010-9876-5432	기공	김철수	010-1111-2222
가나다치과재료	031-555-6666			박영희	dental@test.com`}
                </pre>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportModal(false)
                  setImportData('')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
              >
                일괄 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-2">업체 삭제</h3>
            <p className="text-gray-600 mb-6">
              이 업체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteContact(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                삭제
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
