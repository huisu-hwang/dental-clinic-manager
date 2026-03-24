'use client'

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import type { GeneratedContent, PlatformContent, PlatformOptions } from '@/types/marketing'

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
  platforms: PlatformOptions
  imageStyle: string
  imageVisualStyle: string
  imageCount: number
  referenceImageBase64?: string
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
        const res = await fetch('/api/marketing/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: options.topic,
            keyword: options.keyword,
            postType: options.postType,
            tone: options.tone,
            useResearch: options.useResearch,
            factCheck: options.factCheck,
            platforms: options.platforms,
            imageStyle: options.imageStyle,
            imageVisualStyle: options.imageVisualStyle,
            imageCount: options.imageCount,
            ...(options.imageStyle === 'use_own_image' && options.referenceImageBase64
              ? { referenceImageBase64: options.referenceImageBase64 }
              : {}),
          }),
          signal: abortController.signal,
        })

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

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))

              if (data.heartbeat) continue
              if (data.error) throw new Error(data.error)

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
