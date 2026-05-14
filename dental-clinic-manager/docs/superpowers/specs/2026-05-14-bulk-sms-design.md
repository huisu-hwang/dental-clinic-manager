# 단체 문자 발송 (Bulk SMS) 설계 문서

- **작성일**: 2026-05-14
- **저자**: Claude (with @azasc2024)
- **상태**: Draft (사용자 검토 대기)
- **관련**: 리콜 관리(`recall_*`), DentWeb 연동(`dentweb_patients`), 알리고 SMS(`/api/recall/sms`)

---

## 1. 목적

환자 데이터를 기반으로 단체 문자(공지·이벤트·생일 인사 등)를 발송하는 신규 기능을 추가한다. DentWeb 동기화로 수집된 환자 정보를 활용해 필터링하고, 리콜 관리에서 등록한 제외 환자 리스트를 반영하여 안전하게 발송한다.

### 비목표 (Out of Scope)
- 카카오 알림톡 / 친구톡 채널 연동 (v2)
- 자동 캠페인(생일 자동·기념일 자동 등) — 본 기능은 수동 발송만 지원
- 발송 통계 대시보드(전환율·반응률) — v2
- 풍부한 변수(`{최종내원일}`, `{다음예약일}` 등) — 본 MVP는 `{환자명}`/`{병원명}`/`{전화번호}` 3종만 지원

---

## 2. 사용자 시나리오

1. **공지 발송**: 휴진 안내를 전체 환자에게 단체 발송
2. **타겟 캠페인**: 60~70대 여성 환자 중 최종 내원 90일 이상 → 임플란트 안내
3. **생일 인사**: 이번 달 생일 환자에게 축하 메시지
4. **예약 발송**: 다음 주 월요일 오전 9시에 예약 발송 예약
5. **테스트 발송**: 본인 번호로 1통 받아보고 본 발송

리콜 관리에서 "친인척"으로 분류된 환자는 기본적으로 제외되며, 신년 인사 같이 일부러 보내야 할 때는 토글로 해제할 수 있다.

---

## 3. 아키텍처 개요

```
[사이드바: 단체 문자]
   ├─ 발송하기 탭
   │    ├─ 환자 필터 패널
   │    ├─ 환자 검색 + 선택 리스트
   │    ├─ 리콜 제외 토글
   │    ├─ 메시지 작성 + 미리보기
   │    └─ 테스트/즉시/예약 발송
   ├─ 이력 탭
   ├─ 예약 캠페인 탭
   └─ 템플릿 관리 탭

[데이터 흐름]
DentWeb Agent ─→ dentweb_patients (기존)
                    │
                    ▼
          [필터 + 제외 환자 적용]  ← recall_patients.exclude_reason
                    │                  + recall_exclude_rules
                    ▼
          bulk_sms_campaigns (신규)
          bulk_sms_recipients (신규)
                    │
                    ▼
            [즉시 발송]                [예약 발송]
                │                          │
                ▼                          ▼
       /api/bulk-sms/send         scheduled_at에 도래
                │                          │
                │                          ▼
                │                /api/cron/bulk-sms (Vercel Cron */5분)
                │                          │
                └──────┬───────────────────┘
                       ▼
                 알리고 API (Fixie 프록시, 1,000명 분할)
```

---

## 4. 데이터 모델

### 4.1 신규 테이블

```sql
-- bulk_sms_campaigns: 단체 문자 캠페인 (1 발송 = 1 row)
CREATE TABLE bulk_sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT,                                        -- 내부 식별용
  message TEXT NOT NULL,                             -- 변수 치환 전 원본
  msg_type TEXT NOT NULL DEFAULT 'SMS',              -- 'SMS' | 'LMS'
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,                          -- NULL = 즉시 발송
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  filter_snapshot JSONB,                             -- 사용된 필터(재현용)
  exclude_recall_excluded BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bulk_sms_campaigns_clinic_status
  ON bulk_sms_campaigns(clinic_id, status, scheduled_at);
CREATE INDEX idx_bulk_sms_campaigns_clinic_created
  ON bulk_sms_campaigns(clinic_id, created_at DESC);

-- bulk_sms_recipients: 캠페인 수신자별 발송 결과
CREATE TABLE bulk_sms_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bulk_sms_campaigns(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  dentweb_patient_id UUID REFERENCES dentweb_patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  phone_number TEXT NOT NULL,
  personalized_message TEXT NOT NULL,                -- 치환 완료 본문
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed')),
  aligo_msg_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bulk_sms_recipients_campaign
  ON bulk_sms_recipients(campaign_id);
CREATE INDEX idx_bulk_sms_recipients_dentweb_patient
  ON bulk_sms_recipients(dentweb_patient_id) WHERE dentweb_patient_id IS NOT NULL;

-- bulk_sms_templates: 단체 문자 전용 템플릿 (recall_sms_templates와 분리)
CREATE TABLE bulk_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bulk_sms_templates_clinic ON bulk_sms_templates(clinic_id);
```

### 4.2 RLS 정책

세 테이블 모두 동일한 패턴:
- `SELECT`: 본인 클리닉 소속만 조회 (`clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())`)
- `INSERT/UPDATE/DELETE`: 본인 클리닉 + 권한 체크는 API 라우트에서 별도 수행 (Service Role 사용)
- Cron 라우트(`/api/cron/bulk-sms`)는 Service Role 키로 직접 접근

### 4.3 마이그레이션 파일

- 경로: `supabase/migrations/20260514_create_bulk_sms.sql`
- 적용: `mcp__supabase__apply_migration` 호출로 직접 적용 (프로젝트 ID `beahjntkmkfhpcbhfnrr`)

---

## 5. 제외 환자 매칭 로직

`getEligiblePatients(clinicId, filter, excludeRecallExcluded)` 함수가 핵심.

```ts
// 1. dentweb_patients에서 필터 조건으로 1차 추출
// 2. excludeRecallExcluded=true 인 경우 제외 후보 수집:
//    a) recall_patients WHERE clinic_id=? AND exclude_reason IS NOT NULL
//       → phone_number, chart_number, patient_name 추출
//    b) recall_exclude_rules WHERE clinic_id=? AND is_active=true
//       → phone_number, chart_number, patient_name 추출
// 3. 매칭 우선순위:
//    - 1순위: phone_number 일치 (정규화 후 비교: 하이픈/공백 제거)
//    - 2순위: chart_number 일치
//    - 3순위: patient_name 일치 (동명이인 위험 — 다른 키와 함께만 사용)
// 4. 매칭된 환자는 제외하여 반환
// 5. 응답에 "제외된 N명" 정보 포함 (UI 표시용)
```

전화번호 정규화는 기존 `recallService.ts`의 normalizePhone 패턴을 따른다.

---

## 6. API 라우트

| 라우트 | 메서드 | 권한 | 용도 |
|---|---|---|---|
| `/api/bulk-sms/patients` | POST | `bulk_sms_view` | 필터 조건으로 발송 대상 환자 조회 (제외 적용 결과) |
| `/api/bulk-sms/preview` | POST | `bulk_sms_view` | 첫 환자 기준 변수 치환 + SMS/LMS 판정 + 예상 건수 |
| `/api/bulk-sms/test-send` | POST | `bulk_sms_send` | 본인 번호로 1건 테스트 발송 |
| `/api/bulk-sms/send` | POST | `bulk_sms_send` | 즉시 발송 — 캠페인 + 수신자 생성, 1,000명 분할, 결과 집계 |
| `/api/bulk-sms/schedule` | POST | `bulk_sms_send` | 예약 캠페인 생성 (status=scheduled, 수신자도 미리 생성) |
| `/api/bulk-sms/campaigns` | GET | `bulk_sms_view` | 이력 리스트 (페이징, status·기간 필터) |
| `/api/bulk-sms/campaigns/[id]` | GET | `bulk_sms_view` | 캠페인 + 수신자 결과 상세 |
| `/api/bulk-sms/campaigns/[id]/cancel` | POST | `bulk_sms_send` | 예약 캠페인 취소 (status: scheduled → cancelled) |
| `/api/bulk-sms/templates` | GET | `bulk_sms_view` | 템플릿 목록 |
| `/api/bulk-sms/templates` | POST | `bulk_sms_manage` | 템플릿 생성 |
| `/api/bulk-sms/templates/[id]` | PATCH | `bulk_sms_manage` | 템플릿 수정 |
| `/api/bulk-sms/templates/[id]` | DELETE | `bulk_sms_manage` | 템플릿 삭제 |
| `/api/cron/bulk-sms` | GET | Cron Secret | scheduled 캠페인 폴링 후 발송 (`*/5 * * * *`) |

### 6.1 발송 로직 공통화

`src/lib/bulkSmsService.ts`에 다음 헬퍼:

```ts
// 발송 대상 환자 조회 (제외 환자 매칭 포함)
getEligiblePatients(clinicId, filter, excludeRecallExcluded)

// 변수 치환 (기존 SmsSendModal 패턴 재사용)
applyVariables(template, { patientName, clinicName, clinicPhone })

// 캠페인 발송 실행 (즉시 + Cron 공용)
// - status='sending'으로 점유 (advisory lock 또는 조건부 UPDATE)
// - 수신자를 1,000명 단위로 분할
// - 각 배치에서 personalized_message 별로 그룹화
//   - 동일 메시지(예: 이름 변수 미사용) → 알리고 1회 호출에 전화번호 콤마 결합 (최대 1,000명)
//   - 환자별로 메시지가 다른 경우 → 환자별로 순차 호출 (기존 SmsSendModal.tsx의 isUniformMessage 분기 패턴 재사용)
// - 결과를 bulk_sms_recipients에 반영
// - 완료 시 status='sent'/'failed' + success_count/fail_count 집계
sendCampaign(campaignId)
```

### 6.2 예약 발송 동시성 처리

Cron이 5분 간격으로 깨어나므로 동일 캠페인이 중복 발송되지 않도록:

```sql
UPDATE bulk_sms_campaigns
SET status = 'sending', sent_at = NOW()
WHERE id = $1 AND status = 'scheduled' AND scheduled_at <= NOW()
RETURNING id;
```

`RETURNING` 결과가 없으면 다른 Cron이 이미 점유한 것으로 간주하고 건너뛴다.

### 6.3 Vercel Cron 등록

`vercel.json`에 추가:
```json
{ "path": "/api/cron/bulk-sms", "schedule": "*/5 * * * *" }
```

---

## 7. UI 컴포넌트 구조

```
src/app/dashboard/bulk-sms/
  page.tsx                              -- 권한 체크 + BulkSmsManagement 마운트

src/components/BulkSms/
  BulkSmsManagement.tsx                 -- 탭 컨테이너 (4개 탭)

  SendTab/
    SendTab.tsx                         -- 발송하기 탭 컨테이너 (상태 관리)
    PatientFilterPanel.tsx              -- 성별/연령/최종내원일/진료종류/예약유무/생일월
    PatientSearchInput.tsx              -- 이름·차트번호 검색 (debounce)
    PatientSelectionList.tsx            -- 결과 리스트 (페이징, 체크박스, 전체선택)
    RecallExcludeToggle.tsx             -- 제외 토글 + 해제 시 경고 배지
    MessageEditor.tsx                   -- 템플릿 드롭다운 + Textarea + 바이트 카운터
    MessagePreview.tsx                  -- 첫 환자 기준 치환 미리보기
    SendActionBar.tsx                   -- 테스트 발송 / 즉시·예약 라디오 / 발송 버튼
    SendConfirmDialog.tsx               -- 발송 확인 모달

  HistoryTab/
    HistoryTab.tsx
    CampaignList.tsx
    CampaignDetailModal.tsx             -- 수신자별 결과 표

  ScheduledTab/
    ScheduledTab.tsx
    ScheduledCampaignList.tsx
    CancelScheduledDialog.tsx

  TemplatesTab/
    TemplatesTab.tsx
    TemplateList.tsx
    TemplateEditModal.tsx

  shared/
    SmsTypeBadge.tsx                    -- SMS/LMS 색상 배지
    MessageCounter.tsx                  -- 바이트 카운트 (90B 경계)
    CampaignStatusBadge.tsx             -- draft/scheduled/sending/sent/failed/cancelled
```

### 디자인 시스템

- **shadcn/ui**: Button, Input, Select, Dialog, Card, Tabs, Checkbox, Badge, Textarea, Switch, RadioGroup
- **Tailwind CSS 4** + lucide-react 아이콘
- **기존 패턴 따라감**: 리콜 관리(`src/components/Recall/`) 및 소개환자(`src/components/Referral/`)의 색상·간격·카드 구조

### 발송 확인 다이얼로그 내용

- 발송 대상: **N명** (제외 N명 표시)
- 메시지 타입: **SMS / LMS** (90바이트 경계로 자동 판정)
- 미리보기 (첫 환자 기준 치환된 본문)
- 예약 발송인 경우 발송 시각 표시
- "○○명에게 정말 발송하시겠습니까?" 확인 → 발송 / 취소

---

## 8. 권한 시스템 등록

### 8.1 `src/types/permissions.ts`

```ts
// Permission union에 추가
| 'bulk_sms_view'      // 단체 문자 메뉴/이력 조회
| 'bulk_sms_send'      // 단체 문자 발송 (실제 SMS 전송)
| 'bulk_sms_manage'    // 단체 문자 템플릿 관리

// PERMISSION_GROUPS에 추가
{
  group: '단체 문자',
  permissions: ['bulk_sms_view', 'bulk_sms_send', 'bulk_sms_manage'],
}

// PERMISSION_DESCRIPTIONS에 추가
'bulk_sms_view': '단체 문자 메뉴와 발송 이력을 조회할 수 있습니다.',
'bulk_sms_send': '환자들에게 단체 문자를 발송할 수 있습니다.',
'bulk_sms_manage': '단체 문자 템플릿을 생성·수정·삭제할 수 있습니다.',

// DEFAULT_PERMISSIONS
owner:   [..., 'bulk_sms_view', 'bulk_sms_send', 'bulk_sms_manage']
manager: [..., 'bulk_sms_view', 'bulk_sms_send', 'bulk_sms_manage']
// vice_director, director, staff, intern은 기본 미부여

// NEW_FEATURE_PREFIXES에 'bulk_sms_' 추가 (기존 직원 권한 모달 오픈 시 자동 보충)
```

### 8.2 `src/config/menuConfig.ts`

```ts
{
  id: 'bulk-sms',
  label: '단체 문자',
  icon: 'MessageSquare',
  route: '/dashboard/bulk-sms',
  permissions: ['bulk_sms_view'],
  categoryId: 'operations',
  order: 50,            // 적절한 순서 (다른 운영 메뉴 사이)
  visible: true,
}
```

### 8.3 검증

- `npm run check:permissions` (prebuild 단계 자동 실행) — 누락 시 빌드 실패
- 권한 관리 모달에서 단체 문자 그룹이 표시되는지 수동 확인

---

## 9. 환자 필터 상세 명세

| 필터 | UI | DB 조건 |
|---|---|---|
| 성별 | Radio (전체/남/여) | `dentweb_patients.gender = ?` |
| 연령 | 직접 입력 min~max | `birth_date` 기준 만 나이 계산 (KST 기준 today - birth_date) |
| 최종 내원일 | 프리셋(30/60/90/180일 이내/이상) + 커스텀 from~to | `last_visit_date BETWEEN ? AND ?` |
| 마지막 진료 종류 | 다중 선택 (자동완성, 기존 값 distinct 추출) | `last_treatment_type IN (?)` |
| 다음 예약 유무 | Radio (전체/있음/없음) | `next_appointment_date IS NULL / NOT NULL` |
| 생일 월 | 다중 선택 (1~12) | `EXTRACT(MONTH FROM birth_date) IN (?)` |
| 이름/차트번호 검색 | 텍스트 입력 | `ILIKE '%?%'` on patient_name OR chart_number |
| 활성 환자만 | 기본 ON (보통 비활성=장기 미사용) | `is_active = true` |

추가 처리:
- 전화번호 없는 환자 (`phone_number IS NULL`) 는 자동 제외
- 잘못된 전화번호 형식은 발송 시 알리고에서 fail로 분류

---

## 10. 에러 처리

### 10.1 사용자가 마주칠 수 있는 에러

| 상황 | 처리 |
|---|---|
| 알리고 API key 미설정 | 발송 페이지 상단 배너 "알리고 설정이 필요합니다" + 설정 페이지 링크 |
| 전화번호 없는 환자 | 자동 제외 + "전화번호 없는 N명 제외됨" 표시 |
| 1,000명 초과 | 서버에서 자동 분할 처리 (사용자에게는 진행 표시) |
| 알리고 API 실패 (네트워크) | 캠페인 status=`failed`, 사용자에게 재시도 옵션 제공 |
| 부분 실패 (일부 수신자만 실패) | status=`sent` + fail_count > 0, 상세에서 실패자 확인 |

### 10.2 운영 에러

| 상황 | 처리 |
|---|---|
| Cron 중복 실행 | 조건부 UPDATE로 원자적 점유 (위 6.2 참조) |
| 예약 시각 이미 지난 캠페인 | Cron이 다음 실행에서 처리 (5분 지연 허용) |
| sending 상태에서 서버 크래시 | Cron이 status='sending' & sent_at < NOW() - 10분 인 캠페인 재처리 (또는 운영자가 수동 재시도) |

---

## 11. 테스트 계획

### 11.1 빌드·정적 검증
- `npm run build` 통과
- `npm run check:permissions` 통과 (prebuild)
- `npm run lint` 경고 없음

### 11.2 통합 테스트 (Chrome DevTools MCP, 테스트 계정 로그인)

**시나리오 A — 즉시 발송 골든 패스**:
1. `whitedc0902@gmail.com`로 로그인
2. 사이드바 "단체 문자" 클릭 → 메뉴 노출 확인
3. 필터(성별=여, 최종내원 30~90일) 적용 → 명단 카운트 확인
4. 메시지 작성 → 미리보기 확인
5. 테스트 발송(본인 번호) → 수신 확인
6. 본 발송 → 발송 확인 다이얼로그 → 발송 → 이력 탭에서 결과 확인

**시나리오 B — 제외 환자 검증**:
1. 리콜 관리에서 임의 환자 → `exclude_reason='family'` 설정
2. 단체 문자 발송하기 탭에서 동일 필터로 명단 조회 → 해당 환자 제외 확인
3. 제외 토글 해제 → 명단 포함 확인 + 경고 배지 노출

**시나리오 C — 예약 발송**:
1. scheduled_at을 현재 시각 +2분으로 설정 → 예약
2. 예약 캠페인 탭에서 상태 `scheduled` 확인
3. 5분 후 이력 탭에서 `sent` 상태 + 실제 발송 확인 (또는 `/api/cron/bulk-sms` 수동 호출)
4. 다른 예약 캠페인 생성 → 취소 → status=`cancelled` 확인

**시나리오 D — 권한**:
1. 일반 직원 계정으로 로그인 → 단체 문자 메뉴 안 보임 확인
2. owner 권한으로 일반 직원에게 `bulk_sms_view`만 부여 → 메뉴 보이지만 발송 버튼 비활성화 확인

### 11.3 회귀 테스트
- 리콜 관리 페이지에서 SMS 발송 정상 작동 (기존 기능 영향 없음)
- 소개환자 감사 문자 발송 정상 작동
- 권한 관리 모달에서 기존 권한 그룹 정상 표시

---

## 12. 마이그레이션 / 롤아웃

1. SQL 마이그레이션 적용 (`mcp__supabase__apply_migration`)
2. 권한·메뉴 코드 배포 → 기존 사용자 권한 모달 오픈 시 자동 보충 확인
3. Vercel 환경변수 확인: `FIXIE_URL`, `CRON_SECRET` (이미 존재)
4. `vercel.json`에 cron 추가
5. develop 푸시 → 테스트 → main PR → 머지

---

## 13. 보안·개인정보

- 환자 전화번호는 DB에 평문 저장(기존 정책 유지). 단체 문자 발송 시 알리고 로그에 일시적으로 남음 — 알리고 정책에 따름
- `personalized_message`(치환 본문)는 환자 이름이 포함되므로 RLS로 본인 클리닉만 조회 가능
- API 라우트에서 `clinic_id` 검증: 요청자의 `users.clinic_id`와 일치하지 않으면 403
- Cron 라우트는 `CRON_SECRET` 헤더 검증

---

## 14. 향후 확장 (v2 이후)

- 자동 캠페인 (생일 자동 발송, 1주년 자동 발송)
- 카카오 알림톡 / 친구톡 채널
- 발송 통계 대시보드 (오픈율·반응률·내원 전환율)
- 풍부한 변수 (`{최종내원일}`, `{다음예약일}`, `{진료종류}` 등)
- A/B 테스트 (메시지 변형 분기 발송)
- 발송 후 N일 이내 내원 환자 추적

---

## 부록 A — 영향받는 기존 파일 목록 (수정/추가)

### 신규 파일
- `supabase/migrations/20260514_create_bulk_sms.sql`
- `src/app/dashboard/bulk-sms/page.tsx`
- `src/components/BulkSms/**` (위 7장 구조)
- `src/lib/bulkSmsService.ts`
- `src/types/bulkSms.ts`
- `src/app/api/bulk-sms/**` (위 6장 라우트)
- `src/app/api/cron/bulk-sms/route.ts`

### 수정 파일
- `src/types/permissions.ts` — 권한 추가
- `src/config/menuConfig.ts` — 메뉴 추가
- `vercel.json` — Cron 등록

기존 정상 동작 기능(리콜 관리, 소개환자 관리 등)에는 영향이 없도록 분리.
