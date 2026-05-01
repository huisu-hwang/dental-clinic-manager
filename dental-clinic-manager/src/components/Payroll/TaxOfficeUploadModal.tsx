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
  uploadedBy: string
  employees: { id: string; name: string }[]
}

interface FileMatch {
  fileName: string
  zipPath: string  // ZIP 내부 전체 경로
  employeeId: string | null
  autoMatched: boolean
}

type Step = 1 | 2 | 3

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractKoreanNames(fileName: string): string[] {
  // 파일명의 모든 한글 2~4자 시퀀스 (예: "71_유지혜_202604.pdf" → ["유지혜"],
  // "급여명세서_홍길동_2026.pdf" → ["급여명세서", "홍길동"])
  const matches = fileName.match(/[가-힣]{2,4}/g)
  return matches ?? []
}

export default function TaxOfficeUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  clinicId,
  uploadedBy,
  employees,
}: TaxOfficeUploadModalProps) {
  const currentDate = new Date()
  const [step, setStep] = useState<Step>(1)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
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

  const isZipMode =
    selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith('.zip')
  const isPdfMode =
    selectedFiles.length > 0 &&
    selectedFiles.every((f) => f.name.toLowerCase().endsWith('.pdf'))

  const resetState = useCallback(() => {
    setStep(1)
    setSelectedFiles([])
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
    (files: { name: string; path: string }[]): FileMatch[] => {
      return files.map((file) => {
        const candidates = extractKoreanNames(file.name)
        if (candidates.length === 0) {
          return { fileName: file.name, zipPath: file.path, employeeId: null, autoMatched: false }
        }

        // 1순위: 정확 매칭 (모든 후보를 직원과 비교)
        for (const c of candidates) {
          const exact = employees.find((e) => e.name === c)
          if (exact) return { fileName: file.name, zipPath: file.path, employeeId: exact.id, autoMatched: true }
        }

        // 2순위: 부분 매칭 (포함 관계)
        for (const c of candidates) {
          const partial = employees.find(
            (e) => e.name.includes(c) || c.includes(e.name)
          )
          if (partial) return { fileName: file.name, zipPath: file.path, employeeId: partial.id, autoMatched: true }
        }

        return { fileName: file.name, zipPath: file.path, employeeId: null, autoMatched: false }
      })
    },
    [employees]
  )

  const handleFilesSelect = useCallback((filesArr: File[]) => {
    if (filesArr.length === 0) return

    const allPdf = filesArr.every((f) => f.name.toLowerCase().endsWith('.pdf'))
    const singleZip =
      filesArr.length === 1 && filesArr[0].name.toLowerCase().endsWith('.zip')

    if (!singleZip && !allPdf) {
      setParseError('ZIP 파일 1개 또는 PDF 파일만 선택할 수 있습니다.')
      return
    }

    setParseError(null)
    setSelectedFiles(filesArr)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const filesArr = Array.from(e.dataTransfer.files)
      if (filesArr.length > 0) handleFilesSelect(filesArr)
    },
    [handleFilesSelect]
  )

  const handleNext = useCallback(async () => {
    if (selectedFiles.length === 0) return
    setIsParsing(true)
    setParseError(null)

    try {
      if (isZipMode) {
        const formData = new FormData()
        formData.append('zipFile', selectedFiles[0])

        const res = await fetch('/api/payroll/tax-office-files/parse-zip', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `서버 오류 (${res.status})`)
        }

        const data = await res.json()
        const files: { name: string; path: string }[] = data.data ?? []
        setPdfFiles(files.map((f) => f.name))
        setMatches(autoMatch(files))
        setStep(2)
      } else if (isPdfMode) {
        const files = selectedFiles.map((f) => ({ name: f.name, path: f.name }))
        setPdfFiles(files.map((f) => f.name))
        setMatches(autoMatch(files))
        setStep(2)
      } else {
        throw new Error('ZIP 파일 1개 또는 PDF 파일만 업로드할 수 있습니다.')
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '파일 분석 중 오류가 발생했습니다.')
    } finally {
      setIsParsing(false)
    }
  }, [selectedFiles, isZipMode, isPdfMode, autoMatch])

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return
    setIsUploading(true)
    setUploadProgress(10)
    setStep(3)

    try {
      const formData = new FormData()
      if (isZipMode) {
        formData.append('zipFile', selectedFiles[0])
      } else {
        selectedFiles.forEach((f) => formData.append('pdfFiles', f))
      }
      formData.append('year', String(year))
      formData.append('month', String(month))
      formData.append('clinicId', clinicId)
      formData.append('uploadedBy', uploadedBy)
      // API expects matchedEmployeeId field name, and fileName must be the ZIP-internal path
      const apiMatches = matches
        .filter((m) => m.employeeId !== null)
        .map((m, i) => ({
          fileName: m.zipPath,  // ZIP 내부 전체 경로 (zip.file() 조회용)
          fileIndex: i,
          matchedEmployeeId: m.employeeId,
          matchedEmployeeName: employees.find(e => e.id === m.employeeId)?.name || null,
          autoMatched: m.autoMatched,
          confidence: m.autoMatched ? 'exact' : 'none',
        }))
      formData.append('matches', JSON.stringify(apiMatches))

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
  }, [selectedFiles, isZipMode, year, month, clinicId, uploadedBy, matches, employees])

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
            <h3 className="text-lg font-bold text-at-text">세무서 급여명세서 업로드</h3>
            <div className="flex items-center gap-2 mt-1">
              {([1, 2, 3] as Step[]).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${step === s ? 'bg-at-accent text-white' : step > s ? 'bg-green-500 text-white' : 'bg-at-border text-at-text-weak'}`}
                  >
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < 3 && <ChevronRight className="w-3 h-3 text-at-text-weak" />}
                </div>
              ))}
              <span className="text-xs text-at-text-weak ml-1">
                {step === 1 ? '파일 선택' : step === 2 ? '직원 매칭' : '업로드'}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-xl hover:bg-at-surface-alt text-at-text-weak hover:text-at-text-secondary transition-colors"
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
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">년도</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">월</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
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
                <label className="block text-sm font-medium text-at-text-secondary mb-1">파일 선택</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors
                    ${isDragging ? 'border-blue-400 bg-at-accent-light' : selectedFiles.length > 0 ? 'border-green-400 bg-at-success-bg' : 'border-at-border hover:border-blue-400 hover:bg-at-accent-light'}`}
                >
                  {selectedFiles.length > 0 ? (
                    <>
                      <FileText className="w-10 h-10 text-green-500 mb-2" />
                      {isZipMode ? (
                        <>
                          <p className="font-medium text-at-success">{selectedFiles[0].name}</p>
                          <p className="text-sm text-at-success mt-1">{formatFileSize(selectedFiles[0].size)}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-at-success">PDF 파일 {selectedFiles.length}개 선택됨</p>
                          <p className="text-sm text-at-success mt-1">
                            총 {formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0))}
                          </p>
                          <p className="text-xs text-at-text-weak mt-1 max-w-full truncate">
                            {selectedFiles.map((f) => f.name).join(', ')}
                          </p>
                        </>
                      )}
                      <p className="text-xs text-at-text-weak mt-2">클릭하여 다른 파일 선택</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-at-text-weak mb-2" />
                      <p className="text-at-text-secondary font-medium">ZIP 또는 PDF 파일을 드래그하거나 클릭하여 선택</p>
                      <p className="text-sm text-at-text-weak mt-1">.zip 1개 또는 .pdf 1개 이상 지원</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const filesArr = Array.from(e.target.files ?? [])
                    if (filesArr.length > 0) handleFilesSelect(filesArr)
                    e.target.value = ''
                  }}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-at-error-bg border border-red-200 rounded-xl text-sm text-at-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleNext}
                  disabled={selectedFiles.length === 0 || isParsing}
                  className="flex items-center gap-2 px-5 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <div className="flex items-center gap-3 p-3 bg-at-surface-alt rounded-xl text-sm">
                <span className="text-at-text-secondary">
                  총 <strong>{pdfFiles.length}</strong>개 파일
                </span>
                <span className="text-at-success font-medium">
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
              <div className="border border-at-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-at-surface-alt border-b border-at-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">PDF 파일명</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">매칭된 직원</th>
                      <th className="text-center px-4 py-2.5 font-medium text-at-text-secondary w-16">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-at-border">
                    {matches.map((m) => (
                      <tr key={m.fileName} className="hover:bg-at-surface-alt">
                        <td className="px-4 py-2.5 text-at-text-secondary truncate max-w-[200px]" title={m.fileName}>
                          <FileText className="w-3.5 h-3.5 inline mr-1.5 text-at-text-weak" />
                          {m.fileName}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={m.employeeId ?? '__skip__'}
                            onChange={(e) => handleMatchChange(m.fileName, e.target.value)}
                            className="w-full border border-at-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
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
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-at-success-bg rounded-full">
                              <Check className="w-3.5 h-3.5 text-at-success" />
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
                  className="px-4 py-2 text-sm text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-alt transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleUpload}
                  disabled={matchedCount === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    <Loader2 className="w-6 h-6 text-at-accent animate-spin flex-shrink-0" />
                    <p className="text-at-text-secondary font-medium">업로드 중...</p>
                  </div>
                  <div className="w-full bg-at-border rounded-full h-2">
                    <div
                      className="bg-at-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-at-text-weak text-right">{uploadProgress}%</p>
                </div>
              ) : uploadResult ? (
                <div className="text-center space-y-4">
                  {uploadResult.error ? (
                    <>
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-at-error-bg rounded-full flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-at-text">업로드 실패</p>
                        <p className="text-sm text-at-error mt-1">{uploadResult.error}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-at-success-bg rounded-full flex items-center justify-center">
                          <Check className="w-8 h-8 text-green-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-at-text">
                          {uploadResult.count}개 파일 업로드 완료
                        </p>
                        <p className="text-sm text-at-text-weak mt-1">
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
                    className="px-6 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
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
