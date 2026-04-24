# 일일보고서 상담 진행여부에 '미결정(△)' 상태 추가

작성일: 2026-04-24
브랜치: develop

## 목적

일일보고서의 환자 상담 결과 `consult_status`에 현재 존재하는 'O'(진행)와 'X'(보류) 외에, **'△'(미결정)** 상태를 추가한다. 이후 로그 섹션에서 미결정 건만 따로 모아 조회·후속 처리할 수 있어야 한다.

## 범위

### 포함
- ConsultTable 드롭다운에 '△' 옵션 추가 (순서: O → △ → X)
- 타입 확장: `consult_status: 'O' | 'X'` → `'O' | 'X' | '△'`
- LogsSection에 **'미결정'** 필터 탭 추가 — 미결정 건을 모아 볼 수 있도록
- 상태 배지와 상태변경 버튼이 △ 값을 올바르게 렌더링하도록 분기 추가
- AI 분석 서비스의 컬럼 설명 업데이트 ("O: 진행, X: 보류, △: 미결정")

### 제외
- **색상 변경 없음**: 기존 O(success), X(warning) 색상은 그대로 유지. 미결정 배지는 기존 warning 톤을 공유하고 텍스트/아이콘('△', '미결정')으로 구분.
- **DB 스키마 변경 없음**: `consult_logs.consult_status`는 이미 `text` 타입이므로 '△' 저장 가능. `daily_reports`에 별도 집계 컬럼 추가하지 않음 (Q1=B 결정).
- 통계 그래프 재설계는 하지 않음 (StatsContainer는 상담 성공률에서 △를 'O 아님'으로 취급하여 현재 로직 그대로 유지).

## 데이터 / 집계 방침 (Q1=B)

- `consult_logs.consult_status`는 'O' | 'X' | '△' 세 값 중 하나.
- `daily_reports.consult_proceed`: O 개수 (변경 없음)
- `daily_reports.consult_hold`: **X 개수만** (기존 의미 유지). △는 포함하지 않음.
- 미결정 건수는 UI에서 `consult_logs.consult_status === '△'` 필터로 실시간 계산.
  - 이렇게 하면 기존 집계 지표의 의미가 변하지 않아 회귀 위험이 최소화된다.

## 파일별 변경

1. **src/types/index.ts**
   - `ConsultLog.consult_status`, `ConsultRowData.consult_status` 타입을 `'O' | 'X' | '△'`로 확장

2. **src/components/DailyInput/ConsultTable.tsx**
   - 데스크탑/모바일 `<select>` 두 곳에 `<option value="△">△</option>` 추가 (O, △, X 순)
   - `onChange` 캐스팅 업데이트

3. **src/components/DailyInput/DailyInputForm.tsx**
   - `consult_status` 초기값은 'O' 유지
   - `log.consult_status as 'O' | 'X'` 형태의 캐스팅을 `'O' | 'X' | '△'`로 확장

4. **src/components/Logs/LogsSection.tsx**
   - `consultFilter` 타입/상태에 `'undecided'` 추가
   - 필터 버튼 추가: "미결정 ({△ 카운트})"
   - 상태 배지 분기 확장: `O → '진행완료'`, `X → '진행보류'`, `△ → '미결정'`
   - 색상: O는 기존 success, X는 기존 warning. △는 기존 warning을 공유 (색상 변경 없음 원칙)
   - "상태변경 → 진행으로 변경" 버튼: 기존 X뿐만 아니라 △에서도 노출

5. **src/components/Dashboard/DashboardHome.tsx**
   - 상담 리스트 배지 분기 추가: O면 '✓ 성공', 그 외(X/△)는 각각 '✗ 보류', '△ 미결정' 라벨
   - 색상 로직: O는 success, 그 외는 기존 error/warning 톤 유지

6. **src/components/Stats/StatsContainer.tsx**
   - 배지 분기 추가: △일 경우 라벨만 '△'로 표시 (색상은 기존 warning 공유)
   - 성공률 계산 `consult_status === 'O'` 로직은 변경 없음 (△는 성공에서 제외됨)

7. **src/lib/dataService.ts**
   - `consult_proceed` / `consult_hold` 집계 로직 변경 없음 (O/X 카운트만 유지)
   - △는 consult_logs에만 저장되고 daily_reports 집계에는 영향 없음

8. **src/lib/aiAnalysisService.ts / aiAnalysisServiceV2.ts**
   - consult_status 컬럼 설명 문자열 업데이트: "O: 진행, X: 보류, △: 미결정"

## 테스트 계획

테스트 계정(`whitedc0902@gmail.com`)으로 로그인 후 다음 확인:

1. 일일입력 페이지에서 상담 행에 드롭다운이 O/△/X 세 개 옵션으로 노출되는지
2. △ 선택 후 저장 → 페이지 새로고침 → △가 보존되는지
3. 로그 섹션 > 상담 탭에서 '미결정' 필터를 클릭하면 △ 건만 필터링되는지
4. '미결정' 상태에서 "진행으로 변경" 버튼이 노출되고 정상 동작하는지
5. 대시보드 오늘 상담 리스트에 △ 건의 배지가 깨지지 않고 표시되는지
6. 기존 O/X 데이터와 카운트(consult_proceed, consult_hold)가 그대로 유지되는지 (회귀 없음)
7. `npm run build` 통과

## 회귀 리스크 및 완화

- 타입 확장이 'O' | 'X'를 가정한 곳에서 타입 에러를 일으킬 수 있음 → 빌드 시 컴파일 에러로 검출, 모두 'O' | 'X' | '△'로 확장하며 분기 처리
- 기존 집계 컬럼은 변경하지 않음 → 대시보드/통계의 기존 숫자 회귀 없음
- DB 스키마 변경 없음 → 마이그레이션 리스크 없음
