# 로그인 시스템 테스트 시나리오

## 테스트 목적
- 로그인 기능이 올바르게 동작하는지 확인
- rememberMe 옵션이 의도대로 동작하는지 확인
- 에러 처리가 적절한지 확인

---

## 테스트 시나리오

### 시나리오 1: 일반 로그인 (rememberMe = false)
**목적**: 기본 로그인 동작 확인

**테스트 단계**:
1. 로그인 페이지 접속
2. email: `test@example.com` 입력
3. password: `test1234` 입력
4. rememberMe 체크박스: **해제 상태**
5. "로그인" 버튼 클릭

**예상 결과**:
- ✅ 로그인 성공
- ✅ 대시보드 페이지로 리디렉션
- ✅ localStorage에 `dental_auth: "true"` 저장
- ✅ localStorage에 `dental_user: {...}` 저장
- ✅ localStorage에 `dental_remember_me` **없음**
- ❓ **문제**: rememberMe = false여도 localStorage 사용됨
  - 브라우저 닫아도 세션 유지됨

**실제 확인 방법**:
```javascript
// 브라우저 콘솔에서 실행
console.log('dental_auth:', localStorage.getItem('dental_auth'))
console.log('dental_user:', localStorage.getItem('dental_user'))
console.log('dental_remember_me:', localStorage.getItem('dental_remember_me'))
console.log('Supabase session:', Object.keys(localStorage).filter(k => k.startsWith('sb-')))
```

---

### 시나리오 2: 로그인 상태 유지 (rememberMe = true)
**목적**: 로그인 상태 유지 기능 확인

**테스트 단계**:
1. 로그인 페이지 접속
2. email: `test@example.com` 입력
3. password: `test1234` 입력
4. rememberMe 체크박스: **선택**
5. "로그인" 버튼 클릭

**예상 결과**:
- ✅ 로그인 성공
- ✅ 대시보드 페이지로 리디렉션
- ✅ localStorage에 `dental_auth: "true"` 저장
- ✅ localStorage에 `dental_user: {...}` 저장
- ✅ localStorage에 `dental_remember_me: "true"` 저장
- ✅ 브라우저 닫아도 세션 유지

**실제 확인 방법**:
```javascript
console.log('dental_remember_me:', localStorage.getItem('dental_remember_me')) // "true"
```

---

### 시나리오 3: 마스터 계정 로그인
**목적**: 마스터 계정 특별 처리 확인

**테스트 단계**:
1. 로그인 페이지 접속
2. email: `sani81@gmail.com` 입력
3. password: `[실제 비밀번호]` 입력
4. "로그인" 버튼 클릭

**예상 결과**:
- ✅ 로그인 성공
- ✅ 프로필 조회 없이 마스터 프로필 사용
- ✅ `role: "master"` 설정
- ✅ `clinic_id: null`

**확인 방법**:
```javascript
const user = JSON.parse(localStorage.getItem('dental_user'))
console.log('Role:', user.role) // "master"
console.log('Clinic ID:', user.clinic_id) // null
```

---

### 시나리오 4: 잘못된 비밀번호
**목적**: 에러 처리 확인

**테스트 단계**:
1. 로그인 페이지 접속
2. email: `test@example.com` 입력
3. password: `wrongpassword` 입력
4. "로그인" 버튼 클릭

**예상 결과**:
- ❌ 로그인 실패
- ✅ 에러 메시지: "아이디 또는 비밀번호가 올바르지 않습니다."
- ✅ 로그인 폼에 남아있음
- ✅ localStorage에 세션 저장 안됨

---

### 시나리오 5: 빈 필드 검증
**목적**: 입력 검증 확인

**테스트 단계 5-1**: 빈 이메일
1. email: `` (빈 값)
2. password: `test1234`
3. "로그인" 버튼 클릭

**예상 결과**:
- ❌ 로그인 실패
- ✅ 에러 메시지: "이메일 주소를 입력해주세요."

**테스트 단계 5-2**: 빈 비밀번호
1. email: `test@example.com`
2. password: `` (빈 값)
3. "로그인" 버튼 클릭

**예상 결과**:
- ❌ 로그인 실패
- ✅ 에러 메시지: "비밀번호를 입력해주세요."

---

### 시나리오 6: 타임아웃 처리 (시뮬레이션 필요)
**목적**: 네트워크 지연 시 타임아웃 확인

**테스트 방법**:
- Chrome DevTools > Network > Throttling: "Slow 3G" 선택
- 또는 네트워크 차단

**예상 결과**:
- ⏱️ 60초 후 타임아웃
- ✅ 에러 메시지: "로그인 시간이 초과되었습니다 (60초)..."

---

### 시나리오 7: 로그아웃 후 재로그인
**목적**: 세션 클리어 확인

**테스트 단계**:
1. 로그인 (rememberMe = true)
2. 대시보드 접속 확인
3. 로그아웃 버튼 클릭
4. 다시 로그인 (rememberMe = false)

**예상 결과**:
- ✅ 로그아웃 시 모든 세션 데이터 삭제
- ✅ localStorage에서 `dental_auth`, `dental_user`, `dental_remember_me` 삭제
- ✅ localStorage에서 `sb-*` 삭제
- ✅ 재로그인 성공

**확인 방법**:
```javascript
// 로그아웃 직후
console.log('After logout:')
console.log('dental_auth:', localStorage.getItem('dental_auth')) // null
console.log('dental_user:', localStorage.getItem('dental_user')) // null
console.log('dental_remember_me:', localStorage.getItem('dental_remember_me')) // null
console.log('Supabase keys:', Object.keys(localStorage).filter(k => k.startsWith('sb-'))) // []
```

---

### 시나리오 8: 세션 복원 (브라우저 새로고침)
**목적**: 페이지 새로고침 후 세션 유지 확인

**테스트 단계**:
1. 로그인 (rememberMe = true)
2. F5 (새로고침) 누르기
3. 또는 브라우저 닫고 다시 열기

**예상 결과**:
- ✅ 로그인 상태 유지
- ✅ 대시보드 페이지 그대로 표시
- ✅ 사용자 정보 정상 표시

---

## 현재 발견된 이슈

### 🐛 Issue #1: rememberMe = false 동작 안함
**문제**: `customStorageAdapter.ts`가 항상 localStorage 사용
- `getStorage()` 메서드가 항상 `window.localStorage` 반환
- `rememberMe = false`여도 세션이 localStorage에 저장됨

**영향**:
- 사용자가 "로그인 상태 유지" 체크 해제해도 의미 없음
- 브라우저 닫아도 세션 유지됨

**해결 방안**:
1. **옵션 A**: `getStorage()`가 `rememberMe` 플래그에 따라 localStorage/sessionStorage 전환
2. **옵션 B**: 항상 localStorage 사용하되, 브라우저 닫을 때 `beforeunload` 이벤트로 세션 삭제
3. **옵션 C**: Supabase의 `persistSession` 옵션 활용

**권장**: 옵션 A가 가장 간단하고 명확함

---

## 테스트 체크리스트

- [ ] 시나리오 1: 일반 로그인 (rememberMe = false)
- [ ] 시나리오 2: 로그인 상태 유지 (rememberMe = true)
- [ ] 시나리오 3: 마스터 계정 로그인
- [ ] 시나리오 4: 잘못된 비밀번호
- [ ] 시나리오 5-1: 빈 이메일
- [ ] 시나리오 5-2: 빈 비밀번호
- [ ] 시나리오 6: 타임아웃 처리
- [ ] 시나리오 7: 로그아웃 후 재로그인
- [ ] 시나리오 8: 세션 복원 (새로고침)

---

## 테스트 환경 요구사항

- ✅ 개발 서버 실행 중 (포트 3000 또는 3001-3006)
- ✅ Supabase 환경 변수 설정됨
- ✅ 테스트 계정 존재 (`test@example.com`)
- ✅ 브라우저: Chrome/Edge (Playwright 사용)

---

## 다음 단계

1. 개발 서버 실행 확인
2. Playwright로 자동화 테스트 실행
3. 각 시나리오별 결과 기록
4. 발견된 이슈 수정
5. 재테스트
