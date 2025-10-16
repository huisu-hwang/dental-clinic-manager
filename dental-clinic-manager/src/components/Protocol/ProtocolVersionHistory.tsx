'use client'

import { useState } from 'react'
import {
  ClockIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon
} from '@heroicons/react/24/outline'
import TiptapEditor from './TiptapEditor'
import type { ProtocolVersion } from '@/types'

interface ProtocolVersionHistoryProps {
  versions: ProtocolVersion[]
  currentVersionId?: string
  onRestore: (versionId: string) => void
  canRestore: boolean
}

export default function ProtocolVersionHistory({
  versions,
  currentVersionId,
  onRestore,
  canRestore
}: ProtocolVersionHistoryProps) {
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set([currentVersionId || '']))

  const toggleVersion = (versionId: string) => {
    const newExpanded = new Set(expandedVersions)
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId)
    } else {
      newExpanded.add(versionId)
    }
    setExpandedVersions(newExpanded)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getChangeTypeBadge = (type: string) => {
    if (type === 'major') {
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
          Major
        </span>
      )
    }
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
        Minor
      </span>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-600">버전 히스토리가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {versions.map((version, index) => {
        const isExpanded = expandedVersions.has(version.id)
        const isCurrent = version.id === currentVersionId

        return (
          <div
            key={version.id}
            className={`border rounded-lg ${
              isCurrent ? 'border-blue-300 bg-blue-50' : 'border-slate-200'
            }`}
          >
            {/* Version Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-slate-800">
                      버전 {version.version_number}
                    </h3>
                    {getChangeTypeBadge(version.change_type)}
                    {isCurrent && (
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        현재 버전
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-2">
                    <span className="flex items-center">
                      <ClockIcon className="h-4 w-4 mr-1" />
                      {formatDate(version.created_at)}
                    </span>
                    {version.created_by_user && (
                      <span className="flex items-center">
                        <UserIcon className="h-4 w-4 mr-1" />
                        {version.created_by_user.name}
                      </span>
                    )}
                  </div>

                  {version.change_summary && (
                    <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">
                      {version.change_summary}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {!isCurrent && canRestore && (
                    <button
                      onClick={() => onRestore(version.id)}
                      className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-300"
                      title="이 버전으로 복원"
                    >
                      <ArrowUturnLeftIcon className="h-4 w-4 mr-1" />
                      복원
                    </button>
                  )}
                  <button
                    onClick={() => toggleVersion(version.id)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-md"
                    title={isExpanded ? '내용 숨기기' : '내용 보기'}
                  >
                    {isExpanded ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Version Content */}
            {isExpanded && (
              <div className="border-t border-slate-200 p-4 bg-white">
                <TiptapEditor
                  content={version.content}
                  onChange={() => {}}
                  editable={false}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
