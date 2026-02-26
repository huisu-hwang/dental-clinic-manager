'use client'

import { useState, useRef, useCallback } from 'react'
import {
  HardDrive,
  Usb,
  Smartphone,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  FileKey,
  X,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  Info,
} from 'lucide-react'
import {
  findCertificatePairs,
  parseCertificate,
  getCANameFromPath,
  formatCertDate,
  getRemainingDays,
  type ParsedCertificate,
} from '@/lib/certificateParser'

export type StorageMedium = 'hard_disk' | 'removable' | 'security_token' | 'mobile'

interface CertificateSelectorProps {
  onSelect: (cert: ParsedCertificate, password: string) => void
  onCancel: () => void
  loading?: boolean
}

const STORAGE_MEDIA = [
  {
    id: 'hard_disk' as StorageMedium,
    label: '하드디스크',
    icon: HardDrive,
    description: 'PC에 저장된 인증서',
    hint: 'NPKI 폴더를 선택해주세요',
    enabled: true,
  },
  {
    id: 'removable' as StorageMedium,
    label: '이동식디스크',
    icon: Usb,
    description: 'USB 등 외장 저장장치',
    hint: 'USB의 NPKI 폴더를 선택해주세요',
    enabled: true,
  },
  {
    id: 'security_token' as StorageMedium,
    label: '보안토큰',
    icon: Shield,
    description: '보안토큰 장치',
    hint: '',
    enabled: false,
  },
  {
    id: 'mobile' as StorageMedium,
    label: '휴대폰',
    icon: Smartphone,
    description: '휴대폰 인증서',
    hint: '',
    enabled: false,
  },
]

export default function CertificateSelector({
  onSelect,
  onCancel,
  loading = false,
}: CertificateSelectorProps) {
  const [selectedMedium, setSelectedMedium] = useState<StorageMedium | null>(null)
  const [certificates, setCertificates] = useState<ParsedCertificate[]>([])
  const [selectedCert, setSelectedCert] = useState<ParsedCertificate | null>(null)
  const [certPassword, setCertPassword] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [scanned, setScanned] = useState(false)

  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 저장매체 선택 → 폴더 선택 다이얼로그
  const handleMediumSelect = useCallback((medium: StorageMedium) => {
    setSelectedMedium(medium)
    setCertificates([])
    setSelectedCert(null)
    setCertPassword('')
    setScanError('')
    setPasswordError('')
    setScanned(false)

    // 폴더 선택 다이얼로그 열기
    if (folderInputRef.current) {
      folderInputRef.current.click()
    }
  }, [])

  // 다시 검색 (같은 매체에서)
  const handleRescan = useCallback(() => {
    setCertificates([])
    setSelectedCert(null)
    setCertPassword('')
    setScanError('')
    setPasswordError('')
    setScanned(false)

    if (folderInputRef.current) {
      folderInputRef.current.click()
    }
  }, [])

  // 개별 파일 직접 선택
  const handleFileSelect = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [])

  // 폴더 선택 후 인증서 자동 검색
  const handleFolderChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setScanning(true)
    setScanError('')
    setCertificates([])
    setSelectedCert(null)
    setScanned(false)

    try {
      const pairs = findCertificatePairs(files)

      if (pairs.length === 0) {
        setScanError(
          '선택한 폴더에서 인증서를 찾을 수 없습니다.\n' +
          'NPKI 폴더 또는 그 상위 폴더를 선택해주세요.'
        )
        setScanned(true)
        return
      }

      // 모든 인증서 파싱
      const parsed: ParsedCertificate[] = []
      for (const pair of pairs) {
        try {
          const cert = await parseCertificate(pair)
          parsed.push(cert)
        } catch (err) {
          console.warn('인증서 파싱 실패:', pair.dirPath, err)
        }
      }

      if (parsed.length === 0) {
        setScanError('인증서 파일을 읽을 수 없습니다. 올바른 인증서 폴더인지 확인해주세요.')
        setScanned(true)
        return
      }

      // 만료되지 않은 인증서 우선, 유효기간 내림차순 정렬
      parsed.sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1
        return b.notAfter.getTime() - a.notAfter.getTime()
      })

      setCertificates(parsed)

      // 유효한 인증서가 하나뿐이면 자동 선택
      const validCerts = parsed.filter(c => !c.isExpired)
      if (validCerts.length === 1) {
        setSelectedCert(validCerts[0])
      }
    } catch (err) {
      console.error('인증서 검색 오류:', err)
      setScanError('인증서 검색 중 오류가 발생했습니다.')
    } finally {
      setScanning(false)
      setScanned(true)
      // input value 리셋 (같은 폴더 재선택 가능)
      e.target.value = ''
    }
  }, [])

  // 개별 파일(signCert.der, signPri.key) 직접 선택 처리
  const handleFilesChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setScanning(true)
    setScanError('')

    try {
      let certFile: File | null = null
      let keyFile: File | null = null

      for (let i = 0; i < files.length; i++) {
        if (files[i].name === 'signCert.der' || files[i].name.endsWith('.der')) certFile = files[i]
        if (files[i].name === 'signPri.key' || files[i].name.endsWith('.key')) keyFile = files[i]
      }

      if (!certFile || !keyFile) {
        setScanError('signCert.der 와 signPri.key 파일을 모두 선택해주세요.')
        return
      }

      const cert = await parseCertificate({
        certFile,
        keyFile,
        dirPath: '직접 선택',
      })

      setCertificates([cert])
      setSelectedCert(cert)
      setScanned(true)
    } catch (err) {
      console.error('인증서 파싱 오류:', err)
      setScanError('인증서 파일을 읽을 수 없습니다. 올바른 파일인지 확인해주세요.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }, [])

  // 확인 버튼
  const handleSubmit = () => {
    if (!selectedCert) return

    if (!certPassword) {
      setPasswordError('인증서 비밀번호를 입력해주세요.')
      return
    }

    setPasswordError('')
    onSelect(selectedCert, certPassword)
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <FileKey className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">공동인증서 선택</h3>
        </div>
        <button
          onClick={onCancel}
          disabled={loading}
          className="p-1.5 hover:bg-white/60 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Step 1: 저장매체 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            1. 인증서 저장매체 선택
          </label>
          <div className="grid grid-cols-2 gap-2">
            {STORAGE_MEDIA.map(medium => {
              const Icon = medium.icon
              return (
                <button
                  key={medium.id}
                  onClick={() => medium.enabled && handleMediumSelect(medium.id)}
                  disabled={!medium.enabled || scanning || loading}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    selectedMedium === medium.id
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : medium.enabled
                        ? 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    selectedMedium === medium.id
                      ? 'bg-blue-100'
                      : 'bg-gray-100'
                  }`}>
                    <Icon className={`w-4.5 h-4.5 ${
                      selectedMedium === medium.id ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${
                      selectedMedium === medium.id ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {medium.label}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{medium.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 스캔 중 표시 */}
        {scanning && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm">인증서를 검색하고 있습니다...</span>
          </div>
        )}

        {/* 에러 메시지 */}
        {scanError && !scanning && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700 whitespace-pre-line">{scanError}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleRescan}
                  className="text-xs text-red-600 hover:text-red-800 underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  다른 폴더 선택
                </button>
                <button
                  onClick={handleFileSelect}
                  className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  <FolderOpen className="w-3 h-3" />
                  파일 직접 선택
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NPKI 폴더 위치 안내 */}
        {selectedMedium && scanned && scanError && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700 space-y-1">
              <p className="font-medium">NPKI 폴더 기본 위치:</p>
              <p>Mac: ~/Library/Preferences/NPKI</p>
              <p>Windows: C:\Users\사용자\AppData\LocalLow\NPKI</p>
              <p>USB: USB드라이브\NPKI</p>
            </div>
          </div>
        )}

        {/* Step 2: 인증서 목록 */}
        {certificates.length > 0 && !scanning && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                2. 인증서 선택 ({certificates.filter(c => !c.isExpired).length}개 유효 / 총 {certificates.length}개)
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRescan}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  다시 검색
                </button>
                <button
                  onClick={handleFileSelect}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <FolderOpen className="w-3 h-3" />
                  파일 직접 선택
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {certificates.map((cert, index) => {
                const isSelected = selectedCert?.serialNumber === cert.serialNumber
                const remaining = getRemainingDays(cert.notAfter)
                const caName = cert.issuerCN || getCANameFromPath(cert.certPath)

                return (
                  <button
                    key={cert.serialNumber || index}
                    onClick={() => {
                      if (!cert.isExpired) {
                        setSelectedCert(cert)
                        setPasswordError('')
                      }
                    }}
                    disabled={cert.isExpired || loading}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : cert.isExpired
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 선택 인디케이터 */}
                      <div className="mt-0.5 flex-shrink-0">
                        {isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-blue-600" />
                        ) : (
                          <div className={`w-5 h-5 rounded-full border-2 ${
                            cert.isExpired ? 'border-gray-300' : 'border-gray-300'
                          }`} />
                        )}
                      </div>

                      {/* 인증서 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium text-sm ${
                            isSelected ? 'text-blue-800' : 'text-gray-900'
                          }`}>
                            {cert.subjectCN}
                          </span>
                          {cert.isExpired ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">
                              만료됨
                            </span>
                          ) : remaining <= 30 ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">
                              {remaining}일 남음
                            </span>
                          ) : null}
                          {cert.usage !== '일반' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {cert.usage}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs text-gray-500">
                            발급기관: {caName}
                          </p>
                          <p className="text-xs text-gray-400">
                            유효기간: {formatCertDate(cert.notBefore)} ~ {formatCertDate(cert.notAfter)}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className={`w-4 h-4 mt-1 flex-shrink-0 ${
                        isSelected ? 'text-blue-400' : 'text-gray-300'
                      }`} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 3: 인증서 비밀번호 입력 */}
        {selectedCert && !scanning && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Lock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              3. 인증서 비밀번호
            </label>
            <input
              type="password"
              value={certPassword}
              onChange={e => {
                setCertPassword(e.target.value)
                setPasswordError('')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && certPassword) handleSubmit()
              }}
              className={`w-full px-3 py-2.5 border rounded-lg transition-colors ${
                passwordError
                  ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              }`}
              placeholder="인증서 비밀번호를 입력하세요"
              autoFocus
              autoComplete="off"
            />
            {passwordError && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {passwordError}
              </p>
            )}
          </div>
        )}

        {/* 버튼 영역 */}
        <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={handleSubmit}
            disabled={!selectedCert || !certPassword || loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                확인
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error webkitdirectory is a non-standard attribute
        webkitdirectory=""
        directory=""
        onChange={handleFolderChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".der,.key"
        onChange={handleFilesChange}
      />
    </div>
  )
}
