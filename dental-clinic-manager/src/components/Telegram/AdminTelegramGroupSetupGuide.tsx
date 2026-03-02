'use client'

import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface AdminTelegramGroupSetupGuideProps {
    onCancel: () => void
}

export default function AdminTelegramGroupSetupGuide({ onCancel }: AdminTelegramGroupSetupGuideProps) {
    return (
        <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-800">새 텔레그램 그룹 연동 가이드</h4>
            </div>

            <div className="space-y-4">
                <div className="flex items-start gap-3 bg-white p-4 rounded-lg border border-blue-50/50 shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-600">1</span>
                    </div>
                    <div>
                        <h5 className="text-sm font-semibold text-slate-800">봇 초대하기</h5>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            연동하길 원하는 텔레그램 그룹방에 우리 병원 전용 텔레그램 봇을 초대해 주세요.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-3 bg-white p-4 rounded-lg border border-blue-50/50 shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-indigo-600">2</span>
                    </div>
                    <div>
                        <h5 className="text-sm font-semibold text-slate-800">연동 대기 목록 확인</h5>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            봇을 그룹에 추가하는 즉시, 화면 상단의 <strong>[게시판 신청 대기]</strong> 목록에 해당 그룹이 자동으로 나타납니다.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-3 bg-white p-4 rounded-lg border border-blue-50/50 shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-green-600">3</span>
                    </div>
                    <div>
                        <h5 className="text-sm font-semibold text-slate-800">설정 후 승인</h5>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            대기 목록에서 <strong>[설정 후 승인]</strong> 버튼을 누르고, 게시판 이름과 URL 슬러그를 설정하면 모든 연동이 완료됩니다!
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
                <Button type="button" variant="outline" size="sm" onClick={onCancel} className="bg-white hover:bg-slate-50 border-blue-200 text-blue-700">
                    가이드 닫기
                </Button>
            </div>
        </div>
    )
}
