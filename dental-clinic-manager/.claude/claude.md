# Claude Code 개발 방법론

## 핵심 원칙

### 🛡️ 기존 기능 보호 원칙 (최우선)

**새로운 기능 구현이나 오류 수정 시 반드시 준수:**

1. **최소 침습 원칙 (Minimal Invasive Changes)**
   - 정상 작동하는 기존 기능에 영향을 주지 않도록 최소한으로 변경
   - 꼭 필요한 경우가 아니면 기존 코드 수정 금지
   - 새로운 기능은 기존 코드와 독립적으로 구현

2. **영향 범위 분석 필수**
   - 코드 수정 전 반드시 영향받는 기능 파악
   - Sequential Thinking에서 기존 기능 영향도 분석 포함
   - 의존성이 있는 모든 컴포넌트/함수 확인

3. **사이드 이펙트 최소화**
   - 전역 상태 변경 최소화
   - 공유 유틸리티 함수 수정 시 주의
   - 타입 변경 시 모든 사용처 확인

4. **하위 호환성 유지 (Backward Compatibility)**
   - 기존 API 인터페이스 변경 금지 (부득이한 경우 선택적 필드로 추가)
   - 데이터베이스 스키마 변경 시 마이그레이션 스크립트 필수
   - 기존 데이터 구조와 호환되도록 설계

5. **검증 필수**
   - 수정 후 기존 기능 동작 테스트
   - 회귀 테스트 (Regression Test) 수행
   - 관련 기능 모두 수동 테스트

**예시:**
```
❌ 나쁜 예:
- 공통 함수 getCurrentClinicId()의 동작 방식 변경
- 모든 컴포넌트가 사용하는 타입 인터페이스 필드 제거
- 기존 API 파라미터 순서 변경

✅ 좋은 예:
- 새로운 선택적 필드 추가 (clinic_id?: string)
- 기존 함수는 유지하고 새로운 함수 추가
- 파라미터 우선순위로 하위 호환성 유지 (formData.clinic_id || await getCurrentClinicId())
```

---

### 📋 개발 순서

모든 기능 구현은 다음 순서를 **반드시** 따릅니다:

1. **Sequential Thinking (ultrathink)** - 문제 분석 및 설계
2. **계획 수립 (Planning)** - 구현 단계 정의
3. **TDD (Test-Driven Development)** - 테스트 주도 개발

---

## 1단계: Sequential Thinking (필수)

### 사용 시점
- 새로운 기능 구현 요청 시 **항상** 먼저 실행
- 복잡한 문제 해결 시
- 기존 코드 리팩토링 시

### Sequential Thinking 프로세스

```typescript
// mcp__sequential-thinking__sequentialthinking 도구 사용

{
  "thought": "현재 사고 단계",
  "nextThoughtNeeded": true/false,
  "thoughtNumber": 1,
  "totalThoughts": 예상_단계_수,
  "isRevision": false,
  "needsMoreThoughts": false
}
```

### 사고 단계 구조

#### Step 1-3: 문제 이해
- 사용자 요구사항 명확화
- 기존 코드베이스 영향 범위 파악
- 제약사항 및 의존성 확인

#### Step 4-6: 설계
- 데이터베이스 스키마 설계
- API/서비스 레이어 설계
- UI 컴포넌트 구조 설계

#### Step 7-9: 구현 계획
- 파일 구조 정의
- 기술 스택 선택
- 순차적 구현 단계 정의

#### Step 10-12: 검증
- 테스트 시나리오 정의
- 엣지 케이스 식별
- 보안 및 성능 고려사항

### 예시

```
Thought 1: 사용자가 회원가입 시 주민번호를 입력하도록 요청했다.
- 주민번호는 민감정보이므로 암호화 필요
- 근로계약서 작성 시 사용된다는 맥락 파악
- 기존 users 테이블에 컬럼 추가 필요

Thought 2: 데이터베이스 스키마 설계
- resident_registration_number TEXT 컬럼 추가
- 암호화된 값 저장 (AES-256)
- RLS 정책으로 접근 제어 (본인 + 대표원장만)

Thought 3: 클라이언트 사이드 암호화 필요
- Web Crypto API 사용
- encryptionUtils.ts에 암호화 함수 구현
- 회원가입 시 암호화 후 저장

... (계속)
```

---

## 2단계: 계획 수립 (Planning)

### TodoWrite 도구 활용

Sequential Thinking 완료 후 **즉시** TodoWrite로 작업 항목 생성:

```json
[
  {
    "content": "데이터베이스 스키마 수정",
    "status": "pending",
    "activeForm": "스키마 수정 중"
  },
  {
    "content": "암호화 유틸리티 구현",
    "status": "pending",
    "activeForm": "유틸리티 구현 중"
  },
  {
    "content": "회원가입 폼 수정",
    "status": "pending",
    "activeForm": "폼 수정 중"
  },
  {
    "content": "테스트 작성 및 실행",
    "status": "pending",
    "activeForm": "테스트 중"
  }
]
```

### 계획 체크리스트

- [ ] 구현할 기능 목록 작성
- [ ] 각 기능의 우선순위 정의
- [ ] 의존성 관계 파악 (A → B → C)
- [ ] 예상 소요 시간 추정
- [ ] 잠재적 위험 요소 식별

---

## 3단계: TDD (Test-Driven Development)

### TDD 사이클

```
1. RED: 실패하는 테스트 작성
   ↓
2. GREEN: 최소한의 코드로 테스트 통과
   ↓
3. REFACTOR: 코드 개선 및 최적화
   ↓
(반복)
```

### 구현 순서

#### 1) 테스트 시나리오 작성
```markdown
## 테스트 시나리오

### 1. 주민번호 입력 검증
- [ ] 빈 값 입력 시 에러 메시지
- [ ] 12자리 입력 시 에러 메시지
- [ ] 13자리 입력 시 통과
- [ ] 자동 포맷팅 (XXXXXX-XXXXXXX)

### 2. 암호화 처리
- [ ] 평문 주민번호 암호화 성공
- [ ] 암호화된 값 복호화 시 원본과 일치
- [ ] 데이터베이스에 암호화된 값 저장 확인
```

#### 2) 테스트 스크립트 작성
```javascript
// scripts/test-resident-number-encryption.js
describe('주민번호 암호화', () => {
  it('평문을 암호화하면 원본과 다른 값이 나온다', async () => {
    const original = '900101-1234567';
    const encrypted = await encryptResidentNumber(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(20);
  });

  it('암호화 후 복호화하면 원본과 일치한다', async () => {
    const original = '900101-1234567';
    const encrypted = await encryptResidentNumber(original);
    const decrypted = await decryptResidentNumber(encrypted);
    expect(decrypted).toBe(original);
  });
});
```

#### 3) 최소 구현
```typescript
// src/utils/encryptionUtils.ts
export async function encryptResidentNumber(residentNumber: string): Promise<string | null> {
  if (!residentNumber) return null;

  const cleaned = residentNumber.replace(/[^0-9]/g, '');
  if (cleaned.length !== 13) {
    throw new Error('Invalid resident registration number format');
  }

  return await encryptData(residentNumber);
}
```

#### 4) 테스트 실행
```bash
node scripts/test-resident-number-encryption.js
```

#### 5) 리팩토링
```typescript
// 개선된 버전 - 에러 처리, 로깅 추가
export async function encryptResidentNumber(residentNumber: string): Promise<string | null> {
  if (!residentNumber) return null;

  // 유효성 검증
  const validation = validateResidentNumber(residentNumber);
  if (!validation.isValid) {
    console.error('[Encryption] Invalid resident number:', validation.error);
    throw new Error(validation.error);
  }

  try {
    const encrypted = await encryptData(residentNumber);
    console.log('[Encryption] Resident number encrypted successfully');
    return encrypted;
  } catch (error) {
    console.error('[Encryption] Failed to encrypt resident number:', error);
    return null;
  }
}
```

---

## 워크플로우 예시

### 사용자 요청
> "회원가입 시 주민번호를 필수로 입력받고, 암호화해서 저장해줘"

### Step 1: Sequential Thinking

```
🧠 Sequential Thinking 시작

Thought 1/15: 요구사항 분석
- 주민번호는 개인정보보호법상 민감정보
- 암호화 필수
- 회원가입 폼에 입력 필드 추가 필요
nextThoughtNeeded: true

Thought 2/15: 기존 코드 확인
- users 테이블 스키마 확인 필요
- 이미 resident_registration_number 컬럼 있는지 확인
- 회원가입 폼 파일 위치 파악
nextThoughtNeeded: true

Thought 3/15: 데이터베이스 설계
- ALTER TABLE users ADD COLUMN resident_registration_number TEXT
- RLS 정책: 본인 + owner만 조회 가능
- 인덱스 추가 (검색용)
nextThoughtNeeded: true

... (계속)

Thought 15/15: 최종 검증
- 모든 단계 검토 완료
- 보안 검증 완료
- 성능 이슈 없음
- 구현 준비 완료
nextThoughtNeeded: false
```

### Step 2: 계획 수립

```
📋 TodoWrite 작성

[
  {
    "content": "기존 스키마 및 코드 확인",
    "status": "in_progress",
    "activeForm": "코드 확인 중"
  },
  {
    "content": "데이터베이스 Migration 작성",
    "status": "pending",
    "activeForm": "Migration 작성 중"
  },
  {
    "content": "암호화 유틸리티 테스트 작성",
    "status": "pending",
    "activeForm": "테스트 작성 중"
  },
  {
    "content": "암호화 유틸리티 구현",
    "status": "pending",
    "activeForm": "유틸리티 구현 중"
  },
  {
    "content": "회원가입 폼에 주민번호 필드 추가",
    "status": "pending",
    "activeForm": "폼 수정 중"
  },
  {
    "content": "validation 로직 구현",
    "status": "pending",
    "activeForm": "검증 로직 구현 중"
  },
  {
    "content": "통합 테스트 실행",
    "status": "pending",
    "activeForm": "통합 테스트 중"
  },
  {
    "content": "문서화",
    "status": "pending",
    "activeForm": "문서화 중"
  }
]
```

### Step 3: TDD 구현

#### 3-1. RED (테스트 작성)
```javascript
// scripts/test-resident-number.js
describe('주민번호 기능', () => {
  it('❌ 주민번호 없이 회원가입 시 에러', async () => {
    const result = await signup({ residentNumber: '' });
    expect(result.error).toBe('주민등록번호를 입력해주세요.');
  });

  it('❌ 12자리 주민번호는 거부', async () => {
    const result = await signup({ residentNumber: '900101123456' });
    expect(result.error).toContain('13자리');
  });

  it('✅ 13자리 주민번호는 통과', async () => {
    const result = await signup({ residentNumber: '900101-1234567' });
    expect(result.success).toBe(true);
  });

  it('✅ 데이터베이스에 암호화되어 저장', async () => {
    await signup({ residentNumber: '900101-1234567' });
    const { data } = await supabase.from('users').select('resident_registration_number').single();
    expect(data.resident_registration_number).not.toBe('900101-1234567');
    expect(data.resident_registration_number.length).toBeGreaterThan(20);
  });
});
```

#### 3-2. GREEN (최소 구현)
```typescript
// src/components/Auth/SignupForm.tsx
const validateForm = () => {
  // 주민번호 검증
  const residentValidation = validateResidentNumberWithMessage(formData.residentNumber);
  if (!residentValidation.isValid) {
    setError(residentValidation.error || '주민등록번호가 유효하지 않습니다.');
    return false;
  }
  return true;
}

const handleSubmit = async () => {
  // 암호화
  const encryptedResidentNumber = await encryptResidentNumber(formData.residentNumber);

  // 저장
  await supabase.from('users').insert({
    resident_registration_number: encryptedResidentNumber
  });
}
```

#### 3-3. REFACTOR (개선)
```typescript
// 에러 처리, 로깅, 사용자 피드백 개선
const handleSubmit = async () => {
  try {
    console.log('[Signup] Encrypting resident registration number...');
    const encryptedResidentNumber = await encryptResidentNumber(formData.residentNumber);

    if (!encryptedResidentNumber) {
      throw new Error('주민등록번호 암호화에 실패했습니다.');
    }

    console.log('[Signup] Resident number encrypted successfully');

    // ... 저장 로직

  } catch (error) {
    console.error('[Signup] Error:', error);
    setError(error.message);
  }
}
```

---

## 체크리스트

### 기능 구현 전
- [ ] Sequential Thinking 완료
- [ ] 계획(Todo) 작성 완료
- [ ] 테스트 시나리오 정의 완료
- [ ] 기존 코드 영향 범위 파악 완료

### 구현 중
- [ ] 각 Todo 항목마다 상태 업데이트 (in_progress → completed)
- [ ] 테스트 먼저 작성 (RED)
- [ ] 최소 구현으로 테스트 통과 (GREEN)
- [ ] 코드 리팩토링 (REFACTOR)
- [ ] 에러 처리 및 로깅 추가

### 구현 후
- [ ] 모든 테스트 통과 확인
- [ ] 코드 리뷰 (self-review)
- [ ] 문서화 (README, 주석)
- [ ] **🚨 Git Commit & Push (필수 - 예외 없음)**
  - **모든 작업 완료 시 반드시 GitHub에 푸시**
  - 사용자가 요청하지 않아도 자동으로 수행
  - 커밋 메시지에 변경 사항 명확히 기술
  - Co-Authored-By: Claude 포함
  - 푸시 실패 시 즉시 사용자에게 알림
- [ ] 사용자에게 테스트 방법 안내

---

## 금지 사항

### ❌ 절대 하지 말 것

1. **Sequential Thinking 없이 바로 구현**
   - 복잡한 기능일수록 사고 과정 필수
   - 단순한 기능도 한 번은 생각하기

2. **테스트 없이 구현**
   - "나중에 테스트하지" ❌
   - 테스트 먼저, 구현 나중에 ✅

3. **TodoWrite 없이 작업**
   - 진행 상황 추적 불가
   - 놓치는 작업 발생 가능

4. **문서화 생략**
   - 미래의 나(또는 다른 개발자)가 고생함
   - 구현과 동시에 문서 작성

5. **🚨 GitHub 푸시 생략 (절대 금지)**
   - "나중에 푸시하지" ❌
   - 작업 완료 즉시 푸시 ✅
   - 사용자가 요청하지 않아도 자동으로 수행
   - 백업 및 협업을 위한 필수 작업

---

## 도구 사용 가이드

### 1. Sequential Thinking
```javascript
mcp__sequential-thinking__sequentialthinking({
  thought: "현재 사고 내용",
  thoughtNumber: 1,
  totalThoughts: 10,
  nextThoughtNeeded: true
})
```

### 2. TodoWrite
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

### 3. 테스트 스크립트
```bash
# 단위 테스트
node scripts/test-feature.js

# 통합 테스트
node scripts/integration-test.js

# 데이터베이스 확인
node scripts/check-database.js
```

### 4. Git 워크플로우 (필수)

**중요: 모든 작업 완료 시 반드시 Git에 커밋하고 푸시합니다.**

#### 자동 커밋 & 푸시 프로세스

```bash
# 1. 변경사항 확인
git status
git diff --stat

# 2. 변경된 파일 staging
git add [파일들...]

# 3. 의미있는 커밋 메시지 작성
git commit -m "$(cat <<'EOF'
[type]: [간단한 제목]

[상세 설명]
- 변경사항 1
- 변경사항 2
- 변경사항 3

[보안/성능/테스트 관련 내용]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# 4. GitHub에 자동 푸시
git push origin [브랜치명]
```

#### 커밋 메시지 컨벤션

**타입 (Type):**
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링 (기능 변경 없음)
- `test`: 테스트 추가/수정
- `docs`: 문서 수정
- `chore`: 빌드, 설정 파일 수정
- `perf`: 성능 개선
- `security`: 보안 강화

**예시:**
```
fix: rememberMe 옵션에 따라 sessionStorage/localStorage 동적 선택

- customStorageAdapter: rememberMe 플래그에 따라 storage 동적 선택
- AuthContext: login/updateUser 함수에서 storage 동적 선택
- dataService: persistClinicId/getCachedClinicId storage 동적 선택

보안 개선:
- rememberMe=false 시 모든 세션 데이터가 sessionStorage에 저장
- 브라우저 닫으면 세션 자동 삭제 (공용 PC 보안 향상)

테스트:
- 로그인 시스템 전체 테스트 시나리오 작성
- rememberMe=false 검증 완료

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

#### Git 자동화 규칙

1. **작업 완료 즉시 커밋**
   - Todo 항목이 모두 completed 상태가 되면 즉시 커밋
   - 테스트 통과 확인 후 커밋

2. **커밋 단위**
   - 하나의 논리적 기능 단위로 커밋
   - 여러 기능을 구현했다면 기능별로 분리 커밋

3. **푸시 타이밍**
   - 커밋 후 즉시 푸시 (백업 목적)
   - 사용자에게 명시적으로 요청받지 않아도 자동 수행

4. **커밋 메시지 품질**
   - 제목: 50자 이내 (한글 25자 이내)
   - 본문: 상세한 변경 내용
   - 보안/성능/테스트 내용 별도 섹션으로 작성

### 5. MCP (Model Context Protocol) 적극 활용

**필요한 경우 MCP 도구를 적극적으로 활용합니다.**

#### 활용 가능한 MCP 도구

1. **mcp__context7** - 라이브러리 문서 조회
   ```javascript
   // 라이브러리 ID 검색
   mcp__context7__resolve-library-id({ libraryName: "react" })

   // 문서 가져오기
   mcp__context7__get-library-docs({
     context7CompatibleLibraryID: "/vercel/next.js",
     topic: "routing"
   })
   ```

2. **mcp__chrome-devtools** - 브라우저 자동화 및 디버깅
   ```javascript
   // 페이지 탐색
   mcp__chrome-devtools__navigate_page({ url: "http://localhost:3000" })

   // 스냅샷 찍기
   mcp__chrome-devtools__take_snapshot()

   // 콘솔 메시지 확인
   mcp__chrome-devtools__list_console_messages()
   ```

3. **mcp__gdrive** - Google Drive 파일 접근
   ```javascript
   // 파일 검색
   mcp__gdrive__gdrive_search({ query: "프로토콜" })

   // 파일 읽기
   mcp__gdrive__gdrive_read_file({ fileId: "..." })
   ```

4. **mcp__playwright** - 웹 테스팅 자동화
   ```javascript
   // 브라우저 제어
   mcp__playwright__browser_navigate({ url: "..." })

   // 스냅샷 및 스크린샷
   mcp__playwright__browser_snapshot()
   ```

5. **mcp__sequential-thinking** - 복잡한 문제 분석
   ```javascript
   mcp__sequential-thinking__sequentialthinking({
     thought: "현재 사고 단계",
     thoughtNumber: 1,
     totalThoughts: 10,
     nextThoughtNeeded: true
   })
   ```

#### MCP 활용 시나리오

**언제 사용하는가?**

1. **최신 라이브러리 문서 필요 시** → context7 사용
   - Next.js, React, Supabase 등의 최신 API 확인
   - 예: "Next.js 15의 새로운 라우팅 방식은?"

2. **브라우저 테스트 필요 시** → chrome-devtools 또는 playwright 사용
   - UI 버그 재현 및 디버깅
   - 프로덕션 환경 문제 조사
   - 예: "프로토콜 저장 시 콘솔 에러 확인"

3. **복잡한 문제 분석 시** → sequential-thinking 사용
   - 다단계 사고 프로세스 필요 시
   - 예: "무한 로딩 문제 원인 분석"

4. **외부 파일 접근 시** → gdrive 사용
   - 공유된 문서나 데이터 확인
   - 예: "요구사항 문서 확인"

#### MCP 활용 원칙

✅ **적극 활용해야 할 때:**
- 문제 해결에 도움이 될 것 같은 외부 도구가 있을 때
- 수동으로 하면 시간이 오래 걸리는 작업
- 브라우저 디버깅이 필요할 때
- 최신 라이브러리 문서 확인이 필요할 때

❌ **불필요한 경우:**
- 간단한 파일 읽기/쓰기 (Read, Write 도구 사용)
- 코드 내 간단한 검색 (Grep 사용)
- 기본 bash 명령 (Bash 도구 사용)

**예시:**
```
사용자: "프로토콜 저장 시 무한 로딩 문제가 발생해"

1. Sequential Thinking으로 원인 분석
2. Chrome DevTools로 브라우저 콘솔 확인
3. 코드 수정
4. 다시 Chrome DevTools로 테스트
5. 문제 해결 확인
```

---

## 예상 질문 (FAQ)

### Q: 간단한 수정도 Sequential Thinking 필요?
A: 예. 간단해 보여도 예상치 못한 영향이 있을 수 있습니다. 최소 3-5 단계 사고는 진행하세요.

### Q: 테스트 작성이 시간이 너무 오래 걸리는데?
A: 초기에는 시간이 걸리지만, 장기적으로 디버깅 시간을 크게 단축합니다. 투자 가치가 있습니다.

### Q: 기존 코드 수정 시에도 TDD 적용?
A: 예. 특히 리팩토링 시 테스트가 더욱 중요합니다. 기존 동작이 깨지지 않는지 확인할 수 있습니다.

### Q: Sequential Thinking이 너무 길어지면?
A: `totalThoughts`를 동적으로 조정하세요. 처음 예상보다 복잡하면 단계를 추가합니다.

---

## 성공 사례

### 사례 1: 주민번호 암호화 기능
- Sequential Thinking: 15 단계
- 계획: 8개 Todo 항목
- TDD: 6개 테스트 케이스
- 결과: 첫 시도에 모든 테스트 통과, 보안 이슈 0건

### 사례 2: 병원 진료시간 관리
- Sequential Thinking: 20 단계
- 계획: 12개 Todo 항목
- TDD: 8개 테스트 시나리오
- 결과: RLS 정책 누락 사전 발견, 수정 후 배포

---

## UI 컴포넌트 라이브러리 (shadcn/ui)

### 📦 shadcn/ui 사용 원칙

**새로운 기능 개발 또는 기존 UI 개선 시 shadcn/ui를 적극 활용합니다.**

#### 핵심 원칙

1. **점진적 적용 (Gradual Migration)**
   - 한 번에 하나씩 컴포넌트 적용
   - 전체 리팩토링 X, 필요한 부분만 개선
   - 기존 스타일링과 공존 가능

2. **우선 적용 대상**
   - 새로 만드는 기능의 UI
   - 버그 수정이나 개선이 필요한 기존 UI
   - 사용자 경험 개선이 필요한 컴포넌트

3. **기존 코드 보호**
   - 기존에 잘 작동하는 UI는 억지로 변경하지 않음
   - shadcn/ui 적용 시에도 기능은 동일하게 유지
   - 시각적 개선만 점진적으로 진행

#### shadcn/ui 설치 및 사용

```bash
# 컴포넌트 설치 (필요한 것만)
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add select
npx shadcn-ui@latest add table
# ... 등등
```

#### 사용 예시

**Before (기존 코드):**
```tsx
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  저장하기
</button>
```

**After (shadcn/ui 적용):**
```tsx
import { Button } from "@/components/ui/button"

<Button variant="default" size="default">
  저장하기
</Button>
```

#### 적용 체크리스트

- [ ] 새 기능 UI 개발 시 shadcn/ui 컴포넌트 우선 고려
- [ ] 필요한 컴포넌트만 설치 (불필요한 전체 설치 X)
- [ ] 기존 기능의 동작은 변경하지 않고 UI만 개선
- [ ] Tailwind CSS와 함께 사용하여 일관성 유지
- [ ] 접근성(a11y) 자동 적용 확인

#### 주요 컴포넌트

| 컴포넌트 | 용도 | 우선순위 |
|---------|------|---------|
| Button | 모든 버튼 | 높음 |
| Input | 텍스트 입력 | 높음 |
| Select | 드롭다운 | 높음 |
| Dialog | 모달 창 | 높음 |
| Table | 데이터 테이블 | 중간 |
| Card | 카드 레이아웃 | 중간 |
| Form | 폼 관리 | 중간 |
| Toast | 알림 메시지 | 낮음 |

#### 적용 전략

1. **Phase 1: 새 기능부터**
   - 앞으로 개발하는 모든 새 기능에 shadcn/ui 사용
   - 예: 새로운 관리 페이지, 새로운 폼 등

2. **Phase 2: 문제 있는 기존 UI**
   - 버그 수정 시 해당 컴포넌트를 shadcn/ui로 교체
   - 사용자 불만이 있는 UI 개선

3. **Phase 3: 점진적 개선**
   - 시간이 날 때마다 하나씩 교체
   - 우선순위: Button > Input > Select > Dialog

#### 금지 사항

❌ **절대 하지 말 것:**
- 한 번에 전체 UI 리팩토링 (기존 기능 위험)
- 잘 작동하는 UI를 억지로 변경
- shadcn/ui를 위한 불필요한 코드 변경

✅ **권장 사항:**
- 새 기능 개발 시 자연스럽게 적용
- 버그 수정 시 해당 컴포넌트만 개선
- 한 번에 하나씩 점진적으로 마이그레이션

---

## 마무리

이 방법론을 따르면:
- ✅ 버그 감소
- ✅ 코드 품질 향상
- ✅ 유지보수 용이
- ✅ 협업 효율 증가
- ✅ 문서화 자동화
- ✅ UI 일관성 및 접근성 향상

**모든 기능 구현은 이 문서를 기준으로 진행합니다.**

---

## 변경 이력

### 2025-11-04
- 🎨 **shadcn/ui 사용 가이드 추가**
  - 점진적 적용 원칙 정의
  - 한 번에 하나씩 컴포넌트 교체
  - 새 기능 개발 시 우선 적용
  - 기존 코드 보호하면서 UI 개선

### 2025-11-03
- 🛡️ **기존 기능 보호 원칙 추가 (최우선 원칙)**
  - 최소 침습 원칙, 영향 범위 분석, 하위 호환성 유지
- 🚨 **GitHub 푸시 필수화 강조**
  - 체크리스트에 "예외 없음" 명시
  - 금지 사항에 "푸시 생략 절대 금지" 추가
- 🔧 **MCP (Model Context Protocol) 적극 활용 가이드 추가**
  - context7, chrome-devtools, gdrive, playwright 등
  - 활용 시나리오 및 원칙 정의

### 2025-10-31
- Git 워크플로우 자동화 규칙 추가
- 작업 완료 시 자동 커밋 & 푸시 의무화
- 커밋 메시지 컨벤션 정의
- Co-Authored-By: Claude 포함 규칙

### 2025-10-31 (초기 작성)
- Sequential Thinking 방법론 정의
- TDD 프로세스 정의
- TodoWrite 활용 가이드

---

마지막 업데이트: 2025-11-04
