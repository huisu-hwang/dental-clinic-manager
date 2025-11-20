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
