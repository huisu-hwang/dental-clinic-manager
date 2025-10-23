'use client'

import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, PlusIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { tagSuggestionService } from '@/lib/tagSuggestionService'
import type { TagSuggestion } from '@/types'

interface SmartTagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  title?: string
  categoryId?: string
  clinicId: string
  disabled?: boolean
}

export default function SmartTagInput({
  value,
  onChange,
  title = '',
  categoryId,
  clinicId,
  disabled = false
}: SmartTagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<{
    keywords: string[]
    category: string[]
    frequent: TagSuggestion[]
  }>({
    keywords: [],
    category: [],
    frequent: []
  })
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // 태그 추천 가져오기
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!clinicId) return

      const result = await tagSuggestionService.getTagSuggestions(
        title,
        categoryId,
        clinicId
      )
      setSuggestions(result)
      setShowSuggestions(true)
    }

    // 디바운스: 제목이나 카테고리 변경 후 500ms 대기
    const timer = setTimeout(fetchSuggestions, 500)
    return () => clearTimeout(timer)
  }, [title, categoryId, clinicId])

  // 입력 중 자동완성
  useEffect(() => {
    const searchTags = async () => {
      if (inputValue.length < 1) {
        setAutocompleteSuggestions([])
        return
      }

      const results = await tagSuggestionService.searchTags(clinicId, inputValue)
      setAutocompleteSuggestions(results)
    }

    const timer = setTimeout(searchTags, 300)
    return () => clearTimeout(timer)
  }, [inputValue, clinicId])

  // 태그 추가
  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag])
      setInputValue('')
      setAutocompleteSuggestions([])
      setSelectedIndex(-1)
    }
  }

  // 태그 제거
  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove))
  }

  // 키보드 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && autocompleteSuggestions[selectedIndex]) {
        addTag(autocompleteSuggestions[selectedIndex])
      } else if (inputValue) {
        addTag(inputValue)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev =>
        prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Escape') {
      setAutocompleteSuggestions([])
      setSelectedIndex(-1)
    }
  }

  // 추천 태그 필터링 (이미 선택된 태그 제외)
  const getFilteredSuggestions = (tags: string[]) => {
    return tags.filter(tag => !value.includes(tag))
  }

  const allSuggestions = [
    ...new Set([
      ...suggestions.keywords,
      ...suggestions.category,
      ...suggestions.frequent.map(t => t.tag_name)
    ])
  ]

  const filteredAllSuggestions = getFilteredSuggestions(allSuggestions)

  return (
    <div className="space-y-3">
      {/* 현재 태그 목록 */}
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-2 hover:text-blue-600"
              disabled={disabled}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </span>
        ))}
      </div>

      {/* 태그 입력 필드 */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="태그 입력 (선택사항)"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => inputValue && addTag(inputValue)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md flex items-center"
            disabled={disabled || !inputValue}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {/* 자동완성 드롭다운 */}
        {autocompleteSuggestions.length > 0 && inputValue && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg">
            {autocompleteSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addTag(suggestion)}
                className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${
                  index === selectedIndex ? 'bg-blue-50' : ''
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 추천 태그 섹션 */}
      {showSuggestions && filteredAllSuggestions.length > 0 && (
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-slate-700">추천 태그</span>
            <button
              type="button"
              onClick={() => setShowSuggestions(false)}
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {/* 키워드 기반 추천 */}
            {suggestions.keywords.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">제목에서 추출</p>
                <div className="flex flex-wrap gap-1">
                  {getFilteredSuggestions(suggestions.keywords).map((tag) => (
                    <button
                      key={`keyword-${tag}`}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      disabled={disabled}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 카테고리 기반 추천 */}
            {suggestions.category.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">카테고리 관련</p>
                <div className="flex flex-wrap gap-1">
                  {getFilteredSuggestions(suggestions.category).slice(0, 5).map((tag) => (
                    <button
                      key={`category-${tag}`}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      disabled={disabled}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 자주 사용하는 태그 */}
            {suggestions.frequent.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">자주 사용</p>
                <div className="flex flex-wrap gap-1">
                  {suggestions.frequent
                    .filter(t => !value.includes(t.tag_name))
                    .slice(0, 5)
                    .map((tag) => (
                      <button
                        key={`frequent-${tag.id}`}
                        type="button"
                        onClick={() => addTag(tag.tag_name)}
                        className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                        disabled={disabled}
                      >
                        + {tag.tag_name}
                        <span className="ml-1 text-slate-400">({tag.usage_count})</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 태그 설명 */}
      <p className="text-xs text-slate-500">
        태그는 선택사항입니다. 프로토콜을 쉽게 찾을 수 있도록 관련 키워드를 추가하세요.
      </p>
    </div>
  )
}