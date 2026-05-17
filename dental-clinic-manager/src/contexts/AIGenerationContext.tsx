'use client'

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import type { GeneratedContent, PlatformContent, PlatformOptions, ClinicalPhotoInput } from '@/types/marketing'
import type { BrandImageOptions } from '@/types/brand'

export type GeneratedResultType = GeneratedContent & {
  generatedImages?: { fileName: string; prompt: string; path?: string }[]
  platformContent?: PlatformContent
  savedItemId?: string
}

interface GenerationOptions {
  topic: string
  keyword: string
  postType: string
  tone: string
  useResearch: boolean
  factCheck: boolean
  useSeoAnalysis: boolean
  platforms: PlatformOptions
  imageStyle: string
  /** 스타일별 이미지 개수 분배 (multi-select 시). 합계가 imageCount 와 같아야 함. */
  imageStyleAllocation?: Partial<Record<'infographic_only' | 'allow_person' | 'use_own_image', number>>
  imageVisualStyle: string
  imageCount: number
  /** 사용자가 정한 목표 본문 길이(자). 미지정 시 서버에서 기본값 사용. */
  targetWordCount?: number
  referenceImageBase64?: string
  /** 브랜드 이미지(의료법/타이틀/사진) 삽입 옵션 */
  brandImageOptions?: BrandImageOptions
  clinical?: {
    procedureType: string
    procedureDetail?: string
    duration?: string
    patientAge?: string
    patientGender?: string
    chiefComplaint?: string
    selectedTeeth?: number[]
    patientConsent: boolean
    photos: ClinicalPhotoInput[]
  }
}

interface AIGenerationContextType {
  // 상태
  isGenerating: boolean
  generationProgress: number
  generationStep: string
  generationError: string
  generatedResult: GeneratedResultType | null
  generationTopic: string
  generationKeyword: string
  // 액션
  startGeneration: (options: GenerationOptions) => void
  clearGeneration: () => void
  // 결과 콜백 등록 (폼에서 결과를 받기 위해)
  onResultCallback: React.MutableRefObject<((result: GeneratedResultType) => void) | null>
}

const AIGenerationContext = createContext<AIGenerationContextType | null>(null)

export function useAIGeneration() {
  const ctx = useContext(AIGenerationContext)
  if (!ctx) throw new Error('useAIGeneration must be used within AIGenerationProvider')
  return ctx
}

export function AIGenerationProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStep, setGenerationStep] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [generatedResult, setGeneratedResult] = useState<GeneratedResultType | null>(null)
  const [generationTopic, setGenerationTopic] = useState('')
  const [generationKeyword, setGenerationKeyword] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const onResultCallback = useRef<((result: GeneratedResultType) => void) | null>(null)

  const startGeneration = useCallback((options: GenerationOptions) => {
    // 이전 요청 중단
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const abortController = new AbortController()
    abortRef.current = abortController

    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationStep('준비 중...')
    setGenerationError('')
    setGeneratedResult(null)
    setGenerationTopic(options.topic)
    setGenerationKeyword(options.keyword)

    // SSE 스트리밍을 비동기로 실행
    ;(async () => {
      try {
        const requestBody = JSON.stringify({
          topic: options.topic,
          keyword: options.keyword,
          postType: options.postType,
          tone: options.tone,
          useResearch: options.useResearch,
          factCheck: options.factCheck,
          useSeoAnalysis: options.useSeoAnalysis,
          platforms: options.platforms,
          imageStyle: options.imageStyle,
          imageVisualStyle: options.imageVisualStyle,
          imageCount: options.imageCount,
          ...(options.imageStyleAllocation ? { imageStyleAllocation: options.imageStyleAllocation } : {}),
          ...(options.targetWordCount ? { targetWordCount: options.targetWordCount } : {}),
          ...((options.imageStyleAllocation?.use_own_image ?? 0) > 0 && options.referenceImageBase64
            ? { referenceImageBase64: options.referenceImageBase64 }
            : options.imageStyle === 'use_own_image' && options.referenceImageBase64
            ? { referenceImageBase64: options.referenceImageBase64 }
            : {}),
          ...(options.clinical ? { clinical: options.clinical } : {}),
          ...(options.brandImageOptions ? { brandImageOptions: options.brandImageOptions } : {}),
        })

        // 첫 호출은 Vercel cold start / dev 첫 컴파일로 네트워크 오류가 날 수 있어
        // 자동 1회 재시도 (사용자가 "두 번째는 된다"고 보고한 패턴 해결).
        const doFetch = (): Promise<Response> =>
          fetch('/api/marketing/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal: abortController.signal,
          })

        let res: Response
        try {
          res = await doFetch()
        } catch (firstErr) {
          if (firstErr instanceof Error && firstErr.name === 'AbortError') throw firstErr
          // 첫 호출 실패(콜드 스타트 등) → 1.5초 대기 후 재시도
          await new Promise((r) => setTimeout(r, 1500))
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          res = await doFetch()
        }

        if (!res.ok || !res.body) {
          const text = await res.text()
          let errorMessage = '글 생성 실패'
          try {
            const json = JSON.parse(text)
            errorMessage = json.error || errorMessage
          } catch {
            errorMessage = text.length > 100 ? text.slice(0, 100) + '...' : text || errorMessage
          }
          throw new Error(errorMessage)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        // idle timeout: 서버가 120초간 어떤 chunk도 보내지 않으면 hang으로 판단하고 abort
        // (서버는 5초 간격 heartbeat 송신; 120초는 SEO 워커 polling·Vercel cold start 안전 마진)
        const IDLE_TIMEOUT_MS = 120000
        let idleTimer: ReturnType<typeof setTimeout> | null = null
        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            try { abortController.abort() } catch { /* noop */ }
          }, IDLE_TIMEOUT_MS)
        }
        resetIdleTimer()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            resetIdleTimer()

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const data = JSON.parse(line.slice(6))

                if (data.heartbeat) continue
                if (data.error) throw new Error(data.error)
                if (data.saveWarning) {
                  // 글은 정상 생성되었지만 자동 저장 실패 — 에러로 표시(생성된 본문은 result로 들어옴)
                  setGenerationError(String(data.saveWarning))
                }

                if (data.progress !== undefined) setGenerationProgress(data.progress)
                if (data.step) setGenerationStep(data.step)

                if (data.result) {
                  const result: GeneratedResultType = data.result
                  setGeneratedResult(result)
                  // 콜백으로 결과 전달 (폼이 마운트되어 있으면)
                  onResultCallback.current?.(result)
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                  throw parseErr
                }
              }
            }
          }
        } finally {
          if (idleTimer) clearTimeout(idleTimer)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setGenerationError(err instanceof Error ? err.message : '글 생성 중 오류가 발생했습니다.')
      } finally {
        setIsGenerating(false)
      }
    })()
  }, [])

  const clearGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsGenerating(false)
    setGenerationProgress(0)
    setGenerationStep('')
    setGenerationError('')
    setGeneratedResult(null)
    setGenerationTopic('')
    setGenerationKeyword('')
  }, [])

  return (
    <AIGenerationContext.Provider
      value={{
        isGenerating,
        generationProgress,
        generationStep,
        generationError,
        generatedResult,
        generationTopic,
        generationKeyword,
        startGeneration,
        clearGeneration,
        onResultCallback,
      }}
    >
      {children}
    </AIGenerationContext.Provider>
  )
}
