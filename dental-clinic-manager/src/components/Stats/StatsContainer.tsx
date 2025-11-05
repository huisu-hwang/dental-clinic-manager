import StatCard from '@/components/ui/StatCard'
import type { Stats } from '@/types'

interface StatsContainerProps {
  stats: Stats
}

export default function StatsContainer({ stats }: StatsContainerProps) {
  console.log('Stats received:', stats)

  return (
    <div className="space-y-6">
      {/* 주요 업무 통계 */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-slate-700">주요 업무 통계</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="네이버 리뷰 수" value={stats.naver_review_count || 0} unit="건" />
          <StatCard title="총 상담" value={stats.totalConsults || 0} unit="건" />
          <StatCard title="상담 진행률" value={stats.consultProceedRate || 0} unit="%" />
          <StatCard title="리콜 예약률" value={stats.recallSuccessRate || 0} unit="%" />
        </div>
      </div>

      {/* 선물 증정 통계 */}
      <div>
        <h3 className="text-lg font-semibold mt-6 mb-2 text-slate-700">선물 증정 통계</h3>
        {Object.keys(stats.giftCounts).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(stats.giftCounts).map(([gift, count]) => (
              <StatCard key={gift} title={gift} value={count} unit="개" />
            ))}
          </div>
        ) : (
          <p className="text-slate-500">해당 기간에 선물 증정 기록이 없습니다.</p>
        )}
      </div>
    </div>
  )
}