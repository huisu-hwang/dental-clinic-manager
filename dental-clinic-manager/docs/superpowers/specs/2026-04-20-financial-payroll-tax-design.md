# 경영 현황: 급여 연동 인건비 + 예상 세금 자동 계산 설계

**작성일:** 2026-04-20
**대상 기능:** 경영 현황(`/dashboard/financial`) 현황 조회 페이지 + 세무 설정

---

## 1. 배경 & 목표

현재 경영 현황 대시보드는 다음 두 가지 한계가 있다:

1. **인건비 수동 입력**: 급여 명세서(`payroll_statements`)가 별도로 존재하는데도, 경영 현황의 인건비는 수동으로만 입력됨
2. **세후 순이익 수동 의존**: 세금(`tax_records.actual_tax_paid`)이 수동 입력된 값만 반영 → 아직 신고 전 기간에는 예상치가 표시되지 않음

**목표:**
- 급여 명세서 작성 시 해당 월 인건비가 자동으로 경영 현황에 반영
- 설정 페이지에서 세무 정보를 미리 저장 → 올해 누적 순이익 기준 예상 세금(종합소득세 + 지방소득세)을 자동 계산하여 세후 순이익 표시

---

## 2. 핵심 결정 (사용자 확정)

| 결정 항목 | 선택 |
|---|---|
| 급여 → 인건비 반영 방식 | **C. 하이브리드**: DB에 자동 생성 레코드 삽입하되 수동 입력도 유지, `source` 플래그로 구분 |
| 예상 세금 계산 범위 | **A. 종합소득세 + 지방소득세만** (부가세는 수동 유지) |
| 세무 설정 항목 범위 | **B. 표준** (사업자/기장/인적공제 + 노란우산·국민연금·건강보험 월 납부액) |

---

## 3. 아키텍처

```
[급여 명세서 저장/수정/삭제]
      ↓ (DB 트리거 sync_payroll_to_expense)
[expense_records UPSERT/DELETE with source='payroll', payroll_statement_id]
      ↓
[GET /api/financial/summary → financial_summary_view + tax 예상 계산]
      ↓
[FinancialDashboard: 인건비 배지 + 세후 순이익 카드]

[세무 설정 저장] → [clinic_tax_settings]
      ↓
[GET /api/financial/summary 호출 시 조회]
      ↓
[estimateTax(ytdNetIncome, settings, elapsedMonths)] → estimated_tax 반환
```

## 4. DB 스키마 변경

### 4-1. 신규 테이블 `clinic_tax_settings`

```sql
CREATE TABLE IF NOT EXISTS clinic_tax_settings (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  business_type VARCHAR(20) NOT NULL DEFAULT 'individual',    -- individual | corporate
  bookkeeping_type VARCHAR(20) NOT NULL DEFAULT 'double',     -- simple | double
  dependent_count INTEGER NOT NULL DEFAULT 1 CHECK (dependent_count >= 1),
  spouse_deduction BOOLEAN NOT NULL DEFAULT FALSE,
  apply_standard_deduction BOOLEAN NOT NULL DEFAULT TRUE,
  noranumbrella_monthly INTEGER NOT NULL DEFAULT 0 CHECK (noranumbrella_monthly >= 0),
  national_pension_monthly INTEGER NOT NULL DEFAULT 0 CHECK (national_pension_monthly >= 0),
  health_insurance_monthly INTEGER NOT NULL DEFAULT 0 CHECK (health_insurance_monthly >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinic_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_settings_select ON clinic_tax_settings FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY tax_settings_write ON clinic_tax_settings FOR ALL
  USING (clinic_id IN (
    SELECT clinic_id FROM users WHERE id = auth.uid() AND role IN ('owner','master_admin')
  ));
```

### 4-2. `expense_records` 컬럼 추가

```sql
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS payroll_statement_id UUID
    REFERENCES payroll_statements(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_records_payroll
  ON expense_records(payroll_statement_id)
  WHERE payroll_statement_id IS NOT NULL;
```

### 4-3. 급여 → 지출 동기화 트리거

```sql
CREATE OR REPLACE FUNCTION sync_payroll_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT id INTO v_category_id FROM expense_categories
      WHERE clinic_id = NEW.clinic_id AND category_type = 'personnel' LIMIT 1;

    IF v_category_id IS NULL THEN
      RETURN NEW; -- personnel 카테고리 없으면 스킵
    END IF;

    INSERT INTO expense_records (
      clinic_id, category_id, year, month, amount, description,
      source, payroll_statement_id
    ) VALUES (
      NEW.clinic_id, v_category_id, NEW.payment_year, NEW.payment_month,
      NEW.total_payment,
      NEW.employee_name || ' 급여 (' || NEW.payment_year || '-' || LPAD(NEW.payment_month::TEXT,2,'0') || ')',
      'payroll', NEW.id
    )
    ON CONFLICT (payroll_statement_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          description = EXCLUDED.description,
          updated_at = NOW();
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_statement_id = OLD.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payroll_to_expense ON payroll_statements;
CREATE TRIGGER trg_sync_payroll_to_expense
  AFTER INSERT OR UPDATE OR DELETE ON payroll_statements
  FOR EACH ROW EXECUTE FUNCTION sync_payroll_to_expense();
```

## 5. 세금 계산 유틸 (`src/utils/taxCalculator.ts`)

- 2025 종합소득세율표 (8단계 누진)
- 기장세액공제(복식부기 20%, 한도 100만원) + 표준세액공제 7만원
- 지방소득세 = 소득세 × 10%
- 노란우산 연 한도 600만원
- 탄력 적용 경과월 (1~12) → 월 납부액 × 경과월로 연환산 공제

## 6. API 변경

- **신규**: `GET/POST /api/financial/tax-settings` — 세무 설정 CRUD
- **수정**: `GET /api/financial/summary` — 응답에 아래 필드 추가
  ```
  ytd_net_income, estimated_income_tax, estimated_local_tax,
  estimated_total_tax, estimated_post_tax_profit, taxable_income
  ```

## 7. UI 변경

- **FinancialDashboard 현황 카드**: "예상 세금(올해 누적)" 및 "예상 세후 순이익" 카드 신규. 기존 `post_tax_profit`(실제 납부 기준)은 유지.
- **지출 상세 테이블**: `source='payroll'`이면 `급여 자동` 배지 + 수정/삭제 비활성화
- **설정 탭 > 세무 설정 섹션** 신규: `TaxSettingsForm` 컴포넌트. owner/master_admin만 편집 가능

## 8. 호환성 & 리스크

- `expense_records`의 기존 레코드는 DEFAULT로 `source='manual'` → 기존 조회·수정 영향 없음
- `clinic_tax_settings`가 없어도 API는 빈 설정으로 추정 세금 = 0 반환 → 기존 세후 순이익 표시는 그대로
- 급여 삭제 → 지출 자동 삭제 (ON DELETE CASCADE + 트리거)
- 급여 총 지급액 수정 → 지출 금액 자동 갱신 (트리거 UPSERT)

## 9. 테스트 계획

1. `npm run build` 무오류
2. Chrome DevTools MCP:
   - 로그인 → `/dashboard/financial`
   - 설정 탭 → 세무 설정 저장
   - 급여 등록 후 현황 조회 인건비 자동 반영 확인
   - 세후 순이익 카드 표시
   - 콘솔 에러 없음

## 10. 마이그레이션 파일 위치

`supabase/migrations/20260420_financial_payroll_tax_integration.sql`
