# 지점별 출근 인증 시스템

## 📋 목차
- [개요](#개요)
- [기획 배경](#기획-배경)
- [시스템 아키텍처](#시스템-아키텍처)
- [데이터베이스 설계](#데이터베이스-설계)
- [백엔드 API](#백엔드-api)
- [프론트엔드 UI](#프론트엔드-ui)
- [구현 로드맵](#구현-로드맵)
- [테스트 시나리오](#테스트-시나리오)

---

## 개요

### 문제점
현재 시스템은 하나의 `clinic` = 하나의 물리적 위치만 지원합니다. 여러 지점을 운영하는 병원의 경우 각 지점별로 출근 인증을 관리할 수 없습니다.

### 해결 방안
**병원(Clinic) vs 지점(Branch) 개념 분리**
- `clinic`: 법인/브랜드 단위 (예: "서울치과의원")
- `branch`: 물리적 지점 (예: "본점", "강남점", "서초점")

### 주요 기능
- ✅ 지점 생성/수정/삭제 관리
- ✅ 지점별 QR 코드 생성
- ✅ 지점별 출근/퇴근 기록
- ✅ 지점별 출근 통계 및 리포트
- ✅ 지점 간 직원 이동 지원
- ✅ 하위 호환성 유지 (기존 기능 영향 없음)

---

## 기획 배경

### 요구사항
> "병원에서는 지점이 여러 군데 있을 수 있어. 그래서 각 지점마다 출근 기능이 작동되도록 해야 해."

### 사용 사례
1. **다지점 병원 운영**
   - 강남점, 서초점, 판교점 등 여러 지점 운영
   - 각 지점의 위치가 다름 (GPS 좌표 다름)
   - 지점별로 출근 인증 필요

2. **유연한 근무 관리**
   - 직원이 오늘은 강남점, 내일은 서초점 근무 가능
   - 지점별 출근 현황 실시간 확인
   - 지점별 통계 및 리포트

3. **확장성**
   - 지점 무제한 추가 가능
   - 지점 폐쇄/재개 관리
   - 미래 확장 대비

---

## 시스템 아키텍처

### 설계 원칙

#### 1. 하위 호환성 유지
- `branch_id`는 모두 nullable (선택 필드)
- 기존 코드는 계속 작동
- 점진적 마이그레이션 가능

#### 2. 최소 침습 원칙
- 기존 테이블 구조 최소 변경
- 새로운 기능은 독립적으로 구현
- 기존 기능에 영향 없음

#### 3. 보안
- RLS 정책으로 권한 관리
- 지점별 데이터 접근 제어
- owner/manager만 지점 관리 가능

---

## 데이터베이스 설계

### ERD 개념도

```
clinics (병원)
   │
   ├─── clinic_branches (지점)
   │       │
   │       ├─── attendance_qr_codes (지점별 QR 코드)
   │       │
   │       └─── attendance_records (지점별 출근 기록)
   │
   └─── users (직원)
           └─── primary_branch_id (주 근무 지점)
```

### 1. clinic_branches 테이블 (신규)

```sql
CREATE TABLE clinic_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,          -- "본점", "강남점", "서초점"
  branch_code TEXT,                   -- 내부 관리 코드

  -- 지점 위치 정보
  address TEXT,
  latitude DECIMAL(10, 8),           -- 위도
  longitude DECIMAL(11, 8),          -- 경도

  -- 출근 인증 설정
  attendance_radius_meters INTEGER DEFAULT 100,

  -- 지점별 연락처
  phone TEXT,

  -- 지점 상태
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  UNIQUE(clinic_id, branch_name)
);
```

**인덱스:**
- `idx_clinic_branches_clinic` ON (clinic_id)
- `idx_clinic_branches_active` ON (clinic_id, is_active)

### 2. 기존 테이블 확장

```sql
-- QR 코드에 지점 정보 추가
ALTER TABLE attendance_qr_codes
ADD COLUMN branch_id UUID REFERENCES clinic_branches(id);

-- 출근 기록에 지점 정보 추가
ALTER TABLE attendance_records
ADD COLUMN branch_id UUID REFERENCES clinic_branches(id);

-- 직원의 주 근무 지점 추가
ALTER TABLE users
ADD COLUMN primary_branch_id UUID REFERENCES clinic_branches(id);
```

### 3. RLS (Row Level Security) 정책

```sql
-- 읽기: 자신의 병원 지점만 조회
CREATE POLICY "Users can view branches of their clinic"
ON clinic_branches FOR SELECT
USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- 생성/수정: owner와 manager만
CREATE POLICY "Owners and managers can manage branches"
ON clinic_branches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND clinic_id = clinic_branches.clinic_id
    AND role IN ('owner', 'manager')
  )
);

-- 삭제: owner만
CREATE POLICY "Owners can delete branches"
ON clinic_branches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND clinic_id = clinic_branches.clinic_id
    AND role = 'owner'
  )
);
```

### 4. 마이그레이션 전략

**Phase 1: 스키마 추가**
```sql
-- 1. clinic_branches 테이블 생성
-- 2. 기존 테이블에 branch_id 컬럼 추가 (nullable)
-- 3. RLS 정책 설정
-- 4. 인덱스 생성
```

**Phase 2: 기본 지점 생성**
```sql
-- 각 병원마다 "본점" 자동 생성
INSERT INTO clinic_branches (clinic_id, branch_name, is_active)
SELECT id, '본점', true
FROM clinics
WHERE NOT EXISTS (
  SELECT 1 FROM clinic_branches WHERE clinic_id = clinics.id
);
```

**Phase 3: 점진적 전환**
- 새로운 QR 코드는 지점별로 생성
- 기존 QR 코드는 계속 사용 (본점으로 간주)
- 직원들의 primary_branch_id 설정

---

## 백엔드 API

### 타입 정의 (`src/types/branch.ts`)

```typescript
export interface ClinicBranch {
  id: string
  clinic_id: string
  branch_name: string
  branch_code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  attendance_radius_meters: number
  phone: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface CreateBranchInput {
  clinic_id: string
  branch_name: string
  branch_code?: string
  address?: string
  latitude?: number
  longitude?: number
  attendance_radius_meters?: number
  phone?: string
  is_active?: boolean
  display_order?: number
}

export interface UpdateBranchInput {
  branch_name?: string
  branch_code?: string
  address?: string
  latitude?: number
  longitude?: number
  attendance_radius_meters?: number
  phone?: string
  is_active?: boolean
  display_order?: number
}
```

### 서비스 함수 (`src/lib/branchService.ts`)

#### 1. CRUD 기능

```typescript
// 지점 목록 조회
getBranches(filter: BranchFilter): Promise<BranchesResponse>

// 특정 지점 조회
getBranchById(branchId: string): Promise<ClinicBranch>

// 지점 생성
createBranch(input: CreateBranchInput, currentUserId: string): Promise<ClinicBranch>

// 지점 수정
updateBranch(branchId: string, input: UpdateBranchInput): Promise<ClinicBranch>

// 지점 삭제
deleteBranch(branchId: string): Promise<void>

// 지점 활성화/비활성화
toggleBranchActive(branchId: string, isActive: boolean): Promise<ClinicBranch>
```

#### 2. 유틸리티 함수

```typescript
// UI 선택용 지점 목록
getBranchOptions(clinicId: string): Promise<BranchOption[]>

// 지점별 출근 통계
getBranchAttendanceStats(clinicId: string, date: string): Promise<BranchAttendanceStats[]>

// 기본 지점 조회 (본점)
getDefaultBranch(clinicId: string): Promise<ClinicBranch>
```

#### 3. 유효성 검증

```typescript
export function validateBranch(input: CreateBranchInput | UpdateBranchInput): BranchValidation {
  const errors = {}

  // 지점명 검증
  if (!input.branch_name || input.branch_name.length > 50) {
    errors.branch_name = '지점명을 확인해주세요.'
  }

  // 위도/경도 검증
  if (input.latitude < -90 || input.latitude > 90) {
    errors.latitude = '위도는 -90 ~ 90 사이여야 합니다.'
  }

  // 출근 반경 검증
  if (input.attendance_radius_meters < 10 || input.attendance_radius_meters > 1000) {
    errors.attendance_radius_meters = '출근 반경은 10 ~ 1000m 사이여야 합니다.'
  }

  return { isValid: Object.keys(errors).length === 0, errors }
}
```

### Attendance Service 수정 (`src/lib/attendanceService.ts`)

#### QR 코드 생성 수정

```typescript
export async function generateDailyQRCode(input: QRCodeGenerateInput) {
  const { clinic_id, branch_id, latitude, longitude, radius_meters = 100 } = input

  // 1. branch_id가 있으면 해당 지점 정보 조회
  if (branch_id) {
    const { data: branch } = await supabase
      .from('clinic_branches')
      .select('latitude, longitude, attendance_radius_meters')
      .eq('id', branch_id)
      .single()

    // 지점의 위치 정보 사용
    const qrLat = branch.latitude || latitude
    const qrLon = branch.longitude || longitude
    const qrRadius = branch.attendance_radius_meters || radius_meters
  }

  // 2. QR 코드 생성 (branch_id 포함)
  const qrCodeValue = `ATTENDANCE_${clinic_id}_${branch_id || 'MAIN'}_${today}_${uuid}`

  // 3. 저장
  await supabase.from('attendance_qr_codes').insert({
    clinic_id,
    branch_id,
    qr_code: qrCodeValue,
    valid_date: today,
    latitude: qrLat,
    longitude: qrLon,
    radius_meters: qrRadius,
    is_active: true
  })
}
```

#### 출근 체크 수정

```typescript
export async function checkIn(request: CheckInRequest) {
  const { user_id, qr_code, work_date, latitude, longitude } = request

  // 1. QR 코드에서 branch_id 추출
  const { data: qrData } = await supabase
    .from('attendance_qr_codes')
    .select('clinic_id, branch_id')
    .eq('qr_code', qr_code)
    .single()

  // 2. 출근 기록 저장 (branch_id 포함)
  await supabase.from('attendance_records').insert({
    user_id,
    clinic_id: qrData.clinic_id,
    branch_id: qrData.branch_id,  // 추가
    work_date,
    check_in_time: new Date().toISOString(),
    check_in_latitude: latitude,
    check_in_longitude: longitude
  })
}
```

---

## 프론트엔드 UI

### 1. 관리자 - 지점 관리 페이지

**경로:** `/admin/branches`

**기능:**
- 지점 목록 조회 (카드 형식)
- 지점 추가 (모달)
- 지점 수정 (모달)
- 지점 삭제 (확인 다이얼로그)
- 지점 활성화/비활성화 (토글)
- 지도에서 위치 선택 (Google Maps API)

**UI 레이아웃:**
```
┌─────────────────────────────────────┐
│ 지점 관리                   [+ 추가] │
├─────────────────────────────────────┤
│                                      │
│ ┌──────────────────────────────┐   │
│ │ 📍 본점                  ✅   │   │
│ │ 서울시 강남구 테헤란로 123    │   │
│ │ 출근 반경: 100m              │   │
│ │ 직원: 5명                    │   │
│ │ [수정] [비활성화]             │   │
│ └──────────────────────────────┘   │
│                                      │
│ ┌──────────────────────────────┐   │
│ │ 📍 강남점                ✅   │   │
│ │ 서울시 강남구 역삼로 456      │   │
│ │ 출근 반경: 100m              │   │
│ │ 직원: 3명                    │   │
│ │ [수정] [비활성화]             │   │
│ └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 2. 관리자 - QR 코드 생성

**경로:** `/admin/attendance/qr-code`

**기능:**
- 지점 선택 드롭다운
- 지점별 QR 코드 생성
- 모든 지점 QR 한 번에 표시 (인쇄용)

**UI 레이아웃:**
```
┌─────────────────────────────────────┐
│ 출근 QR 코드 생성                    │
├─────────────────────────────────────┤
│ 지점 선택: [전체 지점 ▼]            │
│                                      │
│ ┌──────────┐  ┌──────────┐         │
│ │ 본점 QR  │  │ 강남점 QR │         │
│ │ ████████ │  │ ████████ │         │
│ │ ████████ │  │ ████████ │         │
│ └──────────┘  └──────────┘         │
│                                      │
│ [전체 인쇄] [개별 다운로드]          │
└─────────────────────────────────────┘
```

### 3. 관리자 - 출근 현황 대시보드

**경로:** `/admin/attendance/dashboard`

**기능:**
- 지점별 필터
- 전체/지점별 출근 현황
- 실시간 업데이트

**UI 레이아웃:**
```
┌─────────────────────────────────────┐
│ 출근 현황 (2025-11-05)               │
├─────────────────────────────────────┤
│ [전체 ▼] [본점] [강남점]            │
│                                      │
│ 전체: 출근 8/10명 (80%)              │
│ ├ 본점: 5/6명 (83%)                 │
│ └ 강남점: 3/4명 (75%)               │
│                                      │
│ 지각: 2명                            │
│ ├ 본점: 홍길동 (09:05)              │
│ └ 강남점: 김철수 (09:10)            │
└─────────────────────────────────────┘
```

### 4. 직원 - 출근 체크

**경로:** `/employee/attendance/check-in`

**기능:**
- QR 스캔
- 지점 자동 감지
- 위치 검증

**UI 레이아웃:**
```
┌─────────────────────────────────────┐
│ 출근 체크                            │
├─────────────────────────────────────┤
│     [QR 스캔 영역]                   │
│                                      │
│ 📍 감지된 지점: 강남점               │
│ 📍 주소: 서울시 강남구 역삼로 456    │
│                                      │
│ ✅ 위치 확인 완료 (거리: 45m)        │
│                                      │
│ [강남점에 출근하기]                  │
└─────────────────────────────────────┘
```

### 5. 직원 - 출근 기록 조회

**경로:** `/employee/attendance/records`

**기능:**
- 월별 캘린더
- 지점 정보 표시

**UI 레이아웃:**
```
┌─────────────────────────────────────┐
│ 내 출근 기록 (2025년 11월)           │
├─────────────────────────────────────┤
│ 11월 5일 (화) 📍 강남점              │
│ └ 출근: 09:05  퇴근: 18:30           │
│                                      │
│ 11월 4일 (월) 📍 본점                │
│ └ 출근: 09:00  퇴근: 18:00           │
│                                      │
│ 11월 3일 (일) 휴무                   │
└─────────────────────────────────────┘
```

---

## 구현 로드맵

### ✅ Phase 1: 데이터베이스 스키마 (완료)
- [x] clinic_branches 테이블 SQL 스크립트
- [x] 기존 테이블에 branch_id 컬럼 추가
- [x] RLS 정책 설정
- [x] 인덱스 생성
- [x] 기본 지점('본점') 마이그레이션

**커밋:** `6f9f721` (2025-01-05)

### ✅ Phase 2: 백엔드 서비스 기본 (완료)
- [x] src/types/branch.ts 타입 정의
- [x] src/lib/branchService.ts CRUD 구현
- [x] src/types/attendance.ts 업데이트

**커밋:** `6f9f721` (2025-01-05)

### 🔄 Phase 3: Attendance Service 통합 (진행중)
- [ ] generateDailyQRCode() 수정 (branch_id 지원)
- [ ] validateQRCode() 수정 (지점 위치 검증)
- [ ] checkIn() 수정 (branch_id 저장)
- [ ] checkOut() 수정
- [ ] getAttendanceRecords() 수정 (지점 필터)

**예상 완료:** 2025-01-06

### 📅 Phase 4: 데이터베이스 실행 (예정)
- [ ] Supabase에서 마이그레이션 스크립트 실행
- [ ] 스키마 검증
- [ ] RLS 정책 테스트
- [ ] 기본 데이터 생성 확인

**예상 완료:** 2025-01-07

### 📅 Phase 5: 관리자 UI (예정)
- [ ] 지점 관리 페이지 (`/admin/branches`)
- [ ] 지점 생성/수정 모달
- [ ] 지점별 QR 코드 생성 페이지 수정
- [ ] 출근 현황 대시보드 (지점 필터 추가)
- [ ] 근태 통계 리포트 (지점별 비교)

**예상 완료:** 2025-01-14

### 📅 Phase 6: 직원 UI (예정)
- [ ] 출근 체크 화면 (지점 정보 표시)
- [ ] 출근 기록 조회 (지점 표시)
- [ ] 프로필 설정 (주 근무 지점)

**예상 완료:** 2025-01-18

### 📅 Phase 7: 테스트 및 배포 (예정)
- [ ] 단위 테스트
- [ ] 통합 테스트
- [ ] 사용자 인수 테스트 (UAT)
- [ ] 프로덕션 배포

**예상 완료:** 2025-01-21

---

## 테스트 시나리오

### 1. 데이터베이스 테스트

#### 테스트 1-1: 지점 생성
```sql
-- 강남점 생성
INSERT INTO clinic_branches (clinic_id, branch_name, address, latitude, longitude)
VALUES (
  '{clinic_id}',
  '강남점',
  '서울시 강남구 역삼로 456',
  37.4979,
  127.0276
);

-- 확인
SELECT * FROM clinic_branches WHERE branch_name = '강남점';
```

#### 테스트 1-2: RLS 정책 검증
```sql
-- owner 계정으로 접속
SELECT * FROM clinic_branches;  -- 자신의 병원 지점만 보임

-- 직원 계정으로 접속
SELECT * FROM clinic_branches;  -- 읽기만 가능

-- 다른 병원 계정으로 접속
SELECT * FROM clinic_branches;  -- 아무것도 안 보임
```

### 2. 백엔드 API 테스트

#### 테스트 2-1: 지점 CRUD
```javascript
// 지점 생성
const result = await branchService.createBranch({
  clinic_id: 'xxx',
  branch_name: '강남점',
  address: '서울시 강남구 역삼로 456',
  latitude: 37.4979,
  longitude: 127.0276,
  attendance_radius_meters: 100
}, currentUserId)

// 지점 목록 조회
const branches = await branchService.getBranches({
  clinic_id: 'xxx',
  is_active: true
})

// 지점 수정
const updated = await branchService.updateBranch(branchId, {
  branch_name: '강남점 (본관)',
  attendance_radius_meters: 150
})

// 지점 삭제
await branchService.deleteBranch(branchId)
```

#### 테스트 2-2: QR 코드 생성 (지점별)
```javascript
// 강남점 QR 생성
const qrCode = await generateDailyQRCode({
  clinic_id: 'xxx',
  branch_id: 'branch-gangnam-id'
})

// QR 코드에 지점 정보 포함 확인
console.log(qrCode.branch_id)  // 'branch-gangnam-id'
console.log(qrCode.latitude)   // 37.4979
console.log(qrCode.longitude)  // 127.0276
```

#### 테스트 2-3: 출근 체크 (지점별)
```javascript
// 강남점 QR로 출근
const result = await checkIn({
  user_id: 'xxx',
  qr_code: 'ATTENDANCE_xxx_branch-gangnam_2025-11-05_uuid',
  work_date: '2025-11-05',
  latitude: 37.4979,
  longitude: 127.0276
})

// 출근 기록에 지점 정보 확인
const { data } = await supabase
  .from('attendance_records')
  .select('*, clinic_branches(*)')
  .eq('user_id', 'xxx')
  .eq('work_date', '2025-11-05')
  .single()

console.log(data.branch_id)  // 'branch-gangnam-id'
console.log(data.clinic_branches.branch_name)  // '강남점'
```

### 3. 시나리오 테스트

#### 시나리오 3-1: 단일 지점 병원 (하위 호환성)
```
1. 기존 병원에 "본점" 자동 생성 확인
2. 기존 QR 코드로 출근 (branch_id = NULL)
3. 출근 기록 정상 확인
4. 통계 조회 정상 확인
```

#### 시나리오 3-2: 다지점 병원
```
1. 본점, 강남점, 서초점 생성
2. 각 지점별 QR 코드 생성
3. 직원 A: 본점 출근
4. 직원 B: 강남점 출근
5. 직원 C: 서초점 출근
6. 출근 현황 확인 (지점별 필터)
7. 통계 리포트 확인 (지점별 비교)
```

#### 시나리오 3-3: 잘못된 지점 출근 시도
```
1. 직원 A는 본점 소속 (primary_branch_id = 본점)
2. 강남점 QR 스캔
3. 경고 메시지: "강남점 QR입니다. 본점에서 근무 예정이신가요?"
4. 선택:
   - "아니오" → 본점 QR 스캔 안내
   - "예" → 출근 허용 (관리자에게 알림)
```

#### 시나리오 3-4: 지점 폐쇄
```
1. 강남점 비활성화 (is_active = false)
2. 강남점 QR 코드 자동 비활성화
3. 강남점 QR 스캔 시 에러 메시지
4. 소속 직원들에게 알림
```

### 4. 성능 테스트

#### 테스트 4-1: 동시 출근 처리
```
시나리오: 100개 지점, 1000명 직원 동시 출근
목표: 응답 시간 < 2초
방법: Apache JMeter 또는 k6
```

#### 테스트 4-2: 쿼리 성능
```sql
-- 지점별 출근 통계 (인덱스 활용 확인)
EXPLAIN ANALYZE
SELECT
  cb.branch_name,
  COUNT(ar.id) as checked_in
FROM clinic_branches cb
LEFT JOIN attendance_records ar
  ON cb.id = ar.branch_id
  AND ar.work_date = '2025-11-05'
WHERE cb.clinic_id = 'xxx'
GROUP BY cb.id, cb.branch_name;
```

---

## 엣지 케이스 처리

### 1. 잘못된 지점 출근
- **현상:** 강남점 직원이 서초점 QR 스캔
- **처리:**
  1. 경고 메시지 표시
  2. 선택 옵션 제공 (진행/취소)
  3. 진행 시 관리자에게 알림

### 2. 지점 간 거리가 가까운 경우
- **현상:** 강남점과 서초점이 100m 거리
- **처리:**
  1. QR 코드 우선 (위치보다 정확)
  2. 각 지점의 반경을 작게 설정 (50m)
  3. GPS 오차 허용 범위 고려

### 3. 지점 폐쇄
- **처리:**
  1. is_active = false 설정
  2. QR 코드 자동 비활성화
  3. 소속 직원에게 알림
  4. 다른 지점 재배정

### 4. 본점 삭제 시도
- **처리:** 본점은 삭제 불가 (에러 메시지)

### 5. 소속 직원 있는 지점 삭제
- **처리:** 에러 메시지 (직원 수 표시)

---

## 보안 고려사항

### 1. QR 코드 보안
- 일일 QR 코드 (매일 만료)
- QR 코드에 branch_id 포함 (위조 방지)
- 서버 사이드 검증 필수

### 2. 위치 스푸핑 방지
- GPS 정확도 체크 (< 50m)
- QR + 위치 이중 검증
- 비정상 이동 감지

### 3. 데이터 접근 제어
- RLS 정책으로 지점별 데이터 격리
- owner/manager만 지점 관리
- 직원은 본인 기록만 조회

### 4. 감사 로그
- 지점 생성/수정/삭제 로그
- 비정상 출근 패턴 감지
- 관리자 행동 추적

---

## 참고 자료

### 파일 위치
- **마이그레이션:** `scripts/migrations/001-create-clinic-branches.sql`
- **타입 정의:** `src/types/branch.ts`
- **백엔드 서비스:** `src/lib/branchService.ts`
- **Attendance 타입:** `src/types/attendance.ts`

### 관련 이슈
- GitHub Issue: (추가 예정)
- 기획 문서: `docs/features/branch-attendance-system.md` (이 파일)

### 관련 커밋
- `6f9f721` - feat: 지점 관리 시스템 Phase 1-2 구현 (2025-01-05)

---

## 변경 이력

### 2025-01-05
- 📄 문서 최초 작성
- ✅ Phase 1 완료 (데이터베이스 스키마)
- ✅ Phase 2 완료 (백엔드 서비스 기본)
- 🔄 Phase 3 진행중 (Attendance Service 통합)

---

**작성자:** Claude Code
**최종 수정:** 2025-01-05
**상태:** 진행중 (Phase 3)
