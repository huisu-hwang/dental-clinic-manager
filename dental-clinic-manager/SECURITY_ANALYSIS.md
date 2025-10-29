# Users 테이블 RLS 비활성화 - 보안 분석

## ⚠️ 잠재적 보안 위험

### 1. 멀티 테넌트 데이터 격리 실패
**위험도: 🔴 매우 높음**

```javascript
// RLS 비활성화 시 가능한 공격
const { data } = await supabase
  .from('users')
  .select('*')
  // 모든 병원의 모든 사용자 정보를 조회 가능!
```

**영향:**
- A 병원 사용자가 B 병원의 직원 정보를 조회 가능
- 다른 병원의 개인정보(이름, 전화번호, 이메일) 노출
- 병원 간 데이터 격리 완전 실패

### 2. 권한 상승 공격 (Privilege Escalation)
**위험도: 🔴 매우 높음**

```javascript
// 악의적인 사용자가 자신의 권한을 상승시킬 수 있음
const { data } = await supabase
  .from('users')
  .update({
    role: 'owner',  // 일반 직원이 원장으로 변경
    status: 'active'
  })
  .eq('id', myUserId)
```

**영향:**
- 일반 직원이 자신을 원장으로 변경
- 정지된 계정을 스스로 활성화
- 다른 병원으로 소속 변경 (`clinic_id` 수정)

### 3. 다른 사용자 정보 무단 수정
**위험도: 🔴 매우 높음**

```javascript
// 다른 사용자의 정보를 임의로 수정 가능
const { data } = await supabase
  .from('users')
  .update({
    email: 'attacker@example.com',
    phone: '010-0000-0000',
    name: '해킹됨'
  })
  .eq('id', victimUserId)  // 다른 사용자의 ID
```

**영향:**
- 다른 사용자의 이메일/전화번호 변경
- 계정 탈취 가능
- 비밀번호 재설정 링크를 공격자의 이메일로 전송

### 4. 일괄 데이터 조회 및 수출
**위험도: 🔴 매우 높음**

```javascript
// 모든 사용자 정보를 일괄 조회 가능
const { data } = await supabase
  .from('users')
  .select('email, name, phone, clinic_id, role')
  .limit(1000)

// 모든 병원의 모든 직원 정보 수집 가능
```

**영향:**
- 경쟁 병원의 직원 정보 수집
- 개인정보 대량 유출
- 스팸/피싱 공격에 활용

### 5. SQL Injection 공격 시 피해 확대
**위험도: 🟡 중간**

RLS가 비활성화되면 SQL Injection 취약점 발견 시:
```sql
-- RLS 있음: 자신의 clinic_id 데이터만 노출
-- RLS 없음: 전체 데이터베이스 노출
SELECT * FROM users; -- 모든 병원의 모든 사용자 정보
```

### 6. 프론트엔드 보안 우회
**위험도: 🔴 매우 높음**

현재 보안 체크는 프론트엔드 코드에만 있습니다:
```typescript
// dataService.updateUserProfile
if (currentUser.id !== id) {
  return { error: '본인의 프로필만 수정할 수 있습니다.' }
}
```

**문제:**
- 브라우저 개발자 도구로 우회 가능
- Supabase 클라이언트를 직접 사용하여 API 호출 가능
- 악의적인 사용자가 쉽게 우회

### 7. 개인정보 보호법 위반
**위험도: 🔴 매우 높음**

**한국 개인정보 보호법:**
- 제29조: 안전성 확보조치 의무
- 의료기관의 개인정보는 더 엄격한 보호 필요
- 기술적/관리적 보호조치 미흡 시 과태료/형사처벌

**GDPR (유럽):**
- Article 32: Security of processing
- 최대 2천만 유로 또는 전세계 매출의 4% 벌금

### 8. 감사 추적 불가능
**위험도: 🟡 중간**

RLS가 없으면:
- 누가 어떤 데이터에 접근했는지 데이터베이스 레벨에서 추적 불가
- 침해 사고 발생 시 원인 분석 어려움
- 감사(Audit) 요구사항 충족 불가

---

## ✅ 안전한 대안들

### 대안 1: Database Functions with SECURITY DEFINER (권장)
**보안성: 🟢 높음**

```sql
-- 프로필 업데이트를 위한 보안 함수 생성
CREATE OR REPLACE FUNCTION update_own_profile(
  p_user_id UUID,
  p_name TEXT,
  p_phone TEXT
)
RETURNS users
SECURITY DEFINER  -- 함수가 소유자 권한으로 실행됨
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result users;
BEGIN
  -- 현재 인증된 사용자만 자신의 프로필 수정 가능
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own profile';
  END IF;

  -- 프로필 업데이트
  UPDATE users
  SET
    name = p_name,
    phone = p_phone,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- RLS는 유지하되, 이 함수에 실행 권한 부여
GRANT EXECUTE ON FUNCTION update_own_profile TO authenticated;
```

**장점:**
- RLS 유지로 데이터베이스 레벨 보안 유지
- 함수 내부에서 권한 체크
- SQL Injection 방지
- 감사 추적 가능

**적용 방법:**
```typescript
// dataService.ts
const { data, error } = await supabase.rpc('update_own_profile', {
  p_user_id: id,
  p_name: updates.name,
  p_phone: updates.phone
})
```

### 대안 2: Service Role Key 사용
**보안성: 🟡 중간 (주의 필요)**

```typescript
// 서버 사이드에서만 사용
import { createClient } from '@supabase/supabase-js'

// Service role key는 RLS를 우회함
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 서버에서만!
)

// API Route에서만 사용
export async function POST(request: Request) {
  const session = await getServerSession()
  const { userId, updates } = await request.json()

  // 권한 체크
  if (session.user.id !== userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Service role로 업데이트
  const { data } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', userId)

  return Response.json({ data })
}
```

**주의사항:**
- Service Role Key는 절대 클라이언트에 노출 금지
- 반드시 서버 사이드(API Routes)에서만 사용
- 환경 변수로 관리

### 대안 3: 모든 사용자를 Supabase Auth로 마이그레이션
**보안성: 🟢 높음 (장기 해결책)**

```typescript
// 기존 사용자를 Supabase Auth로 마이그레이션하는 스크립트
async function migrateUsersToSupabaseAuth() {
  const { data: users } = await supabase
    .from('users')
    .select('*')

  for (const user of users) {
    // Supabase Auth 계정 생성
    const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: generateTemporaryPassword(),
      email_confirm: true,
      user_metadata: {
        name: user.name,
        phone: user.phone,
        clinic_id: user.clinic_id,
        role: user.role
      }
    })

    // users 테이블의 ID를 auth.users의 ID와 동기화
    if (authUser) {
      await supabase
        .from('users')
        .update({ id: authUser.user.id })
        .eq('id', user.id)
    }
  }
}
```

**장점:**
- auth.uid() 사용 가능
- RLS 정책 정상 작동
- Supabase의 보안 기능 완전 활용

### 대안 4: API Gateway 패턴
**보안성: 🟢 높음**

```typescript
// app/api/users/[id]/route.ts
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession()

  // 인증 확인
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 권한 확인
  if (session.user.id !== params.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates = await request.json()

  // 수정 가능한 필드만 허용
  const allowedFields = ['name', 'phone']
  const sanitizedUpdates = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => ({ ...obj, [key]: updates[key] }), {})

  // Service role로 업데이트
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(sanitizedUpdates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}
```

---

## 📊 대안 비교표

| 대안 | 보안성 | 구현 난이도 | 성능 | RLS 유지 | 권장도 |
|------|--------|------------|------|---------|--------|
| Database Functions | 🟢 높음 | 🟡 중간 | 🟢 좋음 | ✅ 유지 | ⭐⭐⭐⭐⭐ |
| Service Role Key | 🟡 중간 | 🟢 쉬움 | 🟢 좋음 | ❌ 우회 | ⭐⭐⭐ |
| Supabase Auth 마이그레이션 | 🟢 높음 | 🔴 어려움 | 🟢 좋음 | ✅ 유지 | ⭐⭐⭐⭐⭐ |
| API Gateway | 🟢 높음 | 🟡 중간 | 🟡 보통 | ❌ 우회 | ⭐⭐⭐⭐ |
| RLS 비활성화 (현재) | 🔴 낮음 | 🟢 쉬움 | 🟢 좋음 | ❌ 비활성화 | ⚠️ 권장 안함 |

---

## 🎯 권장 조치

### 즉시 조치 (임시)
1. **Database Functions 방식 구현** (대안 1)
   - 가장 빠르게 적용 가능
   - RLS 유지
   - 보안 강화

### 단기 조치 (1-2주)
2. **API Gateway 패턴 적용** (대안 4)
   - Next.js API Routes 활용
   - 서버 사이드 권한 체크
   - 클라이언트 우회 불가능

### 장기 조치 (1-2개월)
3. **Supabase Auth 마이그레이션** (대안 3)
   - 모든 사용자를 Supabase Auth로 이전
   - RLS 정책 정상화
   - 장기적으로 가장 안전

---

## 📝 결론

**RLS 비활성화는 매우 위험합니다.**

개발 편의성을 위해 RLS를 비활성화하는 것은:
- 집 대문을 열어두고 "들어오지 마세요" 표지판만 붙이는 것과 같습니다
- 법적 책임 문제 발생 가능
- 데이터 유출 시 회사 신뢰도 심각한 타격

**Database Functions 방식(대안 1)**을 즉시 적용하고, 장기적으로 **Supabase Auth 마이그레이션(대안 3)**을 진행하는 것을 강력히 권장합니다.
