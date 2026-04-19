// src/components/WorkerGuardModal.tsx
'use client'

import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AlertTriangle, Download, RefreshCw, X, Loader2 } from 'lucide-react'
import { triggerWorkerDownload } from '@/lib/workers/installer'

export type GuardState = 'not_installed' | 'offline'
export type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

interface OpenOptions {
  type: WorkerType
  featureName: string
  state: GuardState
}

interface ModalProps extends OpenOptions {
  onResolve: (result: boolean) => void
}

// =====================================================
// Singleton mount (중복 호출 방지)
// =====================================================

let activePromise: Promise<boolean> | null = null
let activeRoot: Root | null = null
let activeContainer: HTMLDivElement | null = null

function unmountModal() {
  if (activeRoot) {
    activeRoot.unmount()
    activeRoot = null
  }
  if (activeContainer && activeContainer.parentNode) {
    activeContainer.parentNode.removeChild(activeContainer)
    activeContainer = null
  }
  activePromise = null
}

export function openWorkerGuardModal(opts: OpenOptions): Promise<boolean> {
  if (activePromise) return activePromise

  activePromise = new Promise<boolean>((resolve) => {
    activeContainer = document.createElement('div')
    document.body.appendChild(activeContainer)
    activeRoot = createRoot(activeContainer)

    const handleResolve = (result: boolean) => {
      resolve(result)
      // 다음 tick에 unmount (React state 정리 시간 확보)
      setTimeout(unmountModal, 0)
    }

    activeRoot.render(<WorkerGuardModal {...opts} onResolve={handleResolve} />)
  })

  return activePromise
}

// =====================================================
// 워커 상태 재핑 (모달 내부 사용)
// =====================================================

async function pingWorkerStatus(type: WorkerType): Promise<{ installed: boolean; online: boolean }> {
  try {
    const res = await fetch(`/api/workers/status?type=${type}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { installed: false, online: false }
    const data = await res.json()
    const slot = data[type]
    return {
      installed: slot?.installed ?? false,
      online: slot?.online ?? false,
    }
  } catch {
    return { installed: false, online: false }
  }
}

// =====================================================
// Modal Component
// =====================================================

function WorkerGuardModal({ type, featureName, state, onResolve }: ModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const isNotInstalled = state === 'not_installed'

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    const result = await triggerWorkerDownload()
    setDownloading(false)
    if (!result.ok) {
      setDownloadError(
        result.reason === 'unsupported_os'
          ? 'Windows 또는 macOS에서만 지원됩니다.'
          : '다운로드 URL을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'
      )
    }
  }

  const handleRecheck = async () => {
    setRechecking(true)
    const status = await pingWorkerStatus(type)
    setRechecking(false)
    if (status.installed && status.online) {
      onResolve(true)
    }
    // else: 모달 유지 — 미설치/오프라인 상태 그대로
  }

  const handleCancel = () => onResolve(false)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isNotInstalled ? '통합 워커 미설치' : '통합 워커 응답 없음'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-gray-700">
            <strong>{featureName}</strong> 기능을 사용하려면 통합 워커가{' '}
            {isNotInstalled ? '설치되어 있어야' : '실행 중이어야'} 합니다.
          </p>

          {isNotInstalled ? (
            <NotInstalledGuide />
          ) : (
            <OfflineGuide />
          )}

          {downloadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {downloadError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          {!isNotInstalled && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? '다운로드 중...' : '재설치'}
            </button>
          )}
          <button
            onClick={handleRecheck}
            disabled={rechecking}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {rechecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            다시 확인
          </button>
          {isNotInstalled && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              통합 워커 다운로드
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 가이드 컴포넌트
// =====================================================

function NotInstalledGuide() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="mb-2 font-medium text-amber-900">설치 방법</p>
      <ol className="list-decimal space-y-1 pl-5 text-amber-800">
        <li>아래 [통합 워커 다운로드] 버튼을 클릭합니다.</li>
        <li>다운로드된 <code className="rounded bg-amber-100 px-1">clinic-manager-worker-x.x.x-setup.exe</code>를 실행합니다.</li>
        <li>설치 마법사 안내에 따라 진행합니다.</li>
        <li>설치 완료 후 자동 실행됩니다 (작업 표시줄 트레이 아이콘 확인).</li>
        <li>1분 후 [다시 확인]을 눌러주세요.</li>
      </ol>
    </div>
  )
}

function OfflineGuide() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="mb-2 font-medium text-amber-900">해결 방법</p>
      <ol className="list-decimal space-y-1 pl-5 text-amber-800">
        <li>작업 표시줄 우측 트레이 영역을 확인합니다.</li>
        <li>통합 워커 아이콘을 우클릭하여 &ldquo;종료&rdquo;합니다.</li>
        <li>시작 메뉴에서 통합 워커를 다시 실행합니다.</li>
        <li>1분 후 [다시 확인]을 눌러주세요.</li>
      </ol>
    </div>
  )
}
