export default function GuideSection() {
  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 space-y-4 prose max-w-none">
      <h2 className="text-2xl font-bold">대시보드 사용 안내</h2>
      
      <h3 className="font-bold text-lg">1. 최초 설정 (관리자)</h3>
      <ul className="list-disc pl-6">
        <li>
          <strong className="text-red-500">가장 먼저, Supabase 데이터베이스 테이블을 생성해야 합니다.</strong> 
          이 작업은 최초 한 번만 필요합니다.
        </li>
        <li>
          프로젝트 루트의 <code>supabase-schema.sql</code> 파일의 내용을 Supabase SQL Editor에서 실행하여 테이블을 생성하세요.
        </li>
        <li>
          <code>.env.local</code> 파일에 Supabase 프로젝트의 <strong>URL</strong>과 <strong>anon public key</strong>를 설정하세요.
        </li>
      </ul>
      
      <h3 className="font-bold text-lg">2. 데이터 관리</h3>
      <ul className="list-disc pl-6">
        <li>
          이제 모든 데이터는 클라우드에 실시간으로 저장됩니다. 한 명이 데이터를 입력하면 다른 모든 사람의 화면에도 즉시 반영됩니다.
        </li>
        <li>
          <strong>일일 보고 종합 기록</strong> 테이블 우측의 삭제 버튼을 클릭하여 해당 날짜의 모든 기록(상담, 선물 등)을 한 번에 삭제할 수 있습니다.
        </li>
      </ul>

      <h3 className="font-bold text-lg">3. 기능 설명</h3>
      <ul className="list-disc pl-6">
        <li><strong>일일 보고서 입력:</strong> 환자 상담 결과, 리콜 현황, 선물 및 리뷰 관리를 입력할 수 있습니다.</li>
        <li><strong>통계:</strong> 주간, 월간, 연간 통계를 확인할 수 있습니다.</li>
        <li><strong>상세 기록:</strong> 모든 입력된 데이터의 상세 내역을 확인할 수 있습니다.</li>
        <li><strong>설정:</strong> 선물 재고를 관리하고 새로운 선물 종류를 추가할 수 있습니다.</li>
      </ul>

      <h3 className="font-bold text-lg">4. 환경 설정</h3>
      <div className="bg-slate-100 p-4 rounded-md">
        <p className="text-sm font-mono">
          NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url<br/>
          NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
        </p>
      </div>
    </div>
  )
}