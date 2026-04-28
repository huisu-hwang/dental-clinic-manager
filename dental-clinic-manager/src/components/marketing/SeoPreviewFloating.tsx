'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSeoPreview } from '@/contexts/SeoPreviewContext'
import {
  ChartBarSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

// SEO 분석 진행률 플로팅 패널
// - status가 idle/completed인 경우는 표시하지 않음 (방해 최소화)
// - 진행 중(pending/running) 또는 실패 시 노출
// - 클릭 시 새 글 작성 페이지로 이동하여 결과 카드 확인 가능
export default function SeoPreviewFloating() {
  const seoPreview = useSeoPreview()
  const router = useRouter()
  const [isMinimized, setIsMinimized] = useState(false)

  const showAlways = seoPreview.status === 'pending' || seoPreview.status === 'running' || seoPreview.status === 'failed'
  if (!showAlways) return null

  const isFailed = seoPreview.status === 'failed'

  const handleOpen = () => {
    router.push('/dashboard/marketing/posts/new')
  }

  const handleDismiss = () => {
    seoPreview.reset()
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-lg border border-at-border hover:shadow-xl transition-all"
        title="SEO 분석 진행률"
      >
        {isFailed ? (
          <>
            <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
            <span className="text-xs font-medium text-at-error">SEO 분석 실패</span>
          </>
        ) : (
          <>
            <div className="relative w-5 h-5">
              <svg className="animate-spin h-5 w-5 text-indigo-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-indigo-600">SEO {seoPreview.progress}%</span>
          </>
        )}
        <ChevronUpIcon className="h-3 w-3 text-at-text" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 bg-white rounded-xl shadow-2xl border border-at-border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${isFailed ? 'bg-at-error-bg' : 'bg-gradient-to-r from-indigo-50 to-purple-50'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {isFailed ? (
            <ExclamationCircleIcon className="h-4 w-4 text-at-error flex-shrink-0" />
          ) : (
            <ChartBarSquareIcon className="h-4 w-4 text-indigo-600 flex-shrink-0" />
          )}
          <span className={`text-sm font-semibold ${isFailed ? 'text-at-error' : 'text-indigo-700'}`}>
            {isFailed ? 'SEO 분석 실패' : 'SEO 분석 진행 중'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 text-at-text hover:text-at-text-secondary rounded transition-colors"
            title="최소화"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          {isFailed && (
            <button
              onClick={handleDismiss}
              className="p-1 text-at-text hover:text-at-text-secondary rounded transition-colors"
              title="닫기"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="px-4 py-3 space-y-3">
        {seoPreview.appliedKeyword && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-at-text-weak truncate">키워드: {seoPreview.appliedKeyword}</span>
          </div>
        )}

        {!isFailed && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-at-text-secondary truncate pr-2">{seoPreview.step}</span>
                <span className="text-xs font-bold text-indigo-600 flex-shrink-0">{seoPreview.progress}%</span>
              </div>
              <div className="relative h-2 bg-at-surface-alt rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${seoPreview.progress}%` }}
                />
              </div>
            </div>
            <button
              onClick={handleOpen}
              className="w-full py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircleIcon className="h-4 w-4" />
              글 작성 페이지에서 보기
            </button>
          </>
        )}

        {isFailed && (
          <div className="space-y-2">
            <p className="text-xs text-at-error line-clamp-2">{seoPreview.error || '분석 중 오류가 발생했습니다.'}</p>
            <button
              onClick={handleDismiss}
              className="w-full py-2 bg-at-surface-alt text-at-text text-xs font-medium rounded-lg hover:bg-at-border transition-colors"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
