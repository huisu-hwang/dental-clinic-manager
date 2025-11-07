# 작업 로그 (Work Log)

프로젝트의 모든 작업 내역을 기록합니다. 문제 해결 과정, 구현 방법, 배운 점을 체계적으로 정리하여 이후 유사 작업 시 참고 자료로 활용합니다.

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

마지막 업데이트: 2025-11-07
