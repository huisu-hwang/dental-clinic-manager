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

### 🔄 세션 관리 원칙 (필수)

**새로운 작업 시작 전 반드시 준수:**

1. **/compact 명령어 실행 (최우선)**
   - 새로운 작업을 시작할 때마다 **반드시** `/compact` 명령어를 먼저 실행
   - 이전 대화 내용을 압축하여 컨텍스트 관리
   - 토큰 사용량 최적화 및 성능 향상
   - 대화 히스토리 정리로 집중력 향상

**실행 시점:**
- 사용자가 새로운 기능 구현을 요청할 때
- 새로운 버그 수정을 시작할 때
- 이전 작업과 무관한 새로운 작업을 시작할 때
- 대화가 길어져서 컨텍스트가 복잡해졌을 때

**예시:**
```
사용자: "새로운 기능을 추가해줘"

Claude:
1. /compact 명령어 실행 (컨텍스트 압축)
2. Sequential Thinking 시작
3. 계획 수립
4. 구현 진행
```

---

### 🔍 근본 원인 해결 원칙 (Root Cause Analysis)

**문제 해결 시 반드시 준수:**

1. **증상이 아닌 원인 해결**
   - 표면적인 문제만 해결하는 임시 방편 금지
   - 문제의 근본 원인을 파악하여 완전히 해결
   - "왜 이 문제가 발생했는가?"를 5번 물어보기 (5 Whys)

2. **재발 방지**
   - 같은 문제가 다시 발생하지 않도록 시스템적 해결
   - 유사한 문제가 다른 곳에서도 발생할 수 있는지 확인
   - 예방적 조치 포함

3. **임시 방편 vs 근본 해결 구분**
   - 임시 방편: 빠르게 증상만 가리는 해결책 (Technical Debt 증가)
   - 근본 해결: 문제의 원인을 제거하는 해결책 (장기적 안정성)

4. **문제 패턴 인식**
   - 반복되는 버그나 이슈는 근본적인 구조 문제
   - 같은 유형의 문제가 여러 곳에서 발생하면 공통 원인 파악
   - 구조적 개선 필요 신호로 인식

5. **Sequential Thinking에 근본 원인 분석 포함**
   - "왜 이 문제가 발생했는가?" 단계 필수
   - "이 해결책이 재발을 방지하는가?" 검증
   - "유사한 문제가 다른 곳에도 있는가?" 확인

**예시:**

```
❌ 임시 방편 (나쁜 예):
문제: "세션 만료 시 무한 로딩"
임시 해결: "로딩 타임아웃 10초로 설정"
→ 문제: 근본 원인 미해결, 10초 후에도 같은 문제

문제: "특정 페이지에서 데이터 안 보임"
임시 해결: "해당 페이지에만 새로고침 버튼 추가"
→ 문제: 다른 페이지에서도 같은 문제 발생 가능

✅ 근본 해결 (좋은 예):
문제: "세션 만료 시 무한 로딩"
근본 원인: "세션 갱신 로직에서 무한 재귀 발생"
근본 해결:
  1. 세션 갱신 타임아웃 추가
  2. 재귀 깊이 제한 설정
  3. 세션 만료 시 자동 로그아웃
  4. 모든 페이지에서 동일하게 적용
→ 결과: 문제 완전 해결, 재발 방지

문제: "특정 페이지에서 데이터 안 보임"
근본 원인: "데이터 페칭 시 clinic_id가 누락됨"
근본 해결:
  1. 모든 데이터 페칭 함수에 clinic_id 검증 추가
  2. clinic_id 없을 시 자동으로 현재 클리닉 ID 가져오기
  3. 공통 유틸리티 함수로 표준화
  4. 모든 페이지에 적용
→ 결과: 모든 페이지에서 안정적으로 작동
```

**근본 원인 분석 절차:**

1. **문제 재현**
   - 문제를 정확히 재현할 수 있는 시나리오 작성
   - 어떤 조건에서 문제가 발생하는지 파악

2. **로그 및 에러 분석**
   - 콘솔 에러, 네트워크 요청, 상태 변화 추적
   - Chrome DevTools, Sequential Thinking 활용

3. **5 Whys 기법**
   - "왜?"를 5번 반복해서 근본 원인 도달
   - 예:
     - Q: 왜 무한 로딩이 발생하는가? → A: 데이터를 못 가져온다
     - Q: 왜 데이터를 못 가져오는가? → A: API 요청이 실패한다
     - Q: 왜 API 요청이 실패하는가? → A: 세션이 만료되었다
     - Q: 왜 세션 갱신이 안 되는가? → A: 세션 갱신 로직에 버그
     - Q: 왜 세션 갱신 로직에 버그가 있는가? → A: 재귀 호출 시 타임아웃 없음

4. **해결책 설계**
   - 근본 원인을 제거하는 해결책 설계
   - 재발 방지 메커니즘 포함
   - 유사한 문제 예방책 포함

5. **검증 및 테스트**
   - 해결책이 근본 원인을 제거했는지 확인
   - 다양한 시나리오에서 테스트
   - 부작용 없는지 확인

**지표:**
- ✅ 같은 문제가 재발하지 않음
- ✅ 유사한 문제가 다른 곳에서도 발생하지 않음
- ✅ 코드가 더 견고하고 예측 가능해짐
- ✅ Technical Debt 감소
- ❌ 같은 문제가 반복됨 → 근본 해결 실패

---

### 📋 개발 순서

모든 기능 구현은 다음 순서를 **반드시** 따릅니다:

#### 일반 기능 개발:
1. **/compact 실행** - 세션 초기화 및 컨텍스트 정리 (새 작업 시작 시)
2. **🤖 Subagent 자동 선택** - 작업 유형에 맞는 전문 subagent 활용
3. **Sequential Thinking (ultrathink)** - 문제 분석 및 설계
4. **계획 수립 (Planning)** - 구현 단계 정의
5. **TDD (Test-Driven Development)** - 테스트 주도 개발

#### 버그 수정 (추가 단계 필수):
1. **/compact 실행** - 세션 초기화 및 컨텍스트 정리
2. **🤖 Subagent 자동 선택** - `/bug-fix` 모드 활성화
3. **🌐 Chrome DevTools MCP로 오류 재현 및 로그 확인 (필수!)** ← 신규 추가!
   - localhost 개발 서버 접속
   - 사용자가 보고한 작업 시나리오 재현
   - 콘솔 에러 메시지 정확히 확인
   - 네트워크 요청 실패 원인 파악
   - 타이밍, connection error 등 측정
4. **🔍 근본 원인 분석 (5 Whys + 콘솔 로그 기반)** - Chrome DevTools 로그 기반 분석
5. **Sequential Thinking (ultrathink)** - 해결 방안 설계
6. **계획 수립 (Planning)** - 구현 단계 정의
7. **코드 수정** - 근본 원인 제거
8. **🌐 Chrome DevTools MCP로 수정 검증 (필수!)** ← 신규 추가!
   - 동일 시나리오 재현
   - 콘솔 로그 확인 (예상한 로그 출력되는지)
   - 타이밍 측정 (개선 효과 확인)
   - 최종 정상 작동 확인
9. **TDD (Test-Driven Development)** - 재발 방지 테스트 작성

---

### 🤖 Subagent 자동 활용 원칙

**작업 시작 시 항상 적절한 subagent를 자동으로 선택하여 사용합니다.**

#### 작업 유형별 Subagent 매칭

| 작업 유형 | Subagent | 사용 시점 |
|----------|----------|-----------|
| **버그 수정** | `/bug-fix` | 버그 발생, 오류 재현, 긴급 핫픽스 |
| **새 기능 개발** | `/feature-dev` | 신규 기능 추가, 기존 기능 확장 |
| **DB 스키마 변경** | `/db-schema` | 테이블 추가/수정, RLS 정책, 인덱스 |
| **보안 이슈** | `/security-check` | 민감정보 처리, 취약점 검사 |
| **UI 개선** | `/ui-enhance` | shadcn/ui 적용, 반응형 디자인 |
| **배포 문제** | `/deploy-fix` | 빌드 실패, 환경변수, Vercel 문제 |
| **데이터 마이그레이션** | `/data-migration` | 스키마 변경 시 데이터 이전, 암호화 |
| **성능 최적화** | `/performance` | 로딩 속도, 쿼리 최적화, 번들 크기 |
| **API 개발** | `/api-design` | 새 엔드포인트, API 구조 설계 |
| **코드 리뷰** | `/code-review` | PR 리뷰, 리팩토링, 품질 검토 |
| **테스트 작성** | `/test-automation` | 단위/통합/E2E 테스트 |
| **문서 작성** | `/documentation` | API 문서, README, 가이드 |

#### Subagent 활용 예시

**예시 1: 버그 수정 작업**
```
사용자: "로그인 후 2-3분 지나면 프로토콜 탭이 무한 로딩돼요"

Claude:
1. /compact (컨텍스트 정리)
2. /bug-fix (버그 수정 모드 자동 활성화)
3. 🌐 Chrome DevTools MCP로 오류 재현 (필수!)
   - 개발 서버 접속 및 로그인
   - 프로토콜 탭 클릭 시나리오 재현
   - 콘솔 에러 메시지 확인
   - 네트워크 요청 타임아웃 측정
4. 🔍 근본 원인 분석 (5 Whys + 콘솔 로그 기반)
   - Sequential Thinking으로 심층 분석
5. 계획 수립 (TodoWrite)
6. 코드 수정 (로그 기반 원인에 대한 수정)
7. 🌐 Chrome DevTools MCP로 수정 검증 (필수!)
   - 동일 시나리오 재현
   - 콘솔 로그 확인 (에러 없어야 함)
   - 타이밍 측정 (3분 이상 대기 후에도 정상 동작)
8. Git commit & push
```

**예시 2: 새 기능 개발**
```
사용자: "직원 평가 기능을 추가해줘"

Claude:
1. /compact
2. /feature-dev (기능 개발 모드 자동 활성화)
3. Sequential Thinking (요구사항 분석)
4. /db-schema (DB 스키마 설계가 필요한 경우)
5. 계획 수립 (TodoWrite)
6. TDD로 구현
7. Git commit & push
```

**예시 3: UI 개선 + 성능 최적화**
```
사용자: "계약서 목록을 shadcn/ui로 바꾸고 성능도 개선해줘"

Claude:
1. /compact
2. /ui-enhance (UI 개선 모드)
3. shadcn/ui Table 적용
4. /performance (성능 최적화 모드)
5. 번들 크기 최적화
6. 테스트
7. Git commit & push
```

**예시 4: 복합 작업 (DB + 보안 + 마이그레이션)**
```
사용자: "주민번호를 암호화해서 저장해야 해요"

Claude:
1. /compact
2. /security-check (보안 검사)
3. /db-schema (스키마 변경)
4. /data-migration (기존 데이터 마이그레이션)
5. 암호화 구현
6. 마이그레이션 스크립트 작성
7. 테스트 및 검증
8. Git commit & push
```

#### 자동 선택 규칙

1. **단일 작업**: 해당하는 subagent 1개 사용
2. **복합 작업**: 필요한 subagent를 순차적으로 사용
3. **명시적 요청**: 사용자가 특정 subagent를 요청하면 그것을 우선 사용
4. **기본값**: 작업 유형이 불명확한 경우 `/feature-dev` 사용

#### 주의사항

- ✅ **모든 작업은 적절한 subagent를 통해 수행**
- ✅ **Subagent 사용 내역을 사용자에게 명시적으로 안내**
- ✅ **여러 subagent가 필요한 경우 순서대로 사용**
- ❌ **Subagent 없이 직접 작업하지 않음** (간단한 질문 제외)

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
- [ ] **📝 작업 로그 업데이트 (필수 - 예외 없음)**
  - **모든 작업 완료 시 WORK_LOG.md에 작업 내용 기록**
  - 문제, 원인, 해결 방법, 결과, 참고 사항 포함
  - 이후 유사 작업 시 참고 자료로 활용
  - 날짜, 카테고리, 키워드로 검색 가능하게 작성
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

1. **임시 방편으로 문제 해결 (절대 금지)**
   - 증상만 가리는 해결책 금지
   - 근본 원인을 찾아서 완전히 해결 ✅
   - "일단 이렇게 하면 되지" ❌ → "왜 이 문제가 발생했는가?" ✅
   - 5 Whys 기법 적용 필수

2. **Sequential Thinking 없이 바로 구현**
   - 복잡한 기능일수록 사고 과정 필수
   - 단순한 기능도 한 번은 생각하기

3. **테스트 없이 구현**
   - "나중에 테스트하지" ❌
   - 테스트 먼저, 구현 나중에 ✅

4. **TodoWrite 없이 작업**
   - 진행 상황 추적 불가
   - 놓치는 작업 발생 가능

5. **문서화 생략**
   - 미래의 나(또는 다른 개발자)가 고생함
   - 구현과 동시에 문서 작성

6. **작업 로그 업데이트 생략 (절대 금지)**
   - 작업 완료 시 WORK_LOG.md 업데이트 필수
   - 지식 축적 및 이후 참고 자료 확보
   - "나중에 정리하지" ❌ → "작업 직후 즉시 기록" ✅

7. **🚨 GitHub 푸시 생략 (절대 금지)**
   - "나중에 푸시하지" ❌
   - 작업 완료 즉시 푸시 ✅
   - 사용자가 요청하지 않아도 자동으로 수행
   - 백업 및 협업을 위한 필수 작업

8. **🌐 버그 수정 시 Chrome DevTools MCP 생략 (절대 금지)**
   - "추측으로 고쳐보지" ❌
   - 반드시 Chrome DevTools MCP로 콘솔 로그 확인 후 수정 ✅
   - 오류 재현 단계 필수 (수정 전)
   - 수정 검증 단계 필수 (수정 후)
   - 로그 없이 코드 수정하면 재발 위험 높음

---

## 작업 문서화 가이드

### 📝 작업 로그 작성 원칙

**모든 작업 완료 시 반드시 WORK_LOG.md에 기록합니다.**

#### 작업 로그 포맷

```markdown
## [날짜] [카테고리] [작업 제목]

**키워드:** #키워드1 #키워드2 #키워드3

### 📋 작업 내용
- 무엇을 했는가?
- 어떤 기능을 추가/수정했는가?

### 🐛 문제 상황 (버그 수정 시)
- 어떤 문제가 발생했는가?
- 재현 조건은?
- 에러 메시지나 증상은?

### 🔍 근본 원인 (버그 수정 시)
- 5 Whys 기법으로 파악한 근본 원인
- 왜 이 문제가 발생했는가?

### ✅ 해결 방법
- 어떻게 해결했는가?
- 변경한 파일 및 주요 코드
- 적용한 기술/패턴

### 🧪 테스트 결과
- 어떻게 테스트했는가?
- 테스트 결과는?

### 📊 결과 및 영향
- 문제가 해결되었는가?
- 성능이나 UX가 개선되었는가?
- 다른 기능에 영향은 없는가?

### 💡 배운 점 / 참고 사항
- 이 작업에서 배운 점
- 이후 유사 작업 시 참고할 사항
- 주의해야 할 점

### 📎 관련 링크
- 커밋: [커밋 해시](GitHub 링크)
- 관련 이슈: (있다면)
- 참고 문서: (있다면)

---
```

#### 카테고리 분류

| 카테고리 | 설명 | 예시 |
|---------|------|------|
| `[버그 수정]` | 버그 및 오류 수정 | 무한 로딩 문제 해결 |
| `[기능 개발]` | 새로운 기능 추가 | 직원 평가 기능 추가 |
| `[리팩토링]` | 코드 개선 (기능 변경 없음) | 공통 함수 추출 |
| `[성능 개선]` | 성능 최적화 | 쿼리 최적화, 번들 크기 감소 |
| `[보안 강화]` | 보안 취약점 개선 | XSS 방지, 암호화 추가 |
| `[UI/UX 개선]` | 사용자 경험 개선 | shadcn/ui 적용 |
| `[DB 스키마]` | 데이터베이스 구조 변경 | 테이블 추가, RLS 정책 |
| `[배포/인프라]` | 빌드, 배포 관련 | Vercel 설정 변경 |
| `[문서화]` | 문서 작성/수정 | README 업데이트 |
| `[테스트]` | 테스트 작성/개선 | E2E 테스트 추가 |

#### 키워드 가이드

검색을 위해 관련 키워드를 반드시 추가:

- 기술: `#react` `#supabase` `#nextjs` `#typescript`
- 기능: `#로그인` `#세션` `#프로토콜` `#근로계약서`
- 문제: `#무한로딩` `#세션만료` `#데이터누락` `#권한오류`
- 해결: `#근본원인` `#RCA` `#타임아웃` `#에러핸들링`

#### 작업 로그 작성 시점

1. **작업 완료 즉시** - 기억이 생생할 때 작성
2. **Git Commit 전** - 커밋 메시지와 일관성 유지
3. **자동화** - 모든 작업 완료 시 자동으로 수행

#### 예시: 실제 작업 로그

```markdown
## 2025-11-06 [버그 수정] 세션 만료 시 무한 로딩 문제 해결

**키워드:** #세션만료 #무한로딩 #근본원인 #RCA #타임아웃 #재귀

### 📋 작업 내용
- 로그인 후 2-3분 지나면 프로토콜/근로계약서 탭에서 무한 로딩 발생 문제 해결
- 세션 갱신 로직의 근본적인 문제 파악 및 수정

### 🐛 문제 상황
- 로그인 후 2-3분이 지나면 프로토콜 탭과 근로계약서 탭이 무한 로딩
- 새로고침하면 임시로 해결되지만 다시 발생
- 콘솔에 "Maximum call stack size exceeded" 에러

### 🔍 근본 원인 (5 Whys)
1. Q: 왜 무한 로딩이 발생하는가? → A: 데이터를 못 가져온다
2. Q: 왜 데이터를 못 가져오는가? → A: API 요청이 실패한다
3. Q: 왜 API 요청이 실패하는가? → A: 세션이 만료되었다
4. Q: 왜 세션 갱신이 안 되는가? → A: 세션 갱신 로직에 무한 재귀
5. Q: 왜 무한 재귀가 발생하는가? → A: 타임아웃 없이 재귀 호출

**근본 원인:** `supabase.auth.refreshSession()` 호출 시 타임아웃 설정 없어 무한 재귀 발생

### ✅ 해결 방법

**변경 파일:**
- `src/lib/supabase/client.ts` - 세션 갱신 타임아웃 추가

**주요 변경 사항:**
```typescript
// Before (문제 코드)
const { data, error } = await supabase.auth.refreshSession();

// After (수정 코드)
const refreshPromise = supabase.auth.refreshSession();
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Session refresh timeout')), 5000)
);
const { data, error } = await Promise.race([refreshPromise, timeoutPromise]);
```

**적용 기술:**
- Promise.race를 사용한 타임아웃 처리
- 5초 타임아웃 설정
- 타임아웃 시 자동 로그아웃

### 🧪 테스트 결과
- Chrome DevTools로 세션 만료 시뮬레이션
- 2-3분 후 프로토콜 탭 접근 → 정상 작동 또는 자동 로그아웃
- 근로계약서 탭 접근 → 정상 작동
- 더 이상 무한 로딩 발생하지 않음

### 📊 결과 및 영향
- ✅ 무한 로딩 문제 완전 해결
- ✅ 세션 만료 시 자동 로그아웃으로 UX 개선
- ✅ 모든 페이지에서 안정적으로 작동
- ✅ 재발 가능성 제거

### 💡 배운 점 / 참고 사항
- **교훈:** 비동기 작업은 반드시 타임아웃 설정 필요
- **주의:** Promise.race 사용 시 reject 핸들러 필수
- **패턴:** 세션 관련 문제는 항상 타임아웃 고려
- **이후 작업:** 다른 비동기 함수에도 타임아웃 적용 검토

### 📎 관련 링크
- 커밋: [a9bdf22](https://github.com/huisu-hwang/dental-clinic-manager/commit/a9bdf22)
- 관련 원칙: CLAUDE.md - 근본 원인 해결 원칙

---
```

#### 작업 로그 활용 방법

1. **검색:** Ctrl+F로 키워드 검색
   ```
   #세션만료 → 세션 관련 모든 작업 찾기
   #근본원인 → 근본 원인 분석한 작업 찾기
   ```

2. **패턴 학습:** 유사한 문제 해결 방법 참고
   ```
   비슷한 무한 로딩 문제 발생 시 → 이전 해결 방법 참고
   ```

3. **지식 공유:** 팀원에게 작업 방법 공유
   ```
   "WORK_LOG.md에서 2025-11-06 세션 문제 해결 참고하세요"
   ```

4. **회고:** 주기적으로 작업 로그 리뷰하여 개선점 도출

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

### 6. Chrome DevTools MCP 활용 (버그 수정 필수)

**버그 수정 시 Chrome DevTools MCP 사용은 필수입니다.**

#### 🎯 사용 시점

**1. 오류 재현 및 분석 (필수)**
- 사용자가 보고한 오류를 직접 재현
- 콘솔 에러 메시지 정확히 확인
- 네트워크 요청 실패 원인 파악
- 타임아웃, connection error 등 정확한 시간 측정

**2. 수정 후 검증 (필수)**
- 코드 수정 후 실제로 문제가 해결되었는지 확인
- 콘솔에 예상한 로그가 출력되는지 확인
- 성능 개선 효과 측정 (타임아웃 시간 등)

#### 🛠️ 주요 도구

```typescript
// 페이지 이동
mcp__chrome-devtools__navigate_page({ url: 'http://localhost:3000/dashboard' })

// 페이지 스냅샷 (UI 상태 확인)
mcp__chrome-devtools__take_snapshot()

// 콘솔 메시지 조회 (에러만)
mcp__chrome-devtools__list_console_messages({ types: ['error'] })

// 특정 콘솔 메시지 상세
mcp__chrome-devtools__get_console_message({ msgid: 123 })

// 네트워크 요청 목록
mcp__chrome-devtools__list_network_requests()

// 특정 네트워크 요청 상세
mcp__chrome-devtools__get_network_request({ reqid: 456 })

// 버튼 클릭
mcp__chrome-devtools__click({ uid: 'save-button' })

// 입력 필드 채우기
mcp__chrome-devtools__fill({ uid: 'email-input', value: 'test@example.com' })

// 특정 텍스트가 나타날 때까지 대기
mcp__chrome-devtools__wait_for({ text: '저장 완료', timeout: 5000 })
```

#### 📝 버그 수정 워크플로우

**Step 1: 오류 재현 및 로그 확인**

```typescript
// 1. 개발 서버 확인 (localhost:3000)
// 2. 페이지 이동
await mcp__chrome-devtools__navigate_page({
  url: 'http://localhost:3000/dashboard'
})

// 3. 로그인 (필요 시)
await mcp__chrome-devtools__fill({
  uid: 'email-input',
  value: 'test@example.com'
})
await mcp__chrome-devtools__click({ uid: 'login-button' })

// 4. 사용자가 보고한 시나리오 재현
// 예: 4분 대기 (connection timeout)
await new Promise(resolve => setTimeout(resolve, 240000))

// 5. 문제 행동 유발
await mcp__chrome-devtools__click({ uid: 'save-button' })

// 6. 콘솔 에러 확인
const errors = await mcp__chrome-devtools__list_console_messages({
  types: ['error']
})
// 결과: "저장 요청 시간이 초과되었습니다" 확인

// 7. 네트워크 요청 확인
const requests = await mcp__chrome-devtools__list_network_requests()
// 결과: 30초 타임아웃 확인

// 8. 정확한 타이밍 및 에러 메시지 기록
```

**Step 2: 근본 원인 분석 (5 Whys + 로그 기반)**

Chrome DevTools에서 수집한 정보 기반으로:
- **Why 1:** 왜 이 에러가 발생하는가? → 콘솔 에러 메시지 분석
- **Why 2:** 왜 이 요청이 실패하는가? → 네트워크 요청 상태 코드 확인
- **Why 3:** 왜 이 타이밍에 발생하는가? → 타임아웃 시간 측정 (정확히 30초)
- **Why 4:** 왜 재시도가 안 되는가? → 콘솔 로그 순서 분석
- **Why 5:** 근본 원인은? → 코드 + 로그 조합으로 파악

**Step 3: 코드 수정**

근본 원인에 기반한 수정 진행

**Step 4: 수정 검증 (Chrome DevTools MCP로)**

```typescript
// 1. 코드 수정 후 개발 서버 재시작 확인

// 2. 동일한 시나리오 재현
await mcp__chrome-devtools__navigate_page({
  url: 'http://localhost:3000/dashboard'
})

// 3. 4분 대기 후 저장
await new Promise(resolve => setTimeout(resolve, 240000))
await mcp__chrome-devtools__click({ uid: 'save-button' })

// 4. 콘솔 로그 확인 (예상한 로그가 나오는지)
const messages = await mcp__chrome-devtools__list_console_messages()
// 예상: "[handleSessionError] Connection timeout detected"
// 예상: "[handleSessionError] Client reinitialized successfully"

// 5. 에러가 없는지 확인
const errors = await mcp__chrome-devtools__list_console_messages({
  types: ['error']
})
// 예상: 30초 타임아웃 에러 없음 ✅

// 6. 성공 메시지 확인
const snapshot = await mcp__chrome-devtools__take_snapshot()
// "저장되었습니다" 등의 성공 메시지 확인

// 7. 타이밍 측정
// 30초 → 6~9초로 개선되었는지 확인
```

#### ⚠️ 주의사항

**필수:**
- ✅ 버그 수정 시 **반드시** Chrome DevTools MCP로 재현 및 검증
- ✅ 콘솔 로그, 네트워크 요청을 **정확히** 기록
- ✅ 수정 전/후 비교 (타이밍, 에러 발생 여부)
- ✅ WORK_LOG.md에 Chrome DevTools 검증 결과 기록

**금지:**
- ❌ Chrome DevTools 없이 추측만으로 수정
- ❌ 콘솔 로그 확인 없이 "아마 이것 때문일 거야" 식 접근
- ❌ 수정 후 검증 없이 커밋
- ❌ "로컬에서는 잘 되는데..." 식 변명

#### 💡 FAQ

**Q: 간단한 버그도 Chrome DevTools 필요?**
A: 예. 간단해 보여도 실제 로그를 확인하면 예상과 다른 경우가 많습니다. 추측은 금물입니다.

**Q: 로컬 서버가 없으면?**
A: 개발 서버를 먼저 실행하거나, 프로덕션 환경에서 확인하세요. 버그 수정에는 실제 환경 확인이 필수입니다.

**Q: Chrome DevTools MCP가 느리면?**
A: 초기 설정은 시간이 걸리지만, 정확한 디버깅으로 장기적으로 시간 절약됩니다. 추측으로 여러 번 시도하는 것보다 빠릅니다.

**Q: 사용자 환경을 재현할 수 없으면?**
A: 최대한 비슷한 환경을 만들어 재현하세요. 브라우저 종류, 네트워크 속도 등을 고려합니다.

#### 📊 효과

- ✅ **정확한 오류 분석**: 추측이 아닌 실제 로그 기반
- ✅ **근본 원인 파악 향상**: 콘솔 + 네트워크 정보로 5 Whys 정확도 증가
- ✅ **수정 검증 자동화**: 수정 후 즉시 Chrome DevTools로 확인
- ✅ **재발 방지**: 정확한 로그 기반 수정으로 임시 방편 방지
- ✅ **작업 시간 단축**: 추측으로 여러 번 시도하는 대신 한 번에 정확히

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

### 2025-11-06 (3차 업데이트)
- 📝 **작업 문서화 가이드 추가**
  - 모든 작업 완료 시 WORK_LOG.md 업데이트 의무화
  - 작업 로그 포맷 및 카테고리 정의
  - 키워드 시스템으로 검색 가능하게 구조화
  - 문제/원인/해결/결과/배운점 체계적 기록
  - 지식 축적 및 이후 작업 참고 자료 확보

### 2025-11-06 (2차 업데이트)
- 🔍 **근본 원인 해결 원칙 추가 (Root Cause Analysis)**
  - 임시 방편이 아닌 근본 원인 해결 의무화
  - 5 Whys 기법으로 문제의 근본 원인 파악
  - 재발 방지 및 시스템적 해결책 제시
  - 개발 순서에 근본 원인 분석 단계 추가
  - 금지 사항 1순위로 "임시 방편 금지" 명시

### 2025-11-06 (1차 업데이트)
- 🔄 **세션 관리 원칙 추가**
  - 새로운 작업 시작 전 `/compact` 명령어 실행 의무화
  - 컨텍스트 관리 및 토큰 사용량 최적화
  - 개발 순서에 `/compact` 실행 단계 추가

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

마지막 업데이트: 2025-11-06 (작업 문서화 가이드 추가)
