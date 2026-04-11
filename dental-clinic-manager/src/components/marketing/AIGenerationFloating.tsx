'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAIGeneration } from '@/contexts/AIGenerationContext'
import {
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

export default function AIGenerationFloating() {
  const {
    isGenerating,
    generationProgress,
    generationStep,
    generationError,
    generatedResult,
    generationTopic,
    clearGeneration,
  } = useAIGeneration()
  const router = useRouter()
  const [isMinimized, setIsMinimized] = useState(false)

  // 생성 중이 아니고 결과도 없고 에러도 없으면 표시하지 않음
  if (!isGenerating && !generatedResult && !generationError) return null

  const handleGoToResult = () => {
    const postId = generatedResult?.savedItemId
    if (postId) {
      router.push(`/dashboard/marketing?viewPost=${postId}`)
    } else {
      router.push('/dashboard/marketing')
    }
    clearGeneration()
  }

  const handleDismiss = () => {
    clearGeneration()
  }

  // 완료 상태
  const isCompleted = !isGenerating && generatedResult
  const isError = !isGenerating && generationError

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-lg border border-at-border hover:shadow-xl transition-all"
      >
        {isGenerating ? (
          <>
            <div className="relative w-5 h-5">
              <svg className="animate-spin h-5 w-5 text-indigo-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-indigo-600">{generationProgress}%</span>
          </>
        ) : isCompleted ? (
          <>
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <span className="text-xs font-medium text-green-600">완료</span>
          </>
        ) : (
          <>
            <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
            <span className="text-xs font-medium text-red-600">실패</span>
          </>
        )}
        <ChevronUpIcon className="h-3 w-3 text-at-text" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-xl shadow-2xl border border-at-border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${
        isCompleted ? 'bg-green-50' : isError ? 'bg-red-50' : 'bg-gradient-to-r from-indigo-50 to-purple-50'
      }`}>
        <div className="flex items-center gap-2">
          {isGenerating ? (
            <svg className="animate-spin h-4 w-4 text-indigo-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isCompleted ? (
            <CheckCircleIcon className="h-4 w-4 text-green-600" />
          ) : (
            <ExclamationCircleIcon className="h-4 w-4 text-red-600" />
          )}
          <span className={`text-sm font-semibold ${
            isCompleted ? 'text-green-700' : isError ? 'text-red-700' : 'text-indigo-700'
          }`}>
            {isGenerating ? 'AI 글 생성 중' : isCompleted ? '생성 완료' : '생성 실패'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 text-at-text hover:text-at-text rounded transition-colors"
            title="최소화"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          {!isGenerating && (
            <button
              onClick={handleDismiss}
              className="p-1 text-at-text hover:text-at-text rounded transition-colors"
              title="닫기"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="px-4 py-3 space-y-3">
        {/* 주제 표시 */}
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-at-text flex-shrink-0" />
          <span className="text-xs text-at-text truncate">{generationTopic}</span>
        </div>

        {/* 진행률 바 (생성 중) */}
        {isGenerating && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-at-text">{generationStep}</span>
                <span className="text-xs font-bold text-indigo-600">{generationProgress}%</span>
              </div>
              <div className="relative h-2 bg-at-surface-alt rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>
            {/* 마일스톤 */}
            <div className="flex justify-between text-[10px]">
              {[
                { label: '글 작성', threshold: 5 },
                { label: '이미지', threshold: 55 },
                { label: '저장', threshold: 95 },
                { label: '완료', threshold: 100 },
              ].map(({ label, threshold }) => (
                <span
                  key={label}
                  className={`transition-colors duration-300 ${
                    generationProgress >= threshold
                      ? threshold === 100
                        ? 'text-green-500 font-semibold'
                        : 'text-indigo-500 font-semibold'
                      : 'text-at-text'
                  }`}
                >
                  {generationProgress >= threshold ? '✓ ' : ''}{label}
                </span>
              ))}
            </div>
          </>
        )}

        {/* 완료 시 */}
        {isCompleted && (
          <button
            onClick={handleGoToResult}
            className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <SparklesIcon className="h-4 w-4" />
            결과 확인하기
          </button>
        )}

        {/* 에러 시 */}
        {isError && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 line-clamp-2">{generationError}</p>
            <button
              onClick={handleDismiss}
              className="w-full py-2 bg-at-surface-alt text-at-text text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
