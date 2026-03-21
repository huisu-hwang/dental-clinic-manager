'use client'

import { Lock, FileText, Download, Calendar, AlertCircle } from 'lucide-react'
import type { SharedPostData } from '@/types/sharedLink'
import { SOURCE_TYPE_LABELS } from '@/types/sharedLink'

interface SharedPostViewProps {
  loginRequired?: boolean
  postData?: SharedPostData
}

export default function SharedPostView({ loginRequired, postData }: SharedPostViewProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 로그인 필요 화면
  if (loginRequired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">로그인이 필요합니다</h1>
          <p className="text-gray-500 mb-6">
            이 게시물은 서비스 가입자만 볼 수 있습니다.<br />
            로그인 후 다시 시도해주세요.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            로그인하기
          </a>
        </div>
      </div>
    )
  }

  if (!postData) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 바 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-blue-600">하얀치과</span>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500">공유된 게시물</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">
            {SOURCE_TYPE_LABELS[postData.source_type]}
          </span>
        </div>
      </div>

      {/* 게시물 본문 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 제목 영역 */}
          <div className="p-5 sm:p-8 border-b border-gray-100">
            {/* 카테고리/중요 뱃지 */}
            {postData.source_type === 'announcement' && (
              <div className="flex items-center gap-2 mb-3">
                {postData.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {postData.category === 'schedule' ? '일정' : postData.category === 'holiday' ? '휴진/연휴' : '일반 공지'}
                  </span>
                )}
                {postData.is_important && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    <AlertCircle className="w-3 h-3" />
                    중요
                  </span>
                )}
              </div>
            )}

            <h1 className="text-2xl font-bold text-gray-900 mb-4">{postData.title}</h1>

            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{postData.author_name}</span>
              <span>{formatDate(postData.created_at)}</span>
            </div>

            {/* 공지사항 일정 정보 */}
            {postData.start_date && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">일정</span>
                </div>
                <p className="mt-1 text-blue-600">
                  {postData.start_date}
                  {postData.end_date && postData.end_date !== postData.start_date && (
                    <> ~ {postData.end_date}</>
                  )}
                </p>
              </div>
            )}

            {/* 문서 설명 */}
            {postData.description && (
              <p className="mt-3 text-gray-600">{postData.description}</p>
            )}

            {/* 문서 첨부파일 */}
            {postData.file_name && postData.file_url && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-700 mb-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">첨부파일</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">{postData.file_name}</span>
                  {postData.file_size && (
                    <span className="text-xs text-gray-400">({formatFileSize(postData.file_size)})</span>
                  )}
                  <a
                    href={postData.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    다운로드
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* 본문 - TipTap 에디터로 생성된 HTML 콘텐츠 (기존 프로젝트 패턴) */}
          <div className="p-5 sm:p-8">
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: postData.content }}
            />
          </div>
        </div>

        {/* 하단 안내 */}
        <div className="mt-6 text-center text-xs text-gray-400">
          이 게시물은 공유 링크를 통해 제공됩니다.
        </div>
      </div>
    </div>
  )
}
