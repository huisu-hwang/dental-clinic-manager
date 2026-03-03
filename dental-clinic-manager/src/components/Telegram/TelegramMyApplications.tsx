'use client'

import { useState, useEffect } from 'react'
import { Loader2, Clock, CheckCircle, XCircle, FileText } from 'lucide-react'
import { telegramGroupService } from '@/lib/telegramService'
import {
  TELEGRAM_GROUP_STATUS_LABELS,
  TELEGRAM_GROUP_STATUS_COLORS,
} from '@/types/telegram'
import type { TelegramGroup, TelegramGroupStatus } from '@/types/telegram'

const STATUS_ICONS: Record<TelegramGroupStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  approved: <CheckCircle className="w-3.5 h-3.5" />,
  rejected: <XCircle className="w-3.5 h-3.5" />,
}

export default function TelegramMyApplications() {
  const [applications, setApplications] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchApplications = async () => {
      const { data } = await telegramGroupService.getMyApplications()
      // pending 또는 rejected인 것만 표시 (approved는 이미 게시판 목록에 나옴)
      setApplications((data || []).filter(g => g.status === 'pending' || g.status === 'rejected'))
      setLoading(false)
    }
    fetchApplications()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
      </div>
    )
  }

  if (applications.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">내 신청 현황</h3>
      </div>

      <div className="space-y-2">
        {applications.map(app => {
          const statusColors = TELEGRAM_GROUP_STATUS_COLORS[app.status]
          return (
            <div
              key={app.id}
              className="flex items-start justify-between p-3 rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-gray-800 truncate">{app.board_title}</h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors.bg} ${statusColors.text}`}>
                    {STATUS_ICONS[app.status]}
                    {TELEGRAM_GROUP_STATUS_LABELS[app.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {app.chat_title} · /{app.board_slug}
                </p>
                {app.application_reason && (
                  <p className="text-xs text-gray-500 mt-1">
                    신청 사유: {app.application_reason}
                  </p>
                )}
                {app.status === 'rejected' && app.rejection_reason && (
                  <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded">
                    반려 사유: {app.rejection_reason}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">
                {new Date(app.created_at).toLocaleDateString('ko-KR')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
