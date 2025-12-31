'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { RecallPatientUploadData } from '@/types/recall'

interface PatientFileUploadProps {
  onUpload: (patients: RecallPatientUploadData[], filename: string) => void
  onCancel: () => void
  isLoading?: boolean
}

interface ParsedColumn {
  key: keyof RecallPatientUploadData
  label: string
  required: boolean
}

const EXPECTED_COLUMNS: ParsedColumn[] = [
  { key: 'patient_name', label: '환자명', required: true },
  { key: 'phone_number', label: '전화번호', required: true },
  { key: 'chart_number', label: '차트번호', required: false },
  { key: 'last_visit_date', label: '마지막 내원일', required: false },
  { key: 'treatment_type', label: '시술 종류', required: false },
  { key: 'notes', label: '비고', required: false }
]

// 컬럼명 매핑 (다양한 형식 지원)
const COLUMN_MAPPINGS: Record<string, keyof RecallPatientUploadData> = {
  '환자명': 'patient_name',
  '환자이름': 'patient_name',
  '이름': 'patient_name',
  '성명': 'patient_name',
  'name': 'patient_name',
  'patient_name': 'patient_name',

  '전화번호': 'phone_number',
  '연락처': 'phone_number',
  '핸드폰': 'phone_number',
  '휴대폰': 'phone_number',
  '휴대전화': 'phone_number',
  'phone': 'phone_number',
  'phone_number': 'phone_number',
  'tel': 'phone_number',
  'mobile': 'phone_number',

  '차트번호': 'chart_number',
  '차트': 'chart_number',
  'chart': 'chart_number',
  'chart_number': 'chart_number',

  '마지막내원일': 'last_visit_date',
  '최근내원일': 'last_visit_date',
  '내원일': 'last_visit_date',
  '방문일': 'last_visit_date',
  'last_visit': 'last_visit_date',
  'last_visit_date': 'last_visit_date',

  '시술': 'treatment_type',
  '시술종류': 'treatment_type',
  '진료내용': 'treatment_type',
  '진료': 'treatment_type',
  'treatment': 'treatment_type',
  'treatment_type': 'treatment_type',

  '비고': 'notes',
  '메모': 'notes',
  '참고': 'notes',
  'notes': 'notes',
  'memo': 'notes',
  'remark': 'notes'
}

export default function PatientFileUpload({ onUpload, onCancel, isLoading }: PatientFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<RecallPatientUploadData[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof RecallPatientUploadData>>({})
  const [previewData, setPreviewData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 전화번호 정규화
  const normalizePhoneNumber = (phone: string): string => {
    if (!phone) return ''
    // 숫자만 추출
    const digits = phone.toString().replace(/[^0-9]/g, '')
    // 앞에 0이 빠진 경우 추가
    if (digits.length === 10 && !digits.startsWith('0')) {
      return '0' + digits
    }
    return digits
  }

  // 날짜 정규화
  const normalizeDate = (date: any): string => {
    if (!date) return ''

    // Excel 날짜 시리얼 값 처리
    if (typeof date === 'number') {
      const excelDate = new Date((date - 25569) * 86400 * 1000)
      return excelDate.toISOString().split('T')[0]
    }

    // 문자열 날짜 처리
    const dateStr = date.toString()
    // YYYY-MM-DD 형식
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr
    }
    // YYYY/MM/DD 형식
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
      return dateStr.replace(/\//g, '-')
    }
    // YYYYMMDD 형식
    if (/^\d{8}$/.test(dateStr)) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    }

    return dateStr
  }

  // 파일 파싱
  const parseFile = useCallback(async (file: File) => {
    setParseError(null)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (extension === 'csv') {
        // CSV 파싱
        const text = await file.text()
        const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))

        if (rows.length < 2) {
          throw new Error('데이터가 없습니다.')
        }

        const headerRow = rows[0]
        const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()))

        setHeaders(headerRow)
        setPreviewData(dataRows.slice(0, 5).map(row => {
          const obj: Record<string, any> = {}
          headerRow.forEach((h, i) => {
            obj[h] = row[i] || ''
          })
          return obj
        }))

        // 자동 컬럼 매핑
        const autoMapping: Record<string, keyof RecallPatientUploadData> = {}
        headerRow.forEach(header => {
          const normalizedHeader = header.toLowerCase().replace(/\s/g, '')
          const mapping = COLUMN_MAPPINGS[header] || COLUMN_MAPPINGS[normalizedHeader]
          if (mapping) {
            autoMapping[header] = mapping
          }
        })
        setColumnMapping(autoMapping)

      } else if (extension === 'xlsx' || extension === 'xls') {
        // Excel 파싱
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

        if (jsonData.length < 2) {
          throw new Error('데이터가 없습니다.')
        }

        const headerRow = jsonData[0].map(h => String(h || '').trim())
        const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell != null && cell !== ''))

        setHeaders(headerRow)
        setPreviewData(dataRows.slice(0, 5).map(row => {
          const obj: Record<string, any> = {}
          headerRow.forEach((h, i) => {
            obj[h] = row[i] ?? ''
          })
          return obj
        }))

        // 자동 컬럼 매핑
        const autoMapping: Record<string, keyof RecallPatientUploadData> = {}
        headerRow.forEach(header => {
          const normalizedHeader = header.toLowerCase().replace(/\s/g, '')
          const mapping = COLUMN_MAPPINGS[header] || COLUMN_MAPPINGS[normalizedHeader]
          if (mapping) {
            autoMapping[header] = mapping
          }
        })
        setColumnMapping(autoMapping)

      } else {
        throw new Error('지원하지 않는 파일 형식입니다. CSV 또는 Excel 파일을 업로드해주세요.')
      }

      setFile(file)

    } catch (error) {
      console.error('File parse error:', error)
      setParseError(error instanceof Error ? error.message : '파일 파싱 중 오류가 발생했습니다.')
    }
  }, [])

  // 최종 데이터 변환
  const convertToPatientData = useCallback((): RecallPatientUploadData[] | null => {
    // 필수 컬럼 확인
    const mappedKeys = Object.values(columnMapping)
    if (!mappedKeys.includes('patient_name') || !mappedKeys.includes('phone_number')) {
      setParseError('환자명과 전화번호 컬럼을 매핑해주세요.')
      return null
    }

    // 데이터 변환
    const headerToKey: Record<string, keyof RecallPatientUploadData> = {}
    Object.entries(columnMapping).forEach(([header, key]) => {
      headerToKey[header] = key
    })

    // 파일 다시 파싱하여 전체 데이터 가져오기
    return new Promise<RecallPatientUploadData[]>((resolve, reject) => {
      if (!file) {
        reject(new Error('파일이 없습니다.'))
        return
      }

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const extension = file.name.split('.').pop()?.toLowerCase()
          let allRows: any[] = []

          if (extension === 'csv') {
            const text = e.target?.result as string
            const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
            const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()))
            allRows = dataRows.map(row => {
              const obj: Record<string, any> = {}
              headers.forEach((h, i) => {
                obj[h] = row[i] || ''
              })
              return obj
            })
          } else {
            const buffer = e.target?.result as ArrayBuffer
            const workbook = XLSX.read(buffer, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
            const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell != null && cell !== ''))
            allRows = dataRows.map(row => {
              const obj: Record<string, any> = {}
              headers.forEach((h, i) => {
                obj[h] = row[i] ?? ''
              })
              return obj
            })
          }

          // 데이터 변환
          const patients: RecallPatientUploadData[] = []
          const invalidRows: number[] = []

          allRows.forEach((row, index) => {
            const patient: Partial<RecallPatientUploadData> = {}

            Object.entries(headerToKey).forEach(([header, key]) => {
              let value = row[header]

              // 특수 처리
              if (key === 'phone_number') {
                value = normalizePhoneNumber(value)
              } else if (key === 'last_visit_date') {
                value = normalizeDate(value)
              }

              patient[key] = value
            })

            // 필수 필드 검증
            if (patient.patient_name && patient.phone_number) {
              patients.push(patient as RecallPatientUploadData)
            } else {
              invalidRows.push(index + 2) // 헤더 행 포함
            }
          })

          if (invalidRows.length > 0 && patients.length === 0) {
            reject(new Error('유효한 데이터가 없습니다. 환자명과 전화번호를 확인해주세요.'))
            return
          }

          resolve(patients)

        } catch (error) {
          reject(error)
        }
      }

      if (file.name.endsWith('.csv')) {
        reader.readAsText(file)
      } else {
        reader.readAsArrayBuffer(file)
      }
    }) as any
  }, [columnMapping, file, headers])

  // 업로드 처리
  const handleUpload = async () => {
    try {
      const patients = await convertToPatientData()
      if (patients && patients.length > 0) {
        onUpload(patients, file?.name || 'upload.xlsx')
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '데이터 변환 중 오류가 발생했습니다.')
    }
  }

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      parseFile(droppedFile)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      parseFile(selectedFile)
    }
  }

  // 컬럼 매핑 변경
  const handleMappingChange = (header: string, value: string) => {
    setColumnMapping(prev => {
      if (value) {
        return { ...prev, [header]: value as keyof RecallPatientUploadData }
      } else {
        const newMapping = { ...prev }
        delete newMapping[header]
        return newMapping
      }
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">환자 목록 업로드</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!file ? (
        <>
          {/* 파일 업로드 영역 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-sm text-gray-400">
              CSV, Excel (.xlsx, .xls) 파일 지원
            </p>
          </div>

          {/* 파일 형식 안내 */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">파일 형식 안내</h4>
            <p className="text-sm text-blue-700 mb-3">
              아래 컬럼명을 포함한 Excel 또는 CSV 파일을 업로드해주세요.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {EXPECTED_COLUMNS.map(col => (
                <div key={col.key} className="flex items-center gap-1">
                  <span className={col.required ? 'text-red-500' : 'text-gray-400'}>
                    {col.required ? '*' : ''}
                  </span>
                  <span className="text-blue-900">{col.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">* 필수 항목</p>
          </div>
        </>
      ) : (
        <>
          {/* 파일 정보 */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-6">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">
                {previewData.length > 0 ? `미리보기: ${previewData.length}건` : ''}
              </p>
            </div>
            <button
              onClick={() => {
                setFile(null)
                setParsedData([])
                setPreviewData([])
                setHeaders([])
                setColumnMapping({})
                setParseError(null)
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 에러 메시지 */}
          {parseError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{parseError}</p>
            </div>
          )}

          {/* 컬럼 매핑 */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">컬럼 매핑</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {headers.map(header => (
                <div key={header} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-32 truncate" title={header}>
                    {header}
                  </span>
                  <span className="text-gray-400">→</span>
                  <select
                    value={columnMapping[header] || ''}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">선택 안함</option>
                    {EXPECTED_COLUMNS.map(col => (
                      <option key={col.key} value={col.key}>
                        {col.label} {col.required ? '*' : ''}
                      </option>
                    ))}
                  </select>
                  {columnMapping[header] && (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 데이터 미리보기 */}
          {previewData.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-3">데이터 미리보기</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {headers.map(header => (
                        <th key={header} className="px-3 py-2 text-left text-gray-600 font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        {headers.map(header => (
                          <td key={header} className="px-3 py-2 text-gray-900">
                            {String(row[header] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length >= 5 && (
                <p className="text-xs text-gray-500 mt-2">* 상위 5건만 미리보기로 표시됩니다.</p>
              )}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={isLoading || !Object.values(columnMapping).includes('patient_name') || !Object.values(columnMapping).includes('phone_number')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  업로드
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
