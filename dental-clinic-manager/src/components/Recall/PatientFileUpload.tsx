'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { RecallPatientUploadData } from '@/types/recall'

interface PatientFileUploadProps {
  onUpload: (patients: RecallPatientUploadData[], filename: string) => void
  onCancel: () => void
  isLoading?: boolean
  excludeMode?: boolean
}

interface ParsedColumn {
  key: keyof RecallPatientUploadData
  label: string
  required: boolean
}

const BASE_COLUMNS: ParsedColumn[] = [
  { key: 'patient_name', label: '환자명', required: true },
  { key: 'phone_number', label: '전화번호', required: true },
  { key: 'chart_number', label: '차트번호', required: false },
  { key: 'birth_date', label: '생년월일', required: false },
  { key: 'gender', label: '성별', required: false },
  { key: 'last_visit_date', label: '최종 내원일', required: false },
  { key: 'treatment_type', label: '시술 종류', required: false },
  { key: 'notes', label: '비고', required: false }
]

const EXCLUDE_COLUMNS: ParsedColumn[] = [
  { key: 'phone_number', label: '전화번호', required: false },
  { key: 'patient_name', label: '환자명', required: false },
  { key: 'chart_number', label: '차트번호', required: false },
  { key: 'notes', label: '비고', required: false }
]

const COLUMN_MAPPINGS: Record<string, keyof RecallPatientUploadData> = {
  '환자명': 'patient_name', '환자이름': 'patient_name', '이름': 'patient_name', '성명': 'patient_name',
  'name': 'patient_name', 'patient_name': 'patient_name',
  '전화번호': 'phone_number', '연락처': 'phone_number', '핸드폰': 'phone_number', '휴대폰': 'phone_number',
  '휴대전화': 'phone_number', 'phone': 'phone_number', 'phone_number': 'phone_number',
  'tel': 'phone_number', 'mobile': 'phone_number',
  '차트번호': 'chart_number', '차트': 'chart_number', 'chart': 'chart_number', 'chart_number': 'chart_number',
  '생년월일': 'birth_date', '생일': 'birth_date', '출생일': 'birth_date', '주민번호앞자리': 'birth_date',
  'birth': 'birth_date', 'birthday': 'birth_date', 'birth_date': 'birth_date', 'birthdate': 'birth_date', 'dob': 'birth_date',
  '성별': 'gender', '성': 'gender', 'gender': 'gender', 'sex': 'gender',
  '최종내원일': 'last_visit_date', '최종 내원일': 'last_visit_date', '마지막내원일': 'last_visit_date',
  '마지막 내원일': 'last_visit_date', '최근내원일': 'last_visit_date', '내원일': 'last_visit_date',
  '방문일': 'last_visit_date', 'last_visit': 'last_visit_date', 'last_visit_date': 'last_visit_date',
  '시술': 'treatment_type', '시술종류': 'treatment_type', '진료내용': 'treatment_type', '진료': 'treatment_type',
  'treatment': 'treatment_type', 'treatment_type': 'treatment_type',
  '비고': 'notes', '메모': 'notes', '참고': 'notes', 'notes': 'notes', 'memo': 'notes', 'remark': 'notes'
}

export default function PatientFileUpload({ onUpload, onCancel, isLoading, excludeMode }: PatientFileUploadProps) {
  const COLUMNS = excludeMode ? EXCLUDE_COLUMNS : BASE_COLUMNS
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof RecallPatientUploadData>>({})
  const [previewData, setPreviewData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const allParsedRowsRef = useRef<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const normalizePhoneNumber = (phone: string): string => {
    if (!phone) return ''
    const digits = phone.toString().replace(/[^0-9]/g, '')
    if (digits.length === 10 && !digits.startsWith('0')) {
      return '0' + digits
    }
    return digits
  }

  const isValidDate = (year: number, month: number, day: number): boolean => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false
    if (year < 1900 || year > 2100) return false
    const d = new Date(year, month - 1, day)
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
  }

  const normalizeDate = (date: any): string | undefined => {
    if (!date) return undefined
    if (typeof date === 'number') {
      if (date < 1 || date > 2958465) return undefined
      const excelDate = new Date((date - 25569) * 86400 * 1000)
      const y = excelDate.getUTCFullYear()
      const m = excelDate.getUTCMonth() + 1
      const d = excelDate.getUTCDate()
      if (!isValidDate(y, m, d)) return undefined
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    const dateStr = date.toString().trim()
    if (!dateStr) return undefined
    let year: number, month: number, day: number
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
      const parts = dateStr.split('-')
      year = parseInt(parts[0]); month = parseInt(parts[1]); day = parseInt(parts[2])
    } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const parts = dateStr.split('/')
      year = parseInt(parts[0]); month = parseInt(parts[1]); day = parseInt(parts[2])
    } else if (/^\d{4}\.\d{1,2}\.\d{1,2}\.?$/.test(dateStr)) {
      const parts = dateStr.replace(/\.$/, '').split('.')
      year = parseInt(parts[0]); month = parseInt(parts[1]); day = parseInt(parts[2])
    } else if (/^\d{8}$/.test(dateStr)) {
      year = parseInt(dateStr.slice(0, 4)); month = parseInt(dateStr.slice(4, 6)); day = parseInt(dateStr.slice(6, 8))
    } else if (/^\d{6}$/.test(dateStr)) {
      const yy = parseInt(dateStr.slice(0, 2))
      const century = yy > 30 ? 1900 : 2000
      year = century + yy; month = parseInt(dateStr.slice(2, 4)); day = parseInt(dateStr.slice(4, 6))
    } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/.test(dateStr)) {
      const datePart = dateStr.split(/\s+/)[0]
      const parts = datePart.split(/[-/]/)
      year = parseInt(parts[0]); month = parseInt(parts[1]); day = parseInt(parts[2])
    } else {
      return undefined
    }
    if (!isValidDate(year, month, day)) return undefined
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const normalizeGender = (gender: any): string | undefined => {
    if (!gender) return undefined
    const genderStr = gender.toString().trim().toLowerCase()
    if (['남', '남성', '남자', 'm', 'male', '1', '3'].includes(genderStr)) return 'male'
    if (['여', '여성', '여자', 'f', 'female', '2', '4'].includes(genderStr)) return 'female'
    return undefined
  }

  const parseFile = useCallback(async (file: File) => {
    setParseError(null)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      let headerRow: string[] = []
      let allRows: Record<string, any>[] = []

      if (extension === 'csv') {
        const text = await file.text()
        const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
        if (rows.length < 2) throw new Error('데이터가 없습니다.')
        headerRow = rows[0]
        const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()))
        allRows = dataRows.map(row => {
          const obj: Record<string, any> = {}
          headerRow.forEach((h, i) => { obj[h] = row[i] || '' })
          return obj
        })
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
        if (jsonData.length < 2) throw new Error('데이터가 없습니다.')
        headerRow = jsonData[0].map(h => String(h || '').trim())
        const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell != null && cell !== ''))
        allRows = dataRows.map(row => {
          const obj: Record<string, any> = {}
          headerRow.forEach((h, i) => { obj[h] = row[i] ?? '' })
          return obj
        })
      } else {
        throw new Error('지원하지 않는 파일 형식입니다. CSV 또는 Excel 파일을 업로드해주세요.')
      }

      allParsedRowsRef.current = allRows
      setHeaders(headerRow)
      setPreviewData(allRows.slice(0, 5))

      const autoMapping: Record<string, keyof RecallPatientUploadData> = {}
      headerRow.forEach(header => {
        const normalizedHeader = header.toLowerCase().replace(/\s/g, '')
        const mapping = COLUMN_MAPPINGS[header] || COLUMN_MAPPINGS[normalizedHeader]
        if (mapping) autoMapping[header] = mapping
      })
      setColumnMapping(autoMapping)
      setFile(file)
    } catch (error) {
      console.error('File parse error:', error)
      setParseError(error instanceof Error ? error.message : '파일 파싱 중 오류가 발생했습니다.')
    }
  }, [])

  const convertToPatientData = useCallback((): RecallPatientUploadData[] | null => {
    const mappedKeys = Object.values(columnMapping)
    if (excludeMode) {
      if (!mappedKeys.includes('phone_number') && !mappedKeys.includes('patient_name')) {
        setParseError('전화번호 또는 환자명 컬럼을 하나 이상 매핑해주세요.')
        return null
      }
    } else {
      if (!mappedKeys.includes('patient_name') || !mappedKeys.includes('phone_number')) {
        setParseError('환자명과 전화번호 컬럼을 매핑해주세요.')
        return null
      }
    }

    const allRows = allParsedRowsRef.current
    if (allRows.length === 0) {
      setParseError('파일 데이터가 없습니다.')
      return null
    }

    const headerToKey: Record<string, keyof RecallPatientUploadData> = {}
    Object.entries(columnMapping).forEach(([header, key]) => { headerToKey[header] = key })

    const patients: RecallPatientUploadData[] = []
    const invalidRows: number[] = []

    allRows.forEach((row, index) => {
      const patient: Partial<RecallPatientUploadData> = {}
      Object.entries(headerToKey).forEach(([header, key]) => {
        let value = row[header]
        if (key === 'phone_number') value = normalizePhoneNumber(value)
        else if (key === 'last_visit_date' || key === 'birth_date') value = normalizeDate(value)
        else if (key === 'gender') value = normalizeGender(value)
        else if (typeof value === 'string') value = value.trim() || undefined
        else if (value != null) value = String(value).trim() || undefined
        if (value !== undefined && value !== '') patient[key] = value
      })

      if (excludeMode) {
        if (patient.phone_number || patient.patient_name) patients.push(patient as RecallPatientUploadData)
        else invalidRows.push(index + 2)
      } else {
        if (patient.patient_name && patient.phone_number) patients.push(patient as RecallPatientUploadData)
        else invalidRows.push(index + 2)
      }
    })

    if (invalidRows.length > 0 && patients.length === 0) {
      setParseError(excludeMode
        ? '유효한 데이터가 없습니다. 전화번호 또는 환자명을 확인해주세요.'
        : '유효한 데이터가 없습니다. 환자명과 전화번호를 확인해주세요.'
      )
      return null
    }
    return patients
  }, [columnMapping, excludeMode])

  const handleUpload = () => {
    const patients = convertToPatientData()
    if (patients && patients.length > 0) {
      onUpload(patients, file?.name || 'upload.xlsx')
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) parseFile(droppedFile)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) parseFile(selectedFile)
  }
  const handleMappingChange = (header: string, value: string) => {
    setColumnMapping(prev => {
      if (value) return { ...prev, [header]: value as keyof RecallPatientUploadData }
      const newMapping = { ...prev }
      delete newMapping[header]
      return newMapping
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-at-card border border-at-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-at-text">환자 목록 업로드</h3>
        <button onClick={onCancel} className="text-at-text-weak hover:text-at-text-secondary">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!file ? (
        <>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-at-accent bg-at-accent-light' : 'border-at-border hover:border-at-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            <Upload className="w-12 h-12 text-at-text-weak mx-auto mb-4" />
            <p className="text-at-text-secondary mb-2">파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm text-at-text-weak">CSV, Excel (.xlsx, .xls) 파일 지원</p>
          </div>

          <div className="mt-6 p-4 bg-at-accent-light rounded-xl">
            <h4 className="font-medium text-at-text mb-2">파일 형식 안내</h4>
            <p className="text-sm text-at-accent mb-3">아래 컬럼명을 포함한 Excel 또는 CSV 파일을 업로드해주세요.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              {COLUMNS.map(col => (
                <div key={col.key} className="flex items-center gap-1">
                  <span className={col.required ? 'text-at-error' : 'text-at-text-weak'}>{col.required ? '*' : ''}</span>
                  <span className="text-at-text">{col.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-at-accent mt-2">* 필수 항목</p>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 p-3 bg-at-surface-alt rounded-xl mb-6">
            <FileSpreadsheet className="w-8 h-8 text-at-success" />
            <div className="flex-1">
              <p className="font-medium text-at-text">{file.name}</p>
              <p className="text-sm text-at-text-weak">{previewData.length > 0 ? `미리보기: ${previewData.length}건` : ''}</p>
            </div>
            <button
              onClick={() => { setFile(null); setPreviewData([]); setHeaders([]); setColumnMapping({}); setParseError(null); allParsedRowsRef.current = [] }}
              className="text-at-text-weak hover:text-at-text-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {parseError && (
            <div className="flex items-center gap-2 p-3 bg-at-error-bg text-at-error rounded-xl mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{parseError}</p>
            </div>
          )}

          <div className="mb-6">
            <h4 className="font-medium text-at-text mb-3">컬럼 매핑</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {headers.map(header => (
                <div key={header} className="flex items-center gap-2">
                  <span className="text-sm text-at-text-secondary w-32 truncate" title={header}>{header}</span>
                  <span className="text-at-text-weak">→</span>
                  <select
                    value={columnMapping[header] || ''}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    className="flex-1 p-2 border border-at-border rounded-xl text-sm"
                  >
                    <option value="">선택 안함</option>
                    {COLUMNS.map(col => (
                      <option key={col.key} value={col.key}>{col.label} {col.required ? '*' : ''}</option>
                    ))}
                  </select>
                  {columnMapping[header] && <CheckCircle className="w-5 h-5 text-at-success flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {previewData.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-at-text mb-3">데이터 미리보기</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-at-surface-alt">
                      {headers.map(header => (
                        <th key={header} className="px-3 py-2 text-left text-at-text-secondary font-medium">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} className="border-t border-at-border">
                        {headers.map(header => (
                          <td key={header} className="px-3 py-2 text-at-text">{String(row[header] || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length >= 5 && (
                <p className="text-xs text-at-text-weak mt-2">* 상위 5건만 미리보기로 표시됩니다.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-hover"
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={isLoading || (excludeMode
                ? (!Object.values(columnMapping).includes('phone_number') && !Object.values(columnMapping).includes('patient_name'))
                : (!Object.values(columnMapping).includes('patient_name') || !Object.values(columnMapping).includes('phone_number'))
              )}
              className="px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <><span className="animate-spin">⏳</span>업로드 중...</>
              ) : (
                <><Upload className="w-4 h-4" />업로드</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
