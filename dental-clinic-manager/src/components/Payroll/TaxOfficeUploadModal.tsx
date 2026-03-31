'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload,
  FileText,
  Check,
  AlertCircle,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react'

interface TaxOfficeUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: () => void
  clinicId: string
  employees: { id: string; name: string }[]
}

interface FileMatch {
  fileName: string
  employeeId: string | null
  autoMatched: boolean
}

type Step = 1 | 2 | 3

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractKoreanName(fileName: string): string | null {
  const matches = fileName.match(/[가-힣]{2,4}/g)
  return matches ? matches[0] : null
}

export default function TaxOfficeUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  clinicId,
  employees,
}: TaxOfficeUploadModalProps) {
  const currentDate = new Date()
  const [step, setStep] = useState<Step>(1)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [year, setYear] = useState(currentDate.getFullYear())
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [pdfFiles, setPdfFiles] = useState<string[]>([])
  const [matches, setMatches] = useState<FileMatch[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ count: number; error?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setStep(1)
    setZipFile(null)
    setIsDragging(false)
    setYear(new Date().getFullYear())
    setMonth(new Date().getMonth() + 1)
    setPdfFiles([])
    setMatches([])
    setIsParsing(false)
    setParseError(null)
    setIsUploading(false)
    setUploadProgress(0)
    setUploadResult(null)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  const autoMatch = useCallback(
    (fileNames: string[]): FileMatch[] => {
      return fileNames.map((fileName) => {
        const extracted = extractKoreanName(fileName)
        if (!extracted) return { fileName, employeeId: null, autoMatched: false }

        const exact = employees.find((e) => e.name === extracted)
        if (exact) return { fileName, employeeId: exact.id, autoMatched: true }

        const partial = employees.find(
          (e) => e.name.includes(extracted) || extracted.includes(e.name)
        )
        if (partial) return { fileName, employeeId: partial.id, autoMatched: true }

        return { fileName, employeeId: null, autoMatched: false }
      })
    },
    [employees]
  )

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return
    }
    setZipFile(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleNext = useCallback(async () => {
    if (!zipFile) return
    setIsParsing(true)
    setParseError(null)

    try {
      const formData = new FormData()
      formData.append('zipFile', zipFile)

      const res = await fetch('/api/payroll/tax-office-files/parse-zip', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `서버 오류 (${res.status})`)
      }

      const data = await res.json()
      const files: string[] = data.data ?? []
      setPdfFiles(files)
      setMatches(autoMatch(files))
      setStep(2)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'ZIP 파일 파싱 중 오류가 발생했습니다.')
    } finally {
      setIsParsing(false)
    }
  }, [zipFile, autoMatch])

  const handleUpload = useCallback(async () => {
    if (!zipFile) return
    setIsUploading(true)
    setUploadProgress(10)
    setStep(3)

    try {
      const formData = new FormData()
      formData.append('zipFile', zipFile)
      formData.append('year', String(year))
      formData.append('month', String(month))
      formData.append('clinicId', clinicId)
      formData.append('matches', JSON.stringify(matches.filter((m) => m.employeeId !== null)))

      setUploadProgress(40)

      const res = await fetch('/api/payroll/tax-office-files', {
        method: 'POST',
        body: formData,
      })

      setUploadProgress(80)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `업로드 실패 (${res.status})`)
      }

      const data = await res.json()
      setUploadProgress(100)
      setUploadResult({ count: data.count ?? matches.filter((m) => m.employeeId !== null).length })
    } catch (err) {
      setUploadResult({
        count: 0,
        error: err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.',
      })
      setUploadProgress(100)
    } finally {
      setIsUploading(false)
    }
  }, [zipFile, year, month, clinicId, matches])

  const handleMatchChange = useCallback((fileName: string, employeeId: string) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.fileName === fileName
          ? { ...m, employeeId: employeeId === '__skip__' ? null : employeeId, autoMatched: false }
          : m
      )
    )
  }, [])

  const matchedCount = matches.filter((m) => m.employeeId !== null).length
  const autoMatchedCount = matches.filter((m) => m.autoMatched && m.employeeId !== null).length
  const manualNeededCount = matches.filter((m) => !m.autoMatched && m.employeeId === null).length

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900">세무서 급여명세서 업로드</h3>
            <div className="flex items-center gap-2 mt-1">
              {([1, 2, 3] as Step[]).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < 3 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                </div>
              ))}
              <span className="text-xs text-gray-500 ml-1">
                {step === 1 ? '파일 선택' : step === 2 ? '직원 매칭' : '업로드'}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: File Upload */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Year / Month */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">년도</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">월</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m}월
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP 파일 선택</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors
                    ${isDragging ? 'border-blue-400 bg-blue-50' : zipFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}
                >
                  {zipFile ? (
                    <>
                      <FileText className="w-10 h-10 text-green-500 mb-2" />
                      <p className="font-medium text-green-700">{zipFile.name}</p>
                      <p className="text-sm text-green-600 mt-1">{formatFileSize(zipFile.size)}</p>
                      <p className="text-xs text-gray-500 mt-2">클릭하여 다른 파일 선택</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-gray-400 mb-2" />
                      <p className="text-gray-600 font-medium">ZIP 파일을 드래그하거나 클릭하여 선택</p>
                      <p className="text-sm text-gray-400 mt-1">.zip 파일만 지원됩니다</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                    e.target.value = ''
                  }}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleNext}
                  disabled={!zipFile || isParsing}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      파일 분석 중...
                    </>
                  ) : (
                    <>
                      다음
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: File-Employee Matching */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-600">
                  총 <strong>{pdfFiles.length}</strong>개 파일
                </span>
                <span className="text-green-600 font-medium">
                  <Check className="w-3.5 h-3.5 inline mr-0.5" />
                  {autoMatchedCount}개 자동 매칭
                </span>
                {manualNeededCount > 0 && (
                  <span className="text-orange-600 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-0.5" />
                    {manualNeededCount}개 수동 매칭 필요
                  </span>
                )}
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">PDF 파일명</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">매칭된 직원</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600 w-16">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {matches.map((m) => (
                      <tr key={m.fileName} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700 truncate max-w-[200px]" title={m.fileName}>
                          <FileText className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />
                          {m.fileName}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={m.employeeId ?? '__skip__'}
                            onChange={(e) => handleMatchChange(m.fileName, e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="__skip__">건너뛰기</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {m.employeeId ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-orange-100 rounded-full">
                              <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleUpload}
                  disabled={matchedCount === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  업로드 ({matchedCount}개)
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Upload Progress & Result */}
          {step === 3 && (
            <div className="space-y-6 py-2">
              {isUploading ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0" />
                    <p className="text-gray-700 font-medium">업로드 중...</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 text-right">{uploadProgress}%</p>
                </div>
              ) : uploadResult ? (
                <div className="text-center space-y-4">
                  {uploadResult.error ? (
                    <>
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">업로드 실패</p>
                        <p className="text-sm text-red-600 mt-1">{uploadResult.error}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                          <Check className="w-8 h-8 text-green-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">
                          {uploadResult.count}개 파일 업로드 완료
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {year}년 {month}월 급여명세서가 등록되었습니다.
                        </p>
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => {
                      onUploadComplete()
                      handleClose()
                    }}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    닫기
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
