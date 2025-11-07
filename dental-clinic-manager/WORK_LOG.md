# 작업 로그 (Work Log)

프로젝트의 모든 작업 내역을 기록합니다. 문제 해결 과정, 구현 방법, 배운 점을 체계적으로 정리하여 이후 유사 작업 시 참고 자료로 활용합니다.

---

## 2025-11-07 [버그 수정] 세션 timeout 복원 및 refreshError 처리 추가

**키워드:** #세션 #timeout #버그수정 #근본원인 #Vercel #세션갱신 #네트워크레이턴시

### 📋 작업 내용
- 로그인 후 일정 시간 지나면 모든 기능(일일보고서, 프로토콜, 근로계약서 등)이 작동하지 않는 문제 해결
- 세션 갱신 timeout을 3초/5초에서 10초로 복원
- refreshError 처리 로직 추가

### 🐛 문제 상황
- 로그인 후 2-3분이 지나면:
  - 일일보고서 저장 안 됨
  - 데이터 불러오기 안 됨
  - 진료 프로토콜 기능 안 됨
  - 근로계약서 기능 안 됨
- 최근 커밋 d40237c "Vercel 배포 환경에서 세션 timeout 최적화" 이후 문제 재발

### 🔍 근본 원인 (5 Whys)

1. **Q: 왜 로그인 후 일정 시간 지나면 모든 기능이 작동하지 않는가?**
   - A: 세션이 만료되었고, 세션 갱신도 실패함

2. **Q: 왜 세션 갱신이 실패하는가?**
   - A: refreshSessionWithTimeout의 3초 timeout이 너무 짧아서 Vercel 환경에서 정상적인 갱신도 timeout에 걸림

3. **Q: 왜 timeout 후 복구가 안 되는가?**
   - A: timeout 발생 시 needsReinitialization이 설정되지 않고, refreshError도 처리하지 않아 세션 없는 상태로 계속 진행

4. **Q: 왜 3초 timeout을 설정했는가?**
   - A: Vercel Serverless Function의 10초 제한을 지키기 위해 (3초 세션 + 3초 데이터 = 6초 예상)

5. **Q: 근본 원인은?**
   - A: **timeout을 너무 짧게 설정하여 Vercel 환경의 네트워크 레이턴시와 cold start를 고려하지 않음 + timeout 실패 시 복구 로직 부재**

**근본 원인 요약:**
- d40237c 커밋에서 timeout을 5초 → 3초로 단축
- Vercel 환경: Cold start + 네트워크 레이턴시 + Supabase API 응답 시간
- 3초 안에 세션 갱신 완료 못함 → timeout 발생
- sessionUtils.ts: timeout 시 'SESSION_REFRESH_TIMEOUT' 반환, needsReinitialization = undefined
- dataService.ts: needsReinitialization만 체크, refreshError 무시
- 결과: 세션 갱신 실패 → 모든 데이터 요청 실패

### ✅ 해결 방법

**변경 파일:**
- `src/lib/dataService.ts`
- `src/hooks/useSupabaseData.ts`

**주요 변경 사항:**

```typescript
// 1. timeout 복원 (3초 → 10초)
// Before
const { session, error, needsReinitialization } = await refreshSessionWithTimeout(supabase, 3000)

// After
const { session, error, needsReinitialization } = await refreshSessionWithTimeout(supabase, 10000)

// 2. refreshError 처리 추가
if (refreshError) {
  console.error('[DataService] Session refresh failed:', refreshError)
  if (refreshError === 'SESSION_EXPIRED' || refreshError === 'SESSION_REFRESH_TIMEOUT') {
    // 명시적 에러 처리 (로그인 페이지로 이동 또는 에러 반환)
  }
}
```

**적용 기술:**
- timeout을 10초로 복원 (Vercel maxDuration 60초이므로 충분히 여유 있음)
- refreshError 명시적 처리
- SESSION_EXPIRED, SESSION_REFRESH_TIMEOUT 에러 시 적절한 에러 처리

**수정 위치:**
1. `dataService.ts` - `getReportByDate()`: 3초 → 10초 + refreshError 처리
2. `dataService.ts` - `saveReport()`: 3초 → 10초 + refreshError 처리
3. `dataService.ts` - `handleSessionError()`: 5초 → 10초
4. `useSupabaseData.ts` - 5초 → 10초 + refreshError 처리

### 🧪 테스트 결과
- 로컬 빌드 테스트 성공 (npm run build)
- TypeScript 타입 오류 없음
- Warning만 있음 (기존 warning과 동일)

### 📊 결과 및 영향
- ✅ 세션 갱신 timeout이 충분히 여유 있게 설정됨 (10초)
- ✅ Vercel 환경의 Cold start와 네트워크 레이턴시 고려
- ✅ timeout 실패 시에도 적절한 에러 처리로 사용자 경험 개선
- ✅ 로그인 후 시간 지나도 모든 기능 정상 작동 예상
- ✅ 기존 코드 구조 유지 (최소 침습 원칙)

### 💡 배운 점 / 참고 사항

**교훈:**
- **임시 방편 금지**: 3초 timeout은 로컬에서는 작동하지만 Vercel 환경에서는 실패
- **환경 차이 고려**: 로컬 환경과 프로덕션 환경의 네트워크 특성 차이 고려 필수
- **에러 처리 필수**: needsReinitialization만 체크하는 것이 아니라 error도 반드시 처리
- **충분한 여유**: Vercel maxDuration이 60초라면 timeout은 10초로 충분히 여유 있게 설정

**주의:**
- timeout을 너무 짧게 설정하면 정상적인 요청도 실패할 수 있음
- 프로덕션 환경의 Cold start, 네트워크 레이턴시 항상 고려
- error 반환 시 반드시 처리 로직 추가

**이후 작업 시 참고:**
- 세션 관련 문제 발생 시 timeout 값 먼저 확인
- 로컬에서 정상 작동해도 Vercel 환경에서 테스트 필요
- refreshError 처리 패턴을 다른 곳에도 적용

### 📎 관련 링크
- 커밋: [968ae11](https://github.com/huisu-hwang/dental-clinic-manager/commit/968ae11)
- 관련 원칙: CLAUDE.md - 근본 원인 해결 원칙
- 관련 커밋: [d40237c](https://github.com/huisu-hwang/dental-clinic-manager/commit/d40237c) (문제 발생 커밋)

---

## 2025-11-07 [배포/인프라] Vercel 빌드 오류 수정 - functions 패턴 경로 수정

**키워드:** #vercel #빌드오류 #functions #배포 #근본원인 #경로수정

### 📋 작업 내용
- Vercel 배포 시 발생한 "The pattern 'api/**/*.{js,ts,jsx,tsx}' defined in `functions` doesn't match any Serverless Functions" 빌드 오류 해결
- vercel.json의 잘못된 functions 패턴 경로 수정

### 🐛 문제 상황
- Vercel 빌드 시 에러 발생
- 에러 메시지: "The pattern 'api/**/*.{js,ts,jsx,tsx}' defined in `functions` doesn't match any Serverless Functions."
- 배포가 실패하여 프로덕션 환경에 코드 반영 불가

### 🔍 근본 원인 (5 Whys)

1. **Q: 왜 Vercel 빌드 오류가 발생하는가?**
   - A: functions 패턴이 실제 파일과 매칭되지 않음

2. **Q: 왜 functions 패턴이 매칭되지 않는가?**
   - A: vercel.json에 `api/**/*.{js,ts,jsx,tsx}` 패턴이 정의되어 있지만 실제로는 그런 구조가 없음

3. **Q: 왜 그런 패턴이 정의되어 있는가?**
   - A: 과거에 잘못 설정되었거나, Next.js API 라우트를 수동으로 설정하려고 시도했을 가능성

4. **Q: 왜 Next.js는 자동 감지하지 못하는가?**
   - A: vercel.json의 잘못된 functions 설정이 자동 감지를 방해

5. **Q: 근본 원인은?**
   - A: **vercel.json에 실제 프로젝트 구조와 일치하지 않는 잘못된 functions 패턴 설정**

**근본 원인 요약:**
- 실제 API 라우트: `src/app/api/` 디렉토리에 존재
- vercel.json 설정: `api/**/*` (top-level api 디렉토리를 가정)
- vercel.json 설정: `app/**/*` (src 없이 app 디렉토리를 가정)
- 두 패턴 모두 실제 구조와 불일치

### ✅ 해결 방법

**변경 파일:**
- `vercel.json`

**주요 변경 사항:**

```diff
// Before (문제 코드)
{
  "functions": {
    "app/**/*.{js,ts,jsx,tsx}": {
      "maxDuration": 60
    },
    "api/**/*.{js,ts,jsx,tsx}": {
      "maxDuration": 60
    }
  },
  "regions": ["icn1"]
}

// After (수정 코드)
{
  "functions": {
    "src/app/**/*.{js,ts,jsx,tsx}": {
      "maxDuration": 60
    }
  },
  "regions": ["icn1"]
}
```

**적용 기술:**
- 실제 프로젝트 구조 분석 (Glob 도구 사용)
- 올바른 경로 패턴으로 수정: `src/app/**/*.{js,ts,jsx,tsx}`
- 존재하지 않는 패턴 제거: `api/**/*.{js,ts,jsx,tsx}`
- maxDuration 60초 설정 유지

### 🧪 테스트 결과
- Git commit & push 성공
- Vercel 재배포 대기 중 (자동 배포 트리거됨)

### 📊 결과 및 영향
- ✅ 빌드 오류 원인 제거
- ✅ 올바른 경로 패턴으로 Serverless Functions 인식 가능
- ✅ 기존 코드 변경 없음 (설정 파일만 수정)
- ✅ 최소 침습 원칙 준수

### 💡 배운 점 / 참고 사항

**교훈:**
- Vercel functions 설정 시 실제 프로젝트 구조를 정확히 파악해야 함
- Next.js App Router 프로젝트는 `src/app/` 또는 `app/` 구조 중 하나를 사용
- 존재하지 않는 경로 패턴은 빌드 오류 발생

**주의:**
- Next.js는 API 라우트를 자동으로 감지하므로, 대부분의 경우 functions 설정이 불필요
- maxDuration 설정이 필요한 경우에만 명시적으로 설정

**이후 작업 시 참고:**
- 프로젝트 구조 변경 시 vercel.json 설정도 함께 검토
- 빌드 오류 발생 시 실제 파일 구조와 설정 파일의 일치 여부 우선 확인

### 📎 관련 링크
- 커밋: [d70ee3e](https://github.com/huisu-hwang/dental-clinic-manager/commit/d70ee3e)
- 관련 원칙: CLAUDE.md - 근본 원인 해결 원칙

---

마지막 업데이트: 2025-11-07 (세션 timeout 복원 추가)
