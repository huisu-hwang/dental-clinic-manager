# 비밀번호 재설정 기능 설정 가이드

## 📋 개요
이 문서는 비밀번호 재설정 기능을 위한 Supabase 설정 방법을 안내합니다.

## 🔧 Supabase 대시보드 설정

### 1. URL Configuration 설정

1. Supabase 대시보드 접속: https://supabase.com/dashboard
2. 프로젝트 선택
3. **Authentication > URL Configuration** 메뉴로 이동
4. 다음 설정 확인 및 업데이트:

#### Site URL (개발 환경)
```
http://localhost:3000
```

#### Redirect URLs
다음 URL을 추가:
```
http://localhost:3000/update-password
http://localhost:3000/**
```

> **배포 환경**: 배포 시에는 실제 도메인으로 변경 필요 (예: `https://yourdomain.com`)

### 2. Email Templates 설정

1. **Authentication > Email Templates** 메뉴로 이동
2. **Reset Password** 템플릿 선택
3. 템플릿 확인:
   - 기본 템플릿에 `{{ .SiteURL }}/update-password` 경로가 포함되어 있어야 함
   - 또는 `{{ .ConfirmationURL }}` 사용

#### 예시 템플릿:
```html
<h2>비밀번호 재설정</h2>
<p>비밀번호를 재설정하려면 아래 버튼을 클릭하세요:</p>
<a href="{{ .SiteURL }}/update-password#{{ .TokenHash }}">비밀번호 재설정</a>
<p>이 링크는 24시간 동안 유효합니다.</p>
```

### 3. SMTP 설정 (선택사항)

기본적으로 Supabase는 개발 환경에서 자체 이메일 서비스를 제공합니다.
프로덕션 환경에서는 SMTP 설정이 필요합니다:

1. **Project Settings > Auth > SMTP Settings** 메뉴로 이동
2. SMTP 서버 정보 입력 (Gmail, SendGrid, AWS SES 등)

## 🧪 테스트 방법

### 1. 비밀번호 재설정 요청
1. 로그인 페이지에서 "비밀번호를 잊으셨나요?" 클릭
2. 등록된 이메일 주소 입력
3. "재설정 이메일 받기" 클릭

### 2. 이메일 확인
1. 받은 편지함 확인 (개발 환경: Supabase Inbucket 또는 설정된 이메일)
2. "비밀번호 재설정" 링크 클릭

> **Supabase Inbucket 확인 방법**:
> - Supabase 대시보드 > Authentication > Email Templates
> - 페이지 하단에 "Inbucket" 링크 클릭
> - 테스트 이메일 확인

### 3. 새 비밀번호 설정
1. 자동으로 `/update-password` 페이지로 이동
2. 새 비밀번호 입력 (6자 이상)
3. 비밀번호 확인
4. "비밀번호 변경" 클릭
5. 성공 시 자동으로 대시보드로 이동

## 🐛 문제 해결

### 토큰이 감지되지 않는 경우
1. **브라우저 콘솔 확인**:
   - F12 > Console 탭
   - `[PasswordReset]` 로그 확인
2. **URL 확인**:
   - URL에 `#access_token=xxx&type=recovery` 형식의 해시가 있는지 확인
3. **Supabase Site URL 확인**:
   - Authentication > URL Configuration
   - Site URL이 현재 개발 서버와 일치하는지 확인

### 이메일이 전송되지 않는 경우
1. **이메일 주소 확인**:
   - users 테이블에 해당 이메일이 존재하는지 확인
2. **SMTP 설정 확인**:
   - Project Settings > Auth > SMTP Settings
   - SMTP 오류 로그 확인
3. **이메일 제한 확인**:
   - Supabase는 시간당 이메일 전송 제한이 있음

### 링크가 만료된 경우
- 재설정 링크는 **24시간** 동안만 유효합니다
- 만료된 경우 비밀번호 재설정을 다시 요청하세요

## 📝 구현된 기능

### 1. 비밀번호 재설정 요청 (`ForgotPasswordForm.tsx`)
- 이메일 유효성 검증
- 등록된 사용자 확인
- Supabase를 통한 재설정 이메일 전송
- 명확한 에러 처리 및 사용자 피드백

### 2. 토큰 리다이렉션 (`PasswordResetHandler.tsx`)
- URL 해시에서 recovery 토큰 자동 감지
- `/update-password`로 자동 리다이렉션
- 전역 레이아웃에 통합

### 3. 비밀번호 변경 (`update-password/page.tsx`)
- 복구 토큰 자동 감지 (3가지 방법)
- 5초 타임아웃으로 무한 로딩 방지
- 비밀번호 유효성 검증 (6자 이상)
- 비밀번호 일치 확인
- 성공 시 자동 대시보드 이동

## 🔒 보안 고려사항

1. **링크 유효기간**: 재설정 링크는 24시간 후 자동 만료
2. **일회성 토큰**: 각 토큰은 한 번만 사용 가능
3. **HTTPS 필수**: 프로덕션 환경에서는 반드시 HTTPS 사용
4. **비밀번호 정책**: 최소 6자 이상 (필요시 강화 가능)

## 📚 관련 파일

- `src/components/Auth/ForgotPasswordForm.tsx` - 비밀번호 재설정 요청 폼
- `src/components/PasswordResetHandler.tsx` - 토큰 감지 및 리다이렉션
- `src/app/update-password/page.tsx` - 비밀번호 변경 페이지
- `src/app/layout.tsx` - 전역 레이아웃 (PasswordResetHandler 포함)

## 🚀 다음 단계

프로덕션 배포 전:
1. ✅ Site URL을 실제 도메인으로 변경
2. ✅ Redirect URLs 업데이트
3. ✅ SMTP 설정 완료
4. ✅ 이메일 템플릿 커스터마이징
5. ✅ 비밀번호 정책 강화 (선택사항)
