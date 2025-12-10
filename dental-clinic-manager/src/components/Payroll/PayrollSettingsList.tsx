'use client'

import { Edit2, Trash2, MessageCircle, Users } from 'lucide-react'
import type { PayrollSetting } from '@/types/payroll'

interface PayrollSettingsListProps {
  settings: PayrollSetting[]
  onEdit: (setting: PayrollSetting) => void
  onDelete: (settingId: string) => void
}

const ROLE_LABELS: Record<string, string> = {
  owner: '원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '직원'
}

export default function PayrollSettingsList({
  settings,
  onEdit,
  onDelete
}: PayrollSettingsListProps) {
  if (settings.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">등록된 급여 설정이 없습니다.</p>
        <p className="text-sm text-slate-400 mt-1">직원의 급여 설정을 추가하세요.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">직원명</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">직급</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">기본급</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">수당</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">총 급여</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">급여일</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">카카오</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">관리</th>
          </tr>
        </thead>
        <tbody>
          {settings.map(setting => {
            const allowancesTotal = Object.values(setting.allowances || {}).reduce(
              (sum, val) => sum + (Number(val) || 0), 0
            )
            const totalSalary = setting.base_salary + allowancesTotal

            return (
              <tr key={setting.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4">
                  <span className="font-medium text-slate-800">
                    {setting.employee?.name || '알 수 없음'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-slate-600">
                    {ROLE_LABELS[setting.employee?.role || ''] || setting.employee?.role || '-'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-slate-800">
                    {setting.base_salary.toLocaleString()}원
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-slate-600">
                    {allowancesTotal.toLocaleString()}원
                  </span>
                  {Object.keys(setting.allowances || {}).length > 0 && (
                    <span className="block text-xs text-slate-400">
                      ({Object.keys(setting.allowances || {}).length}개 항목)
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-medium text-emerald-600">
                    {totalSalary.toLocaleString()}원
                  </span>
                  <span className="block text-xs text-slate-400">
                    {setting.salary_type === 'gross' ? '세전' : '세후'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="text-slate-600">매월 {setting.payment_day}일</span>
                </td>
                <td className="py-3 px-4 text-center">
                  {setting.kakao_notification_enabled ? (
                    <div className="flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-yellow-500" />
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      onClick={() => onEdit(setting)}
                      className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(setting.id)}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 요약 정보 */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-slate-800">{settings.length}</div>
            <div className="text-sm text-slate-500">등록된 직원</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">
              {settings.reduce((sum, s) => sum + s.base_salary, 0).toLocaleString()}원
            </div>
            <div className="text-sm text-slate-500">총 기본급</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600">
              {settings.reduce((sum, s) => {
                const allowancesTotal = Object.values(s.allowances || {}).reduce(
                  (a, v) => a + (Number(v) || 0), 0
                )
                return sum + s.base_salary + allowancesTotal
              }, 0).toLocaleString()}원
            </div>
            <div className="text-sm text-slate-500">총 급여</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">
              {settings.filter(s => s.kakao_notification_enabled).length}
            </div>
            <div className="text-sm text-slate-500">카카오 알림 활성</div>
          </div>
        </div>
      </div>
    </div>
  )
}
