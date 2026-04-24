# 상담 진행여부 '미결정(△)' 상태 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일일보고서 환자 상담 결과의 `consult_status`에 '△'(미결정) 상태를 추가하고, 로그 섹션에서 미결정 건만 따로 모아 조회할 수 있도록 한다.

**Architecture:** `consult_logs.consult_status` 컬럼은 `text` 타입이라 DB 변경 없이 '△'를 그대로 저장. 타입 시스템과 UI 분기만 확장. `daily_reports` 집계(`consult_proceed`/`consult_hold`)는 기존 O/X 의미를 유지하고 △는 UI 레벨에서만 필터·표시.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind CSS 4 / Supabase

---

## 제약사항

- **색상 변경 금지**: 기존 O=success, X=warning/error 색상 그대로 유지. △는 기존 warning 톤 재사용하고 라벨/기호로 구분.
- **DB 스키마 변경 없음**: 마이그레이션 추가하지 않음.
- **집계 컬럼 의미 불변**: `consult_proceed`는 O만, `consult_hold`는 X만.
- 프로젝트에 별도 단위 테스트 프레임워크가 없으므로 각 task는 **빌드 검증 + 마지막 브라우저 smoke test**로 검증한다.

---

### Task 1: 타입 확장

**Files:**
- Modify: `src/types/index.ts:19`, `src/types/index.ts:112`

- [ ] **Step 1: `ConsultLog.consult_status` 타입 확장**

`src/types/index.ts:19` 를 다음으로 변경:

```typescript
  consult_status: 'O' | 'X' | '△';
```

- [ ] **Step 2: `ConsultRowData.consult_status` 타입 확장**

`src/types/index.ts:112` 를 다음으로 변경:

```typescript
  consult_status: 'O' | 'X' | '△';
```

- [ ] **Step 3: 빌드 검증**

Run: `cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager && npm run build`
Expected: 타입 확장만 반영된 상태라 아직 일부 `as 'O' | 'X'` 캐스팅에서 경고/에러가 날 수 있음 (후속 task에서 해결). 치명적 런타임 오류가 아닌 타입 오류만 남는지 확인하고 다음 task 진행.

- [ ] **Step 4: 커밋 금지**

이 task는 후속 task와 함께 단일 커밋으로 묶는다. 이 시점에서는 커밋하지 않는다.

---

### Task 2: ConsultTable 드롭다운 옵션 추가

**Files:**
- Modify: `src/components/DailyInput/ConsultTable.tsx`

- [ ] **Step 1: 데스크탑 `<select>` 옵션/타입 캐스팅 확장**

`src/components/DailyInput/ConsultTable.tsx:75-81` 영역을 다음으로 교체:

```tsx
                  <select
                    className="w-full px-3 py-1.5 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X' | '△')}
                    disabled={isReadOnly}
                  >
                    <option value="O">O</option>
                    <option value="△">△</option>
                    <option value="X">X</option>
                  </select>
```

- [ ] **Step 2: 모바일 `<select>` 옵션/타입 캐스팅 확장**

`src/components/DailyInput/ConsultTable.tsx:150-159` 영역을 다음으로 교체:

```tsx
                  <select
                    className="w-full px-3 py-2 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X' | '△')}
                    disabled={isReadOnly}
                  >
                    <option value="O">O</option>
                    <option value="△">△</option>
                    <option value="X">X</option>
                  </select>
```

- [ ] **Step 3: `updateRow` 시그니처 영향 없는지 확인**

`updateRow(index, 'consult_status', value: string)` 는 field 값이 string 이므로 타입 시스템상 문제없음. `ConsultTable.tsx:28` 의 `updateRow` 정의는 수정하지 않는다.

---

### Task 3: DailyInputForm의 로드 캐스팅 확장

**Files:**
- Modify: `src/components/DailyInput/DailyInputForm.tsx:171`

- [ ] **Step 1: consultLogs 로드 시 캐스팅 업데이트**

`src/components/DailyInput/DailyInputForm.tsx:171` 를 다음으로 교체:

```tsx
            consult_status: (log.consult_status as 'O' | 'X' | '△') || 'O',
```

- [ ] **Step 2: 저장 경로 점검 (변경 없음 확인)**

`DailyInputForm.tsx:538` 과 `DailyInputForm.tsx:694` 에서 `consult_status: row.consult_status` 를 그대로 전달하는 부분은 타입이 이미 확장된 `ConsultRowData`를 따르므로 수정 불필요. 이 step에서는 수정하지 않는다.

- [ ] **Step 3: 초기값(`'O'`) 유지 확인**

`DailyInputForm.tsx:52, 88, 175` 의 초기값 `'O'` 는 그대로 둔다. 기본값을 '미결정'으로 바꾸지 않는다.

---

### Task 4: LogsSection에 '미결정' 필터 탭 및 배지/버튼 분기

**Files:**
- Modify: `src/components/Logs/LogsSection.tsx:44`, `:92-94`, `:210-229`, `:278-312`

- [ ] **Step 1: `consultFilter` 상태 타입 확장**

`src/components/Logs/LogsSection.tsx:44` 를 다음으로 교체:

```tsx
  const [consultFilter, setConsultFilter] = useState<'all' | 'completed' | 'incomplete' | 'undecided'>('all')
```

- [ ] **Step 2: `filteredConsultLogs` 필터 분기 확장**

`src/components/Logs/LogsSection.tsx:92-94` 의 필터 블록을 다음으로 교체:

```tsx
    if (consultFilter === 'completed') return log.consult_status === 'O'
    if (consultFilter === 'incomplete') return log.consult_status === 'X'
    if (consultFilter === 'undecided') return log.consult_status === '△'
    return true
```

- [ ] **Step 3: 필터 버튼 그룹에 '미결정' 버튼 추가**

`src/components/Logs/LogsSection.tsx:220-229` 의 '진행보류' 버튼 바로 뒤(닫는 `</button>` 다음)에 다음 블록을 추가한다:

```tsx
                <button
                  onClick={() => setConsultFilter('undecided')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    consultFilter === 'undecided'
                      ? 'bg-at-warning text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  미결정 ({consultLogs.filter(log => log.consult_status === '△').length})
                </button>
```

(색상은 기존 warning 톤 공유 — 색상 변경 없음 원칙)

- [ ] **Step 4: 상태 배지 분기 확장**

`src/components/Logs/LogsSection.tsx:278-286` 의 배지 블록을 다음으로 교체:

```tsx
                      <td className="p-2 sm:p-3 whitespace-nowrap">
                        {(() => {
                          const isCompleted = log.consult_status === 'O' || recentlyUpdatedIds.has(log.id!)
                          const isUndecided = log.consult_status === '△' && !recentlyUpdatedIds.has(log.id!)
                          const badgeClass = isCompleted
                            ? 'bg-at-success-bg text-at-success'
                            : 'bg-at-warning-bg text-at-warning'
                          const label = isCompleted ? '진행완료' : isUndecided ? '미결정' : '진행보류'
                          return (
                            <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${badgeClass}`}>
                              {label}
                            </span>
                          )
                        })()}
                      </td>
```

- [ ] **Step 5: '진행으로 변경' 버튼 노출 조건 확장**

`src/components/Logs/LogsSection.tsx:290` 의 조건을 다음으로 교체:

```tsx
                          {(log.consult_status === 'X' || log.consult_status === '△') && !recentlyUpdatedIds.has(log.id!) ? (
```

- [ ] **Step 6: 빌드 검증**

Run: `cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager && npm run build`
Expected: 타입 에러 없음 (LogsSection 관련 에러 해결 확인). 아직 Dashboard/Stats 쪽 `as 'O' | 'X'` 가정 코드가 남아 빌드가 깨진다면 다음 task로 이어서 해결.

---

### Task 5: DashboardHome 상담 배지 분기

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx:593-595`

- [ ] **Step 1: 상담 리스트 배지 3분기 처리**

`src/components/Dashboard/DashboardHome.tsx:593-595` 영역을 다음으로 교체:

```tsx
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.consult_status === 'O' ? 'bg-at-success-bg text-at-success' : 'bg-at-error-bg text-at-error'}`}>
                            {c.consult_status === 'O' ? '✓ 성공' : c.consult_status === '△' ? '△ 미결정' : '✗ 보류'}
                          </span>
```

색상은 기존 O=success, 그 외=error 유지 (색상 변경 없음). 라벨만 △ 분기 추가.

- [ ] **Step 2: 통계 계산 로직 변경 없음 확인**

`DashboardHome.tsx:131-132, 188, 219` 의 `consult_status === 'O'` 카운트는 O만 세므로 그대로 둔다. △는 성공/보류 어느 쪽에도 포함되지 않음 (정책 Q1=B).

---

### Task 6: StatsContainer 상담 배지 분기

**Files:**
- Modify: `src/components/Stats/StatsContainer.tsx:64-68`

- [ ] **Step 1: 상담 배지 라벨 확장**

`src/components/Stats/StatsContainer.tsx:64-68` 영역을 다음으로 교체:

```tsx
            <td className="px-3 py-2 whitespace-nowrap">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${log.consult_status === 'O' ? 'bg-at-success-bg text-at-success' : 'bg-at-error-bg text-at-error'}`}>
                {log.consult_status}
              </span>
            </td>
```

(이 코드는 `log.consult_status` 값을 그대로 표시하므로 '△' 도 자동으로 표시됨. 색상만 기존 분기 유지. 실제로 위 코드 블록은 기존과 동일하며, 타입 확장으로 인한 컴파일 문제만 없으면 변경이 필요하지 않다. 변경 없이 타입만 확장되므로 **이 step은 확인만**으로 종료한다.)

- [ ] **Step 2: 성공률 계산 로직 변경 없음 확인**

`StatsContainer.tsx:326` 의 `log.consult_status === 'O'` 필터는 그대로 둔다. △는 성공률에 포함하지 않음 (정책 Q1=B).

---

### Task 7: AI 분석 서비스 컬럼 설명 업데이트

**Files:**
- Modify: `src/lib/aiAnalysisService.ts:34`
- Modify: `src/lib/aiAnalysisServiceV2.ts:40`

- [ ] **Step 1: aiAnalysisService.ts 설명 업데이트**

`src/lib/aiAnalysisService.ts:34` 를 다음으로 교체:

```typescript
        { name: 'consult_status', type: 'text', description: '상담 상태 (O: 진행, X: 보류, △: 미결정)' },
```

- [ ] **Step 2: aiAnalysisServiceV2.ts 설명 업데이트**

`src/lib/aiAnalysisServiceV2.ts:40` 를 다음으로 교체:

```typescript
        consult_status: 'TEXT (상담 상태: O=진행, X=보류, △=미결정)',
```

(기존 `VARCHAR(1)` 설명은 실제 DB 스키마가 `text` 이므로 이 기회에 TEXT 로 수정. AI가 참조하는 설명 문자열이라 동작 영향 없음.)

---

### Task 8: 빌드 검증 + 브라우저 smoke test

- [ ] **Step 1: 전체 빌드 검증**

Run: `cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager && npm run build`
Expected: 빌드 성공, 타입 에러 0개. 실패 시 에러 메시지 기반으로 추가 캐스팅을 수정한다.

- [ ] **Step 2: dev 서버 기동**

Run (백그라운드): `cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager && npm run dev`
Wait for "Ready" 로그.

- [ ] **Step 3: Chrome DevTools MCP로 테스트 계정 로그인**

테스트 계정(`whitedc0902@gmail.com` / `ghkdgmltn81!`)으로 로그인.

- [ ] **Step 4: 일일입력 페이지에서 △ 옵션 선택 + 저장**

일일 입력 페이지로 이동 → 상담 행 `진행여부` 드롭다운이 O/△/X 순으로 보이는지 확인 → △ 선택 → 저장 → 페이지 새로고침 후 △가 보존되는지 확인.

- [ ] **Step 5: 로그 섹션 > 상담 기록에서 필터 검증**

'상담 기록' 탭 진입 → '미결정' 필터 버튼 존재 확인 → 클릭 시 △ 건만 표시 → 배지에 '미결정' 라벨 표시 확인.

- [ ] **Step 6: '진행으로 변경' 버튼 동작 확인**

미결정 상태의 건에서 '진행으로 변경' 버튼 클릭 → 상태가 O(진행완료)로 바뀌는지 확인.

- [ ] **Step 7: 대시보드 배지 회귀 점검**

대시보드 홈 진입 → 오늘 상담 리스트에 △ 건이 있다면 '△ 미결정' 배지로 표시 확인, 기존 O/X 건 표시도 이전과 동일한지 확인.

- [ ] **Step 8: 콘솔 에러 확인**

Chrome DevTools MCP `list_console_messages` 로 error 레벨 메시지가 없는지 확인.

---

### Task 9: 커밋 + develop 브랜치 푸시

- [ ] **Step 1: 변경 파일 스테이징**

```bash
cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager
git add src/types/index.ts \
  src/components/DailyInput/ConsultTable.tsx \
  src/components/DailyInput/DailyInputForm.tsx \
  src/components/Logs/LogsSection.tsx \
  src/components/Dashboard/DashboardHome.tsx \
  src/components/Stats/StatsContainer.tsx \
  src/lib/aiAnalysisService.ts \
  src/lib/aiAnalysisServiceV2.ts
```

(실제 Stats 파일이 수정되지 않았다면 제외)

- [ ] **Step 2: 커밋**

```bash
git commit -m "$(cat <<'EOF'
feat(daily-report): 상담 진행여부에 '미결정(△)' 상태 추가

- consult_status 타입에 '△' 추가 (O/X/△ 3단계)
- ConsultTable 드롭다운 순서: O → △ → X
- LogsSection 상담 탭에 '미결정' 필터 추가
- '진행으로 변경' 버튼이 미결정(△) 상태에도 노출
- Dashboard/LogsSection 배지에 △ 분기 추가 (색상 변경 없음)
- AI 분석 컬럼 설명 업데이트

DB 스키마 변경 없음. daily_reports 집계(consult_proceed/consult_hold)는
기존 의미(O/X 카운트)를 유지하여 회귀 위험 최소화.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: develop 브랜치 푸시**

```bash
git push origin develop
```

실패 시: `git pull --rebase origin develop` 후 충돌 해결 → 다시 푸시.

- [ ] **Step 4: 푸시 성공 확인**

Run: `git log -1 --oneline`
Expected: 방금 작성한 커밋이 최상단에 나오는지 확인.

---

## Self-Review 결과

- [x] Spec `docs/superpowers/specs/2026-04-24-consult-status-undecided-design.md` 요구사항 모두 task에 반영됨
- [x] 플레이스홀더 없음 (모든 step에 실제 코드/명령 포함)
- [x] 타입 시그니처 일관성: `'O' | 'X' | '△'` 동일
- [x] 색상 변경 없음 원칙 준수: 모든 배지 색상 분기가 기존 success/warning/error 팔레트만 사용
