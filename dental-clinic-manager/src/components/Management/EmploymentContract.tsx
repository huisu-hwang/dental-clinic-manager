'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import type { UserProfile } from '@/contexts/AuthContext'
import type { OperatingHours } from '@/types/clinic'
import {
  createDefaultOperatingHours,
  dayOrder,
  mergeOperatingHours,
  formatOperatingRange,
  formatBreakRange,
  summarizeOperatingHours,
  hasConfiguredOperatingHours
} from '@/lib/operatingHours'

interface EmploymentContractProps {
  currentUser: UserProfile
}

interface ClinicContractData {
  name: string
  ownerName: string
  address: string
  phone: string
  email?: string | null
  operatingHours: OperatingHours
}

interface ContractInfo {
  employeeName: string
  position: string
  employmentType: string
  startDate: string
  endDate: string
  probationPeriod: string
  contractDate: string
  workLocation: string
  wageType: string
  wageAmount: string
  duties: string
  notes: string
}

const formatDateForDisplay = (value: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

export default function EmploymentContract({ currentUser }: EmploymentContractProps) {
  const [clinic, setClinic] = useState<ClinicContractData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contractHours, setContractHours] = useState<OperatingHours>(createDefaultOperatingHours())
  const [contractInfo, setContractInfo] = useState<ContractInfo>({
    employeeName: '',
    position: '치과위생사',
    employmentType: '정규직',
    startDate: '',
    endDate: '',
    probationPeriod: '3개월',
    contractDate: new Date().toISOString().slice(0, 10),
    workLocation: '',
    wageType: '월급제',
    wageAmount: '',
    duties: '치과 진료 보조, 환자 응대 및 데스크 업무 수행',
    notes: ''
  })
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const loadClinic = async () => {
      if (!currentUser?.clinic_id) {
        setError('병원 정보가 없어 근로계약서를 생성할 수 없습니다.')
        setLoading(false)
        return
      }

      const supabase = getSupabase()
      if (!supabase) {
        setError('데이터베이스 연결에 실패했습니다.')
        setLoading(false)
        return
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('clinics')
          .select('name, owner_name, address, phone, email, operating_hours')
          .eq('id', currentUser.clinic_id)
          .single()

        if (fetchError) {
          console.error('Failed to fetch clinic for contract:', fetchError)
          setError('병원 정보를 불러오는데 실패했습니다.')
        } else if (data) {
          const clinicHours = mergeOperatingHours((data as any).operating_hours)
          const clinicData: ClinicContractData = {
            name: (data as any).name,
            ownerName: (data as any).owner_name,
            address: (data as any).address,
            phone: (data as any).phone,
            email: (data as any).email,
            operatingHours: clinicHours
          }

          setClinic(clinicData)
          setContractHours(clinicHours)
          setContractInfo(prev => ({
            ...prev,
            workLocation: prev.workLocation || clinicData.address
          }))
        }
      } catch (err) {
        console.error('Unexpected error fetching clinic info:', err)
        setError('병원 정보를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    loadClinic()
  }, [currentUser?.clinic_id])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const hasWorkingHours = hasConfiguredOperatingHours(contractHours)
  const workingHourSummaries = summarizeOperatingHours(contractHours)

  const contractPlainText = useMemo(() => {
    if (!clinic) return ''

    const lines: string[] = []
    lines.push('근로계약서', '')
    lines.push('제1조 (근로계약 당사자)')
    lines.push(`  1. 사업장: ${clinic.name} (${clinic.ownerName})`)
    lines.push(`  2. 주소: ${clinic.address}`)
    lines.push(`  3. 연락처: ${clinic.phone}`)
    if (clinic.email) {
      lines.push(`  4. 이메일: ${clinic.email}`)
    }
    lines.push(`  5. 근로자: ${contractInfo.employeeName || '________________'}`)
    lines.push('')

    lines.push('제2조 (근로계약 기간)')
    lines.push(`  1. 근로 시작일: ${contractInfo.startDate ? formatDateForDisplay(contractInfo.startDate) : '__________'}`)
    lines.push(`  2. 근로 종료일: ${contractInfo.endDate ? formatDateForDisplay(contractInfo.endDate) : '별도 합의 시까지'}`)
    lines.push(`  3. 고용 형태: ${contractInfo.employmentType}`)
    lines.push(`  4. 수습 기간: ${contractInfo.probationPeriod}`)
    lines.push('')

    lines.push('제3조 (근무장소 및 업무)')
    lines.push(`  1. 근무장소: ${contractInfo.workLocation || clinic.address}`)
    lines.push(`  2. 담당 업무: ${contractInfo.duties}`)
    lines.push('')

    lines.push('제4조 (근무시간 및 휴게시간)')
    lines.push('  1. 병원의 진료 시간에 따라 다음과 같이 근무한다.')
    workingHourSummaries.forEach(summary => {
      lines.push(`    - ${summary}`)
    })
    if (!hasWorkingHours) {
      lines.push('    ※ 정확한 진료 시간을 병원 설정에서 입력해주세요.')
    }
    lines.push('  2. 필요 시 근로기준법 범위 내에서 근무시간을 조정할 수 있다.')
    lines.push('')

    lines.push('제5조 (임금)')
    lines.push(`  1. 임금 형태: ${contractInfo.wageType}`)
    lines.push(`  2. 지급 금액: ${contractInfo.wageAmount || '협의 후 결정'}`)
    lines.push('  3. 임금 지급일: 매월 말일 (공휴일 시 전 영업일)')
    lines.push('')

    if (contractInfo.notes.trim().length > 0) {
      lines.push('제6조 (기타 사항)')
      lines.push(`  ${contractInfo.notes.trim()}`)
      lines.push('')
    }

    lines.push('제7조 (기타 규정)')
    lines.push('  본 계약에 명시되지 않은 사항은 근로기준법 및 관련 법령을 따른다.')
    lines.push('')

    lines.push(`작성일: ${contractInfo.contractDate ? formatDateForDisplay(contractInfo.contractDate) : formatDateForDisplay(new Date().toISOString().slice(0, 10))}`)
    lines.push('')
    lines.push(`사업주: ${clinic.ownerName} (서명)`) 
    lines.push(`근로자: ${contractInfo.employeeName || '________________'} (서명)`)

    return lines.join('\n')
  }, [clinic, contractInfo, workingHourSummaries, hasWorkingHours])

  const handleCopyContract = async () => {
    if (!contractPlainText) return

    try {
      await navigator.clipboard.writeText(contractPlainText)
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      setCopyMessage('근로계약서 본문이 클립보드에 복사되었습니다.')
      copyTimeoutRef.current = setTimeout(() => setCopyMessage(null), 3000)
    } catch (err) {
      console.error('Failed to copy contract text:', err)
      setCopyMessage('복사에 실패했습니다. 브라우저 권한을 확인해주세요.')
    }
  }

  const handleContractInfoChange = (field: keyof ContractInfo, value: string) => {
    setContractInfo(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">근로계약서 정보를 불러오는 중입니다...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center text-red-600">
          <ExclamationTriangleIcon className="h-6 w-6 mr-3" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!clinic) {
    return null
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex items-center mb-6">
        <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
        <h2 className="text-xl font-bold text-slate-800">근로계약서 생성</h2>
      </div>

      {!hasWorkingHours && (
        <div className="mb-6 flex items-start space-x-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
          <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" />
          <p>
            병원 진료 시간이 아직 완전히 설정되지 않았습니다. <strong>병원 설정 &gt; 진료 시간</strong>을 먼저 업데이트하면
            근무 시간이 계약서에 정확히 반영됩니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor */}
        <div className="lg:col-span-1 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">근로자 정보</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">근로자 성명</label>
                <input
                  type="text"
                  value={contractInfo.employeeName}
                  onChange={(e) => handleContractInfoChange('employeeName', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: 홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">직위</label>
                <input
                  type="text"
                  value={contractInfo.position}
                  onChange={(e) => handleContractInfoChange('position', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: 치과위생사"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">고용 형태</label>
                <input
                  type="text"
                  value={contractInfo.employmentType}
                  onChange={(e) => handleContractInfoChange('employmentType', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: 정규직, 계약직"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">계약 기간</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">근로 시작일</label>
                  <input
                    type="date"
                    value={contractInfo.startDate}
                    onChange={(e) => handleContractInfoChange('startDate', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">근로 종료일 (선택)</label>
                  <input
                    type="date"
                    value={contractInfo.endDate}
                    onChange={(e) => handleContractInfoChange('endDate', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">수습 기간</label>
                  <input
                    type="text"
                    value={contractInfo.probationPeriod}
                    onChange={(e) => handleContractInfoChange('probationPeriod', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">작성일</label>
                  <input
                    type="date"
                    value={contractInfo.contractDate}
                    onChange={(e) => handleContractInfoChange('contractDate', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">임금 및 기타</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">임금 형태</label>
                <input
                  type="text"
                  value={contractInfo.wageType}
                  onChange={(e) => handleContractInfoChange('wageType', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: 월급제, 시급제"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">지급 금액</label>
                <input
                  type="text"
                  value={contractInfo.wageAmount}
                  onChange={(e) => handleContractInfoChange('wageAmount', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: 월 2,500,000원"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">근무 장소</label>
                <input
                  type="text"
                  value={contractInfo.workLocation}
                  onChange={(e) => handleContractInfoChange('workLocation', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">주요 업무</label>
                <textarea
                  value={contractInfo.duties}
                  onChange={(e) => handleContractInfoChange('duties', e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">추가 사항 (선택)</label>
                <textarea
                  value={contractInfo.notes}
                  onChange={(e) => handleContractInfoChange('notes', e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="기타 합의 사항을 입력하세요."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">근로계약서 미리보기</h3>
            <button
              type="button"
              onClick={handleCopyContract}
              className="inline-flex items-center rounded-md border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <ClipboardDocumentCheckIcon className="h-5 w-5 mr-2" />
              본문 복사
            </button>
          </div>

          {copyMessage && (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {copyMessage}
            </div>
          )}

          <div className="border border-slate-200 rounded-lg p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div>
              <h4 className="text-2xl font-bold text-center text-slate-900">근로계약서</h4>
              <p className="mt-2 text-center text-sm text-slate-500">
                병원 진료 시간에 맞춘 근무시간이 자동으로 반영됩니다.
              </p>
            </div>

            <section className="space-y-2 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제1조 (근로계약 당사자)</h5>
              <p>① 사업장: {clinic.name} ({clinic.ownerName})</p>
              <p>② 주소: {clinic.address}</p>
              <p>③ 연락처: {clinic.phone}</p>
              {clinic.email && <p>④ 이메일: {clinic.email}</p>}
              <p>⑤ 근로자: {contractInfo.employeeName || '성명 기재'}</p>
            </section>

            <section className="space-y-2 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제2조 (근로계약 기간)</h5>
              <p>① 근로 시작일: {contractInfo.startDate ? formatDateForDisplay(contractInfo.startDate) : '입력 필요'}</p>
              <p>② 근로 종료일: {contractInfo.endDate ? formatDateForDisplay(contractInfo.endDate) : '별도 합의 시까지'}</p>
              <p>③ 고용 형태: {contractInfo.employmentType}</p>
              <p>④ 수습 기간: {contractInfo.probationPeriod}</p>
            </section>

            <section className="space-y-2 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제3조 (근무장소 및 업무)</h5>
              <p>① 근무장소: {contractInfo.workLocation || clinic.address}</p>
              <p>② 담당 업무: {contractInfo.duties}</p>
            </section>

            <section className="space-y-3 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제4조 (근무시간 및 휴게시간)</h5>
              <p>① 병원의 진료 시간에 따라 다음과 같이 근무한다.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">요일</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">근무시간</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">휴게시간</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dayOrder.map(({ key, shortLabel }) => {
                      const hours = contractHours[key]
                      return (
                        <tr key={key}>
                          <td className="px-3 py-2 font-medium text-slate-700">{shortLabel}</td>
                          <td className="px-3 py-2 text-slate-700">{formatOperatingRange(hours)}</td>
                          <td className="px-3 py-2 text-slate-700">{formatBreakRange(hours)}</td>
                          <td className="px-3 py-2 text-slate-500">{hours.note || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-slate-600">② 업무 필요에 따라 상호 협의 후 근무시간을 조정할 수 있다.</p>
            </section>

            <section className="space-y-2 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제5조 (임금)</h5>
              <p>① 임금 형태: {contractInfo.wageType}</p>
              <p>② 지급 금액: {contractInfo.wageAmount || '협의 후 결정'}</p>
              <p>③ 지급일: 매월 말일 (공휴일 시 전 영업일)</p>
            </section>

            {contractInfo.notes.trim().length > 0 && (
              <section className="space-y-2 text-sm text-slate-700">
                <h5 className="font-semibold text-slate-900">제6조 (기타 사항)</h5>
                <p>{contractInfo.notes.trim()}</p>
              </section>
            )}

            <section className="space-y-2 text-sm text-slate-700">
              <h5 className="font-semibold text-slate-900">제7조 (기타 규정)</h5>
              <p>본 계약에 명시되지 않은 사항은 근로기준법 및 관련 법령을 따른다.</p>
            </section>

            <section className="space-y-2 text-sm text-slate-700">
              <p>작성일: {contractInfo.contractDate ? formatDateForDisplay(contractInfo.contractDate) : formatDateForDisplay(new Date().toISOString().slice(0, 10))}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="border border-slate-200 rounded-md p-3">
                  <p className="font-medium text-slate-800">사업주</p>
                  <p className="mt-1 text-slate-600">{clinic.ownerName}</p>
                  <p className="mt-1 text-slate-500 text-xs">(서명)</p>
                </div>
                <div className="border border-slate-200 rounded-md p-3">
                  <p className="font-medium text-slate-800">근로자</p>
                  <p className="mt-1 text-slate-600">{contractInfo.employeeName || '성명 기재'}</p>
                  <p className="mt-1 text-slate-500 text-xs">(서명)</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
