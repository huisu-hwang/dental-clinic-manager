'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, Gavel } from 'lucide-react'

interface Step {
  title: string
  description: string
  commands: string[]
  optional?: boolean
}

const STEPS: Step[] = [
  {
    title: '1. 워커 디렉토리 이동',
    description: '메인 레포에서 부동산 경매 워커가 위치한 디렉토리로 이동합니다.',
    commands: ['cd scraping-worker/auction'],
  },
  {
    title: '2. 환경변수 설정 (.env)',
    description:
      'SUPABASE 키는 메인 앱의 .env.local 에서 가져옵니다. DATA_GO_KR_API_KEY 는 data.go.kr 에서 신청해야 합니다 (활용신청 → 시세 OpenAPI 4종 + 공시지가).',
    commands: ['cp .env.example .env', '# .env 편집 후 SUPABASE_SERVICE_ROLE_KEY / DATA_GO_KR_API_KEY 값 채우기'],
  },
  {
    title: '3. 의존성 설치 + Playwright 브라우저',
    description: '한 번만 실행하면 됩니다. Playwright Chromium 다운로드 약 200MB.',
    commands: ['npm install', 'npx playwright install chromium'],
  },
  {
    title: '4. 빌드',
    description: 'TypeScript 컴파일. src/ → dist/ 산출.',
    commands: ['npm run build'],
  },
  {
    title: '5. 첫 실행 (수동 테스트)',
    description:
      'courtauction.go.kr 사이트 구조 변경 가능성으로 첫 실행 시 0건 수집되면 셀렉터 조정이 필요합니다 (src/scrapers/courtAuctionListScraper.ts).',
    commands: ['npm run dev:daily'],
  },
  {
    title: '6. cron 등록 (매일 새벽 03:00 KST)',
    description: 'crontab 에 등록되어 매일 자동 실행됩니다. 로그는 logs/cron.log 에 누적됩니다.',
    commands: ['./scripts/install-cron.sh', 'crontab -l | grep dailyScrape'],
  },
  {
    title: '7. 상태 모니터링',
    description: '오늘 신규 수집 건수 확인 (Supabase SQL).',
    commands: [
      "SELECT COUNT(*) AS new_today FROM auction_items WHERE first_seen_at::date = CURRENT_DATE;",
      'tail -f logs/auction-$(date +%Y-%m-%d).log',
    ],
    optional: true,
  },
]

export default function AuctionWorkerSetupCard() {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // clipboard API 권한 없으면 무시
    }
  }

  return (
    <div className="bg-white rounded-xl shadow mt-6">
      <div className="p-6 border-b flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Gavel className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">부동산 경매 워커 설치</h2>
          <p className="text-sm text-at-text-weak mt-0.5">
            Mac mini M4 에서 매일 새벽 courtauction.go.kr 를 스크래핑하고 국토부 실거래가로 시세를 매칭하는 워커입니다.
            아래 명령어를 차례대로 실행하세요.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {STEPS.map((step, idx) => (
          <div key={idx} className="border border-at-border rounded-xl p-4 bg-at-surface-alt">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-semibold text-sm">
                {step.title}
                {step.optional && (
                  <span className="ml-2 text-xs font-normal text-at-text-weak">(선택)</span>
                )}
              </h3>
            </div>
            <p className="text-xs text-at-text-secondary mb-3 leading-relaxed">{step.description}</p>
            <div className="space-y-1.5">
              {step.commands.map((cmd, ci) => {
                const id = `${idx}-${ci}`
                const isComment = cmd.startsWith('#')
                return (
                  <div
                    key={ci}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs ${
                      isComment
                        ? 'bg-transparent text-at-text-weak'
                        : 'bg-slate-900 text-slate-100'
                    }`}
                  >
                    <code className="flex-1 break-all whitespace-pre-wrap">{cmd}</code>
                    {!isComment && (
                      <button
                        onClick={() => copy(cmd, id)}
                        className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-300"
                        aria-label="명령어 복사"
                        title="복사"
                      >
                        {copied === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">⚠️ 참고 사항</p>
          <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
            <li>
              <code className="bg-amber-100 px-1 py-0.5 rounded">DATA_GO_KR_API_KEY</code> 가 비어 있으면 시세 매칭이
              스킵됩니다. 경매 물건 수집과 권리분석은 정상 작동합니다.
            </li>
            <li>
              <code className="bg-amber-100 px-1 py-0.5 rounded">resolveLawdCd</code> 는 MVP 단계에서 항상 null 을 반환
              (Phase 2 에서 행정안전부 OpenAPI 매핑 추가 예정).
            </li>
            <li>
              차단/구조 변경이 의심되면{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded">SLACK_WEBHOOK_URL</code> 을 설정해 알림을 받을 수
              있습니다.
            </li>
            <li>
              앱 측 UI/API 는 이미 배포되어 있어, 워커가 데이터를 적재하기 시작하면 즉시 화면에 반영됩니다.
            </li>
          </ul>
        </div>

        <div className="text-xs text-at-text-weak flex items-center gap-1">
          <ExternalLink className="w-3.5 h-3.5" />
          <span>
            설계 문서:{' '}
            <code className="font-mono">docs/superpowers/specs/2026-05-09-real-estate-auction-design.md</code>
          </span>
        </div>
      </div>
    </div>
  )
}
