# Claude Code 개발 방법론

## 🎯 핵심 원칙 (MUST)

### 1. 기존 기능 보호 원칙 (최우선)
- ✅ 최소 침습: 정상 작동하는 기존 기능 최소한으로만 변경
- ✅ 영향 범위 분석: 코드 수정 전 반드시 의존성 파악
- ✅ 하위 호환성: 기존 API/데이터 구조 유지
- ❌ 공통 함수 동작 변경 금지
- ❌ 타입 인터페이스 필드 제거 금지

### 2. 세션 관리 원칙
**새 작업 시작 시 반드시 `/compact` 실행**
- 컨텍스트 압축 및 토큰 최적화
- 대화 히스토리 정리

### 3. Context7 MCP 필수 사용
**모든 라이브러리/DB 작업 시 공식 문서 확인 필수**

| 상황 | Context7 사용 |
|------|---------------|
| 새 라이브러리 도입 | 필수 |
| 데이터베이스 쿼리 | 필수 |
| 에러 해결 | 필수 |
| 타입 오류 | 필수 |

**사용법:**
```javascript
// 1. 라이브러리 ID 검색
mcp__context7__resolve-library-id({ libraryName: "supabase" })

// 2. 문서 조회
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/supabase/supabase",
  topic: "authentication"
})
```

**주요 라이브러리:**
- Next.js: `/vercel/next.js`
- Supabase: `/supabase/supabase`
- PostgreSQL: `/postgres/postgres`
- TypeScript: `/microsoft/TypeScript`

### 4. 근본 원인 해결 (Root Cause Analysis)
**5 Whys 기법으로 근본 원인 파악 후 해결**

- ✅ 근본 원인 제거 → 재발 방지
- ❌ 임시 방편 → Technical Debt 증가

### 5. Chrome DevTools MCP (버그 수정 필수)
**버그 수정 시 Chrome DevTools로 재현 및 검증 필수**

- ✅ 수정 전: 콘솔 로그로 오류 재현
- ✅ 수정 후: 동일 시나리오로 검증
- ❌ 추측으로 수정 금지

### 6. 코드 리뷰 필수 (Git Commit 전)
**모든 커밋 전에 자신이 작성한 코드를 리뷰**

- ✅ 커밋 전: 변경된 모든 파일 리뷰
- ✅ 체크리스트: 보안, 성능, 가독성, 테스트, 호환성
- ✅ 문제 발견 시: 즉시 수정 후 재리뷰
- ❌ 리뷰 없이 커밋 금지

### 8. 에이전트 팀 활용 및 목표 달성까지 반복
**복잡하고 어려운 작업은 적절한 에이전트 팀을 구성하고 진행한다**

- ✅ 작업 복잡도에 따라 전문 에이전트(구현/테스트/리뷰 등) 팀 구성
- ✅ 작업 후 목표 달성할 때까지 테스트와 수정을 반복
- ✅ 테스트 실패 → 원인 분석 → 수정 → 재테스트 사이클 반복
- ❌ 한 번의 구현으로 완료했다고 가정하지 않음
- ❌ 테스트 없이 작업 완료 선언 금지

### 7. 작업 중 실패/오류 시 자동 계속 (멈추지 않기)
**작업 도중 실패나 오류 발생 시 멈추지 말고 자동으로 해결 후 이어서 작업**

- ✅ 오류 발생 → 원인 파악 → 해결 → 이어서 작업
- ✅ 빌드/테스트/푸시 실패 시 자동 재시도
- ❌ 사용자에게 되묻지 않고 자동 처리
- ❌ 실패한 채로 방치 금지

---

## 📋 개발 프로세스

### 일반 기능 개발
1. `/compact` 실행
2. Context7로 관련 문서 조회
3. Sequential Thinking (문제 분석)
4. 계획 수립 (TodoWrite)
5. TDD (테스트 주도 개발)
6. **코드 리뷰 (Self-Review)**
7. Git commit & push

### 버그 수정
1. `/compact` 실행
2. **Chrome DevTools로 오류 재현 및 로그 확인**
3. **Context7로 공식 문서 확인** (DB/라이브러리 문제 시)
4. **5 Whys로 근본 원인 분석**
5. Sequential Thinking (해결 방안 설계)
6. 코드 수정
7. **Chrome DevTools로 수정 검증**
8. **코드 리뷰 (Self-Review)**
9. Git commit & push

### Subagent 활용

| 작업 유형 | Subagent |
|----------|----------|
| 버그 수정 | `/bug-fix` |
| 새 기능 개발 | `/feature-dev` |
| DB 스키마 | `/db-schema` |
| 보안 이슈 | `/security-check` |
| UI 개선 | `/ui-enhance` |
| 성능 최적화 | `/performance` |

---

## ✅ 체크리스트

### 구현 전
- [ ] `/compact` 실행 (새 작업 시)
- [ ] Context7로 관련 문서 확인
- [ ] Sequential Thinking 완료
- [ ] TodoWrite 작성

### 구현 중
- [ ] 테스트 먼저 작성 (TDD)
- [ ] Todo 항목 상태 업데이트
- [ ] 에러 처리 및 로깅 추가

### 구현 후
- [ ] 모든 테스트 통과
- [ ] **코드 리뷰 (Self-Review) 완료 (필수)**
- [ ] **리뷰 체크리스트 모두 통과 (필수)**
- [ ] **WORK_LOG.md 업데이트 (필수)**
- [ ] **Git commit & push (필수)**

---

## 🗄️ SQL 마이그레이션 규칙

**Supabase MCP를 통해 직접 실행 (필수)**

- ✅ `mcp__supabase__apply_migration` 사용 (DDL: CREATE, ALTER, DROP 등)
- ✅ `mcp__supabase__execute_sql` 사용 (DML: INSERT, UPDATE, SELECT 등)
- ✅ 프로젝트 ID: `beahjntkmkfhpcbhfnrr` (Dental Clinic Manager)
- ✅ `supabase/migrations/` 디렉토리에 SQL 파일도 함께 생성하여 버전 관리
- ✅ 전체 SQL 내용을 코드 블록으로 보여줄 것
- ❌ SQL Editor에서 수동 실행 요청 금지 → ✅ MCP로 직접 적용

---

## ❌ 금지 사항

1. **임시 방편으로 문제 해결 (절대 금지)**
   - ❌ 증상만 가리기 → ✅ 근본 원인 해결

2. **Sequential Thinking 없이 구현**
   - ❌ 바로 코딩 → ✅ 사고 과정 필수

3. **테스트 없이 구현**
   - ❌ 나중에 테스트 → ✅ TDD (RED-GREEN-REFACTOR)

4. **버그 수정 시 Chrome DevTools 생략 (절대 금지)**
   - ❌ 추측으로 수정 → ✅ 콘솔 로그 확인 필수

5. **DB/라이브러리 문제 시 Context7 생략 (절대 금지)**
   - ❌ "아마 이렇게..." → ✅ 공식 문서 확인

6. **Git 푸시 생략 (절대 금지)**
   - ❌ "나중에 푸시" → ✅ 작업 완료 즉시 푸시

7. **WORK_LOG.md 업데이트 생략 (절대 금지)**
   - ❌ "나중에 정리" → ✅ 작업 직후 즉시 기록

8. **코드 리뷰 생략 (절대 금지)**
   - ❌ "간단한 수정이라서..." → ✅ 모든 커밋에 리뷰 필수
   - ❌ "나중에 리뷰" → ✅ 커밋 직전 즉시 리뷰

---

## 🛠️ 도구 사용

### Sequential Thinking
```javascript
mcp__sequential-thinking__sequentialthinking({
  thought: "현재 사고 내용",
  thoughtNumber: 1,
  totalThoughts: 10,
  nextThoughtNeeded: true
})
```

### TodoWrite
```javascript
TodoWrite({
  todos: [
    {
      content: "작업 내용",
      status: "pending" | "in_progress" | "completed",
      activeForm: "진행형 표현"
    }
  ]
})
```

### Git 워크플로우
```bash
# 변경사항 staging
git add [파일들...]

# 커밋 (Co-Authored-By: Claude 포함)
git commit -m "$(cat <<'EOF'
[type]: [제목]

[상세 설명]
- 변경사항 1
- 변경사항 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# 푸시
git push origin [브랜치명]
```

**커밋 타입:**
- `feat`: 새 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `test`: 테스트
- `docs`: 문서
- `perf`: 성능 개선
- `security`: 보안 강화

### 코드 리뷰 프로세스 (Self-Review)

#### 리뷰 시점
**Git commit 직전 필수**

#### 리뷰 절차

**Step 1: 변경 파일 확인**
```bash
git status
git diff
```

**Step 2: 체크리스트**

**보안 (Security)**
- [ ] 환경 변수 노출 없음
- [ ] SQL Injection 방어
- [ ] XSS 방어
- [ ] 민감 정보 로깅 없음

**성능 (Performance)**
- [ ] 불필요한 리렌더링 없음
- [ ] N+1 쿼리 없음
- [ ] 메모리 누수 없음
- [ ] 무한 루프 위험 없음

**가독성 (Readability)**
- [ ] 명확한 변수/함수명
- [ ] 적절한 주석
- [ ] 일관된 코드 스타일
- [ ] 복잡도 적정 수준

**테스트 (Testing)**
- [ ] 에지 케이스 처리
- [ ] 에러 핸들링
- [ ] 테스트 코드 작성 (가능한 경우)
- [ ] 수동 테스트 완료

**기존 기능 (Compatibility)**
- [ ] 하위 호환성 유지
- [ ] 기존 API 영향 없음
- [ ] 타입 안정성

**Step 3: 문제 발견 시**
```
문제 발견 → 즉시 수정 → Step 1부터 재리뷰
```

**Step 4: 승인 후 커밋**
```bash
# 모든 체크리스트 통과 시에만 커밋
git add [파일들...]
git commit -m "..."
git push origin [브랜치명]
```

### Chrome DevTools MCP
```javascript
// 페이지 이동
mcp__chrome-devtools__navigate_page({ url: 'http://localhost:3000' })

// 콘솔 에러 확인
mcp__chrome-devtools__list_console_messages({ types: ['error'] })

// 네트워크 요청 확인
mcp__chrome-devtools__list_network_requests()
```

### MCP 도구 목록
- **context7**: 라이브러리 공식 문서
- **chrome-devtools**: 브라우저 디버깅
- **sequential-thinking**: 문제 분석
- **gdrive**: Google Drive 파일 접근
- **playwright**: 웹 테스팅 자동화

---

## 📝 작업 문서화

### WORK_LOG.md 포맷
```markdown
## [날짜] [카테고리] [제목]

**키워드:** #키워드1 #키워드2

### 📋 작업 내용
- 변경 사항

### 🐛 문제 (버그 수정 시)
- 문제 설명

### 🔍 근본 원인 (버그 수정 시)
- 5 Whys 분석 결과

### ✅ 해결 방법
- 적용한 방법

### 🧪 테스트 결과
- 검증 결과

### 💡 배운 점
- 참고 사항

---
```

**카테고리:**
- `[버그 수정]`, `[기능 개발]`, `[리팩토링]`
- `[성능 개선]`, `[보안 강화]`, `[UI/UX 개선]`
- `[DB 스키마]`, `[배포/인프라]`, `[문서화]`

---

## 🎨 shadcn/ui 사용 원칙

**점진적 적용 (한 번에 하나씩)**

- ✅ 새 기능 개발 시 우선 적용
- ✅ 버그 수정 시 해당 컴포넌트만 교체
- ❌ 전체 UI 리팩토링 금지

**우선순위:**
1. Button, Input, Select, Dialog (높음)
2. Table, Card, Form (중간)
3. Toast (낮음)

---

## 📊 TDD (Test-Driven Development)

### RED-GREEN-REFACTOR
1. **RED**: 실패하는 테스트 작성
2. **GREEN**: 최소 코드로 테스트 통과
3. **REFACTOR**: 코드 개선

---

## 변경 이력

### 2025-11-14
- 📝 CLAUDE.md 대폭 간소화
  - 1000줄+ → 400줄 이하로 축소
  - 핵심 원칙만 남기고 중복 제거
  - 예시 최소화, 테이블/리스트 형식 활용

### 2025-11-11
- 📚 Context7 MCP 필수 사용 원칙 강화

### 2025-11-08
- 📚 데이터베이스 문제 시 Context7 의무화

### 2025-11-06
- 🔍 근본 원인 해결 원칙 추가
- 🔄 세션 관리 원칙 추가 (/compact)

---

**마지막 업데이트: 2025-11-14**

---

## 📦 필수 적용 SQL 마이그레이션

### 출퇴근 타임존 계산 수정 (2025-12-01)

Supabase SQL Editor에서 실행하세요:

```sql
-- ============================================
-- 출퇴근 시간 계산 로직 수정 (타임존 문제 해결)
-- Migration: 20251201_fix_attendance_timezone_calculation.sql
-- Created: 2025-12-01
--
-- 문제: TIMESTAMPTZ를 TIME으로 변환할 때 UTC 기준이 사용되어
--       한국 시간(Asia/Seoul)과 맞지 않았음
-- 해결: AT TIME ZONE 'Asia/Seoul'을 사용하여 올바르게 변환
-- ============================================

-- 6.1 근태 상태 자동 계산 함수 (타임존 수정)
CREATE OR REPLACE FUNCTION calculate_attendance_status(
  p_check_in_time TIMESTAMPTZ,
  p_check_out_time TIMESTAMPTZ,
  p_scheduled_start TIME,
  p_scheduled_end TIME,
  OUT late_min INTEGER,
  OUT early_leave_min INTEGER,
  OUT overtime_min INTEGER,
  OUT total_work_min INTEGER,
  OUT status VARCHAR
) AS $$
DECLARE
  actual_start TIME;
  actual_end TIME;
  tolerance_minutes INTEGER := 5; -- 5분 허용 범위
  korean_tz TEXT := 'Asia/Seoul';
BEGIN
  -- 초기화
  late_min := 0;
  early_leave_min := 0;
  overtime_min := 0;
  total_work_min := 0;
  status := 'present';

  -- 출근 기록이 없으면 결근
  IF p_check_in_time IS NULL THEN
    status := 'absent';
    RETURN;
  END IF;

  -- 예정 시간이 없으면 계산 불가 (기본값 유지)
  IF p_scheduled_start IS NULL THEN
    RETURN;
  END IF;

  -- 실제 출퇴근 시간 추출 (한국 시간으로 변환)
  actual_start := (p_check_in_time AT TIME ZONE korean_tz)::TIME;

  -- 지각 계산 (허용 범위 초과 시)
  IF actual_start > (p_scheduled_start + (tolerance_minutes || ' minutes')::INTERVAL) THEN
    late_min := GREATEST(0, EXTRACT(EPOCH FROM (actual_start - p_scheduled_start))::INTEGER / 60);
    status := 'late';
  END IF;

  -- 퇴근 기록이 있는 경우
  IF p_check_out_time IS NOT NULL THEN
    -- 실제 퇴근 시간 (한국 시간으로 변환)
    actual_end := (p_check_out_time AT TIME ZONE korean_tz)::TIME;

    -- 총 근무 시간 계산 (출퇴근 시간 차이, 분 단위)
    total_work_min := GREATEST(0, EXTRACT(EPOCH FROM (p_check_out_time - p_check_in_time))::INTEGER / 60);

    -- 예정 퇴근 시간이 있는 경우에만 조퇴/초과근무 계산
    IF p_scheduled_end IS NOT NULL THEN
      -- 조퇴 계산 (허용 범위 초과 시)
      IF actual_end < (p_scheduled_end - (tolerance_minutes || ' minutes')::INTERVAL) THEN
        early_leave_min := GREATEST(0, EXTRACT(EPOCH FROM (p_scheduled_end - actual_end))::INTEGER / 60);
        IF status != 'late' THEN
          status := 'early_leave';
        END IF;
      END IF;

      -- 초과근무 계산 (허용 범위 초과 시)
      IF actual_end > (p_scheduled_end + (tolerance_minutes || ' minutes')::INTERVAL) THEN
        overtime_min := GREATEST(0, EXTRACT(EPOCH FROM (actual_end - p_scheduled_end))::INTEGER / 60);
      END IF;
    END IF;
  END IF;

END;
$$ LANGUAGE plpgsql;

-- 6.2 출퇴근 기록 자동 계산 트리거 (재생성)
CREATE OR REPLACE FUNCTION auto_calculate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  calc_result RECORD;
BEGIN
  -- 출근 시간이 있으면 계산 시도
  IF NEW.check_in_time IS NOT NULL THEN
    SELECT * INTO calc_result
    FROM calculate_attendance_status(
      NEW.check_in_time,
      NEW.check_out_time,
      NEW.scheduled_start,
      NEW.scheduled_end
    );

    NEW.late_minutes := COALESCE(calc_result.late_min, 0);
    NEW.early_leave_minutes := COALESCE(calc_result.early_leave_min, 0);
    NEW.overtime_minutes := COALESCE(calc_result.overtime_min, 0);
    NEW.total_work_minutes := calc_result.total_work_min;

    -- 수동 편집이 아닌 경우에만 상태 업데이트
    IF NOT COALESCE(NEW.is_manually_edited, false) THEN
      NEW.status := COALESCE(calc_result.status, 'present');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재생성
DROP TRIGGER IF EXISTS trigger_auto_calculate_attendance ON attendance_records;
CREATE TRIGGER trigger_auto_calculate_attendance
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_attendance();

-- ============================================
-- 기존 데이터 재계산 함수
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_all_attendance_records()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  rec RECORD;
  calc_result RECORD;
BEGIN
  FOR rec IN
    SELECT id, check_in_time, check_out_time, scheduled_start, scheduled_end, is_manually_edited
    FROM attendance_records
    WHERE check_in_time IS NOT NULL
  LOOP
    SELECT * INTO calc_result
    FROM calculate_attendance_status(
      rec.check_in_time,
      rec.check_out_time,
      rec.scheduled_start,
      rec.scheduled_end
    );

    UPDATE attendance_records
    SET
      late_minutes = COALESCE(calc_result.late_min, 0),
      early_leave_minutes = COALESCE(calc_result.early_leave_min, 0),
      overtime_minutes = COALESCE(calc_result.overtime_min, 0),
      total_work_minutes = calc_result.total_work_min,
      status = CASE
        WHEN COALESCE(rec.is_manually_edited, false) THEN status
        ELSE COALESCE(calc_result.status, 'present')
      END
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 기존 데이터 재계산 실행
SELECT recalculate_all_attendance_records();

-- 재계산 함수 삭제 (일회성 사용)
DROP FUNCTION IF EXISTS recalculate_all_attendance_records();

-- ============================================
-- 월별 통계 업데이트 함수 개선 (평균 계산 추가)
-- ============================================
CREATE OR REPLACE FUNCTION update_monthly_statistics(
  p_user_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_stats RECORD;
  v_total_work_days INTEGER;
  v_attendance_rate DECIMAL(5,2);
  v_avg_late DECIMAL(10,2);
  v_avg_early_leave DECIMAL(10,2);
  v_avg_overtime DECIMAL(10,2);
  v_avg_work_per_day DECIMAL(10,2);
BEGIN
  -- 사용자의 클리닉 ID 가져오기
  SELECT clinic_id INTO v_clinic_id FROM users WHERE id = p_user_id;

  -- 해당 월의 통계 계산
  SELECT
    COUNT(*) as record_count,
    COUNT(*) FILTER (WHERE check_in_time IS NOT NULL) as present_days,
    COUNT(*) FILTER (WHERE check_in_time IS NULL AND status = 'absent') as absent_days,
    COUNT(*) FILTER (WHERE status = 'leave') as leave_days,
    COUNT(*) FILTER (WHERE status = 'holiday') as holiday_days,
    COUNT(*) FILTER (WHERE late_minutes > 0) as late_count,
    COALESCE(SUM(late_minutes), 0) as total_late_minutes,
    COUNT(*) FILTER (WHERE early_leave_minutes > 0) as early_leave_count,
    COALESCE(SUM(early_leave_minutes), 0) as total_early_leave_minutes,
    COUNT(*) FILTER (WHERE overtime_minutes > 0) as overtime_count,
    COALESCE(SUM(overtime_minutes), 0) as total_overtime_minutes,
    COALESCE(SUM(total_work_minutes), 0) as total_work_minutes
  INTO v_stats
  FROM attendance_records
  WHERE user_id = p_user_id
    AND EXTRACT(YEAR FROM work_date) = p_year
    AND EXTRACT(MONTH FROM work_date) = p_month;

  -- 총 근무 예정일 계산 (출근+결근+연차, 공휴일 제외)
  v_total_work_days := GREATEST(1, v_stats.present_days + v_stats.absent_days + v_stats.leave_days);

  -- 출근율 계산
  v_attendance_rate := CASE
    WHEN v_total_work_days > 0 THEN (v_stats.present_days::DECIMAL / v_total_work_days) * 100
    ELSE 0
  END;

  -- 평균 계산
  v_avg_late := CASE WHEN v_stats.late_count > 0 THEN v_stats.total_late_minutes::DECIMAL / v_stats.late_count ELSE 0 END;
  v_avg_early_leave := CASE WHEN v_stats.early_leave_count > 0 THEN v_stats.total_early_leave_minutes::DECIMAL / v_stats.early_leave_count ELSE 0 END;
  v_avg_overtime := CASE WHEN v_stats.overtime_count > 0 THEN v_stats.total_overtime_minutes::DECIMAL / v_stats.overtime_count ELSE 0 END;
  v_avg_work_per_day := CASE WHEN v_stats.present_days > 0 THEN v_stats.total_work_minutes::DECIMAL / v_stats.present_days ELSE 0 END;

  -- 통계 테이블에 저장 (UPSERT)
  INSERT INTO attendance_statistics (
    user_id, clinic_id, year, month,
    total_work_days, present_days, absent_days, leave_days, holiday_days,
    late_count, total_late_minutes, avg_late_minutes,
    early_leave_count, total_early_leave_minutes, avg_early_leave_minutes,
    overtime_count, total_overtime_minutes, avg_overtime_minutes,
    total_work_minutes, avg_work_minutes_per_day,
    attendance_rate,
    last_calculated_at
  ) VALUES (
    p_user_id, v_clinic_id, p_year, p_month,
    v_total_work_days, v_stats.present_days, v_stats.absent_days, v_stats.leave_days, v_stats.holiday_days,
    v_stats.late_count, v_stats.total_late_minutes, v_avg_late,
    v_stats.early_leave_count, v_stats.total_early_leave_minutes, v_avg_early_leave,
    v_stats.overtime_count, v_stats.total_overtime_minutes, v_avg_overtime,
    v_stats.total_work_minutes, v_avg_work_per_day,
    v_attendance_rate,
    NOW()
  )
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    total_work_days = EXCLUDED.total_work_days,
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    holiday_days = EXCLUDED.holiday_days,
    late_count = EXCLUDED.late_count,
    total_late_minutes = EXCLUDED.total_late_minutes,
    avg_late_minutes = EXCLUDED.avg_late_minutes,
    early_leave_count = EXCLUDED.early_leave_count,
    total_early_leave_minutes = EXCLUDED.total_early_leave_minutes,
    avg_early_leave_minutes = EXCLUDED.avg_early_leave_minutes,
    overtime_count = EXCLUDED.overtime_count,
    total_overtime_minutes = EXCLUDED.total_overtime_minutes,
    avg_overtime_minutes = EXCLUDED.avg_overtime_minutes,
    total_work_minutes = EXCLUDED.total_work_minutes,
    avg_work_minutes_per_day = EXCLUDED.avg_work_minutes_per_day,
    attendance_rate = EXCLUDED.attendance_rate,
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Migration Complete
-- ============================================
```
