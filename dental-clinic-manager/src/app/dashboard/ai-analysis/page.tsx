'use client';

import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import AIChat from '@/components/AIAnalysis/AIChat';
import { AlertCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function AIAnalysisPage() {
  const { user, loading: authLoading } = useAuth();
  const { hasPermission, isLoading: permLoading } = usePermissions();

  // 로딩 중
  if (authLoading || permLoading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-200 rounded-full"></div>
          <div className="h-4 w-32 bg-at-border rounded"></div>
        </div>
      </div>
    );
  }

  // 로그인 필요
  if (!user) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
          <div className="w-16 h-16 bg-at-error-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-at-text mb-2">로그인이 필요합니다</h2>
          <p className="text-at-text-secondary mb-6">
            AI 데이터 분석 기능을 사용하려면 먼저 로그인해 주세요.
          </p>
          <Link href="/">
            <Button className="w-full">로그인 페이지로 이동</Button>
          </Link>
        </div>
      </div>
    );
  }

  // 클리닉 ID 확인
  if (!user.clinic_id) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
          <h2 className="text-xl font-bold text-at-text mb-2">클리닉 정보 필요</h2>
          <p className="text-at-text-secondary mb-6">
            AI 데이터 분석을 사용하려면 클리닉에 소속되어 있어야 합니다.
          </p>
          <Link href="/dashboard">
            <Button variant="outline" className="w-full">대시보드로 돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  // 권한 확인 (통계 조회 권한이 있어야 AI 분석 가능)
  const canViewStats = hasPermission('stats_weekly_view') ||
                       hasPermission('stats_monthly_view') ||
                       hasPermission('stats_annual_view');

  if (!canViewStats) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-at-text mb-2">접근 권한 없음</h2>
          <p className="text-at-text-secondary mb-6">
            AI 데이터 분석 기능을 사용하려면 통계 조회 권한이 필요합니다.
            <br />
            관리자에게 권한을 요청해 주세요.
          </p>
          <Link href="/dashboard">
            <Button variant="outline" className="w-full">대시보드로 돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-white min-h-screen">
      <div className="h-[calc(100vh-120px)]">
        <AIChat clinicId={user.clinic_id} />
      </div>
    </div>
  );
}
