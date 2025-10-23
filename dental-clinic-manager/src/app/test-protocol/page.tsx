'use client'

import { useState } from 'react'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'
import ProtocolStepsEditor from '@/components/Protocol/ProtocolStepsEditor'
import SmartTagInput from '@/components/Protocol/SmartTagInput'
import type { ProtocolStep } from '@/types'

/**
 * 프로토콜 컴포넌트 테스트 페이지
 * 각 컴포넌트가 독립적으로 잘 작동하는지 확인
 */
export default function TestProtocolPage() {
  // 에디터 상태
  const [editorContent, setEditorContent] = useState('<p>테스트 콘텐츠를 입력하세요...</p>')

  // 단계 편집기 상태
  const [steps, setSteps] = useState<ProtocolStep[]>([
    {
      id: 'step-1',
      step_order: 0,
      title: '환자 준비',
      content: '환자를 편안하게 눕히고 구강을 확인합니다.',
      is_optional: false
    },
    {
      id: 'step-2',
      step_order: 1,
      title: '마취',
      content: '국소 마취를 시행합니다.',
      is_optional: false
    }
  ])

  // 태그 상태
  const [tags, setTags] = useState<string[]>(['임플란트', '보철'])
  const [title, setTitle] = useState('임플란트 식립 프로토콜')
  const [categoryId] = useState('test-category-id')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            프로토콜 컴포넌트 테스트 페이지
          </h1>
          <p className="text-slate-600">
            새로 구현된 프로토콜 컴포넌트들을 테스트하고 확인할 수 있습니다.
          </p>
        </div>

        {/* 1. Enhanced Tiptap Editor 테스트 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            1. Enhanced Tiptap Editor 테스트
          </h2>
          <div className="space-y-4">
            <div className="text-sm text-slate-600 mb-2">
              기능: 이미지 드래그앤드롭, YouTube 비디오, 테이블, 체크리스트
            </div>
            <EnhancedTiptapEditor
              content={editorContent}
              onChange={(content) => {
                setEditorContent(content)
                console.log('Editor content updated:', content)
              }}
              placeholder="여기에 내용을 입력하세요..."
              editable={true}
            />
            <div className="mt-4 p-4 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs font-mono text-slate-600">
                <div className="font-semibold mb-2">HTML Output:</div>
                <pre className="whitespace-pre-wrap break-all">
                  {editorContent.substring(0, 500)}...
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Protocol Steps Editor 테스트 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            2. Protocol Steps Editor 테스트
          </h2>
          <div className="space-y-4">
            <div className="text-sm text-slate-600 mb-2">
              기능: 단계 추가/삭제, 드래그앤드롭 순서 변경, 단계 복제
            </div>
            <ProtocolStepsEditor
              steps={steps}
              onChange={(newSteps) => {
                setSteps(newSteps)
                console.log('Steps updated:', newSteps)
              }}
              disabled={false}
            />
            <div className="mt-4 p-4 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-600">
                <div className="font-semibold mb-2">Current Steps:</div>
                {steps.map((step, index) => (
                  <div key={step.id} className="mb-1">
                    {index + 1}. {step.title} {step.is_optional && '(선택)'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Smart Tag Input 테스트 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            3. Smart Tag Input 테스트
          </h2>
          <div className="space-y-4">
            <div className="text-sm text-slate-600 mb-4">
              기능: 스마트 태그 추천, 자동완성, 사용 빈도 추적
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                프로토콜 제목 (태그 추천 기준)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="제목을 입력하면 관련 태그가 추천됩니다"
              />
            </div>

            <SmartTagInput
              value={tags}
              onChange={(newTags) => {
                setTags(newTags)
                console.log('Tags updated:', newTags)
              }}
              title={title}
              categoryId={categoryId}
              clinicId="test-clinic-id"
              disabled={false}
            />

            <div className="mt-4 p-4 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-600">
                <div className="font-semibold mb-2">Selected Tags:</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. 통합 테스트 결과 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            4. 통합 테스트 체크리스트
          </h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>리치 에디터에서 이미지 드래그앤드롭 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>YouTube 비디오 URL 임베딩 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>테이블 생성 및 편집 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>체크리스트 생성 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>단계 드래그앤드롭 순서 변경 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>단계 복제 기능 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>태그 추천 시스템 작동</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>태그 자동완성 작동</span>
            </label>
          </div>
        </div>

        {/* 뒤로가기 버튼 */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}