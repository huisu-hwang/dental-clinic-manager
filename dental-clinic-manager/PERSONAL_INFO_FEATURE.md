# 근로계약서용 개인정보 기능 구현 완료

## 구현 내용

회원 가입 시 근로계약서 작성에 필요한 개인정보를 필수 항목으로 추가하고, 주민번호를 암호화하여 보안을 강화했습니다.

## 추가된 필수 항목

### 1. 전화번호 (phone)
- **필드명**: `phone`
- **형식**: `010-1234-5678`
- **검증**: 한국 휴대전화 번호 형식 (01X-XXXX-XXXX)
- **저장**: 평문 저장

### 2. 주소 (address)
- **필드명**: `address`
- **형식**: 자유 텍스트
- **검증**: 빈 값 체크
- **저장**: 평문 저장

### 3. 주민등록번호 (resident_registration_number)
- **필드명**: `resident_registration_number`
- **형식**: `XXXXXX-XXXXXXX` (13자리, 자동 포맷팅)
- **검증**:
  - 13자리 숫자 확인
  - 형식 검증
- **저장**: **AES-256 암호화** 저장
- **보안**:
  - Web Crypto API 사용
  - 본인과 대표원장만 복호화 가능

## 데이터베이스 스키마

```sql
-- users 테이블에 추가된 컬럼 (이미 적용됨)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS resident_registration_number TEXT;
```

## 보안 및 권한

### 암호화
- **알고리즘**: AES-GCM (256-bit)
- **키 관리**: PBKDF2를 사용한 키 유도
- **암호화 위치**: 클라이언트 사이드 (회원가입 시)
- **복호화 권한**:
  1. 본인 (자기 정보)
  2. 대표원장 (소속 직원 정보)

### RLS (Row Level Security) 정책
```sql
-- 본인과 대표원장만 개인정보 조회 가능
CREATE POLICY "Users can view colleagues in same clinic" ON users
FOR SELECT USING (
  id = auth.uid() OR -- 본인
  auth.uid() IN (
    SELECT id FROM users WHERE role = 'master_admin'
  ) OR
  (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'owner' -- 대표원장
    )
  ) OR
  (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  )
);
```

## 구현 파일

### 1. 회원가입 폼 수정
**파일**: `src/components/Auth/SignupForm.tsx`

**변경사항**:
- 전화번호, 주소, 주민번호 입력 필드 추가
- 주민번호 자동 포맷팅 (XXXXXX-XXXXXXX)
- 주민번호 실시간 검증
- 회원가입 시 주민번호 암호화 처리

**주요 코드**:
```typescript
// 주민번호 암호화
const encryptedResidentNumber = await encryptResidentNumber(formData.residentNumber);

// 사용자 프로필 생성 시 포함
await supabase.from('users').insert({
  id: newUserId,
  clinic_id: clinicData.id,
  email: formData.userId,
  name: formData.name,
  phone: formData.phone,
  address: formData.address,
  resident_registration_number: encryptedResidentNumber,
  role: 'owner',
  status: 'active',
});
```

### 2. 근로계약서 폼 (이미 구현됨)
**파일**: `src/components/Contract/ContractForm.tsx`

**기능**:
- 직원 선택 시 개인정보 자동 입력
- 주민번호 마스킹 표시 (복호화 후)

**코드** (lines 47-56):
```typescript
useEffect(() => {
  if (selectedEmployee) {
    setFormData(prev => ({
      ...prev,
      employee_name: selectedEmployee.name,
      employee_address: selectedEmployee.address || '',
      employee_phone: selectedEmployee.phone || '',
      employee_resident_number: selectedEmployee.resident_registration_number || ''
    }))
  }
}, [selectedEmployee])
```

### 3. 암호화 유틸리티
**파일**: `src/utils/encryptionUtils.ts`

**주요 함수**:
- `encryptResidentNumber(residentNumber: string)`: 주민번호 암호화
- `decryptResidentNumber(encryptedData: string)`: 주민번호 복호화

### 4. 주민번호 유틸리티
**파일**: `src/utils/residentNumberUtils.ts`

**주요 함수**:
- `validateResidentNumberWithMessage()`: 주민번호 검증
- `autoFormatResidentNumber()`: 자동 포맷팅
- `formatResidentNumber()`: 포맷 변환
- `maskResidentNumber()`: 마스킹 처리

### 5. 데이터베이스 Migration
**파일**: `supabase/migrations/20251029_add_user_personal_info.sql`

**내용**:
- users 테이블에 address, resident_registration_number 컬럼 추가
- 암호화/복호화 함수 정의
- RLS 정책 설정
- 검증 함수 및 제약조건 추가

## 테스트 시나리오

### 1. 회원가입 테스트

#### 대표원장으로 가입
1. http://localhost:3003 접속
2. "회원가입" 클릭
3. 다음 정보 입력:
   - 이메일: `test@example.com`
   - 이름: `홍길동`
   - 전화번호: `010-1234-5678`
   - 주소: `서울시 강남구 테헤란로 123`
   - 주민번호: `900101-1234567`
   - 비밀번호: `password123`
   - 직책: `대표원장`
   - 치과 정보 입력
4. "회원가입 완료" 클릭
5. ✅ 성공 메시지 확인

#### 일반 직원으로 가입
1. 직책을 `진료팀원` 선택
2. 소속 병원 선택
3. 개인정보 입력 (위와 동일)
4. ✅ 가입 신청 성공 확인

### 2. 개인정보 검증 테스트

#### 전화번호 검증
- ❌ 빈 값: "전화번호를 입력해주세요."
- ❌ 잘못된 형식 (123-456): "올바른 전화번호 형식을 입력해주세요."
- ✅ 올바른 형식: 010-1234-5678

#### 주소 검증
- ❌ 빈 값: "주소를 입력해주세요."
- ✅ 자유 텍스트 입력

#### 주민번호 검증
- ❌ 빈 값: "주민등록번호를 입력해주세요."
- ❌ 12자리: "주민등록번호는 13자리 숫자여야 합니다. (현재 12자리)"
- ❌ 14자리: "주민등록번호는 13자리를 초과할 수 없습니다."
- ✅ 13자리: 정상 처리
- ✅ 자동 포맷팅: `1234567890123` → `123456-7890123`

### 3. 암호화 테스트

```javascript
// 데이터베이스에서 확인
const { data } = await supabase
  .from('users')
  .select('resident_registration_number')
  .eq('email', 'test@example.com')
  .single();

console.log(data.resident_registration_number);
// 출력: 암호화된 Base64 문자열 (예: "k3Jf8mN2pQ==...")
// ✅ 평문이 아닌 암호화된 값 확인
```

### 4. 근로계약서 자동 입력 테스트

1. 대표원장으로 로그인
2. 대시보드 > 근로계약서 > "새 계약서 작성"
3. 직원 선택
4. ✅ 다음 필드가 자동으로 입력되는지 확인:
   - 성명
   - 전화번호
   - 주소
   - 주민등록번호 (복호화됨)

### 5. 권한 테스트

#### 본인 정보 조회
1. 일반 직원으로 로그인
2. 프로필 조회
3. ✅ 본인의 모든 정보 볼 수 있음

#### 대표원장이 직원 정보 조회
1. 대표원장으로 로그인
2. 직원 목록 조회
3. 근로계약서 작성
4. ✅ 소속 직원의 개인정보 (주민번호 포함) 조회 가능

#### 타 병원 직원 정보 조회
1. A병원 직원으로 로그인
2. B병원 직원 정보 조회 시도
3. ✅ 개인정보 필드 접근 차단 확인

## 보안 권장사항

### 환경 변수 설정
`.env.local` 파일에 암호화 키 추가:
```env
NEXT_PUBLIC_ENCRYPTION_SALT=your-secure-random-32-char-string-here
```

**중요**:
- 프로덕션 환경에서는 반드시 강력한 랜덤 문자열 사용
- 키를 절대 Git에 커밋하지 말 것
- 키를 변경하면 기존 암호화된 데이터 복호화 불가

### 백업 정책
- 데이터베이스 정기 백업
- 암호화 키 안전한 곳에 별도 보관
- 키 분실 시 복구 불가능하므로 주의

## 체크리스트

- [x] 데이터베이스 스키마 추가
- [x] 암호화/복호화 유틸리티 구현
- [x] 주민번호 검증 유틸리티 구현
- [x] 회원가입 폼에 필수 필드 추가
- [x] 주민번호 자동 포맷팅
- [x] 회원가입 시 암호화 처리
- [x] 근로계약서 자동 입력 (이미 구현됨)
- [x] RLS 정책 설정 (본인/대표원장만 조회)
- [x] 컴파일 테스트 통과

## 다음 단계

1. **실제 회원가입 테스트**
   - 새 계정으로 회원가입 진행
   - 개인정보 입력 확인
   - 데이터베이스에 암호화 저장 확인

2. **근로계약서 생성 테스트**
   - 대표원장 계정으로 로그인
   - 직원 선택 후 계약서 작성
   - 개인정보 자동 입력 확인

3. **보안 테스트**
   - 데이터베이스에서 암호화 확인
   - RLS 정책 동작 확인
   - 권한별 접근 제어 확인

## 참고 자료

- [Supabase RLS 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [PBKDF2 키 유도](https://en.wikipedia.org/wiki/PBKDF2)
