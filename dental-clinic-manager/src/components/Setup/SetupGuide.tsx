export default function SetupGuide() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">하얀치과 실시간 업무 대시보드</h1>
          <p className="text-slate-600">Supabase 설정이 필요합니다</p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  설정 안내
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>데이터베이스 연동을 위해 다음 단계를 완료해주세요:</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-l-4 border-gray-300 pl-4">
              <h4 className="font-semibold text-gray-900">1. Supabase 프로젝트 생성</h4>
              <p className="text-sm text-gray-600 mt-1">
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  https://supabase.com
                </a>에서 새 프로젝트를 생성하세요.
              </p>
            </div>

            <div className="border-l-4 border-gray-300 pl-4">
              <h4 className="font-semibold text-gray-900">2. 데이터베이스 테이블 생성</h4>
              <p className="text-sm text-gray-600 mt-1">
                Supabase SQL Editor에서 <code className="bg-gray-100 px-1 rounded">supabase-schema.sql</code> 파일의 내용을 실행하세요.
              </p>
            </div>

            <div className="border-l-4 border-gray-300 pl-4">
              <h4 className="font-semibold text-gray-900">3. 환경 변수 설정</h4>
              <p className="text-sm text-gray-600 mt-1">
                프로젝트 루트의 <code className="bg-gray-100 px-1 rounded">.env.local</code> 파일을 수정하세요:
              </p>
              <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono">
                <div>NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co</div>
                <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key</div>
              </div>
            </div>

            <div className="border-l-4 border-gray-300 pl-4">
              <h4 className="font-semibold text-gray-900">4. 개발 서버 재시작</h4>
              <p className="text-sm text-gray-600 mt-1">
                설정 완료 후 개발 서버를 재시작하세요.
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  주의사항
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>Supabase 프로젝트 URL과 anon public key는 프로젝트 설정 → API 섹션에서 확인할 수 있습니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}