# 프로토콜 기능 향상 설치 가이드

## 개요
이 가이드는 치과 클리닉 관리 시스템에 향상된 프로토콜 기능을 설치하고 설정하는 방법을 설명합니다.

## 주요 기능
- 📝 **리치 텍스트 에디터**: 이미지, 테이블, 체크리스트 지원
- 🎯 **단계별 프로토콜 작성**: 드래그 앤 드롭으로 순서 변경 가능
- 🏷️ **스마트 태그 추천**: 제목과 카테고리 기반 자동 태그 추천
- 🖼️ **미디어 관리**: 이미지 업로드 및 YouTube 비디오 임베딩
- 📋 **템플릿 시스템**: 재사용 가능한 프로토콜 템플릿

## 설치 단계

### 1. 패키지 설치
```bash
# 이미 설치되어 있음
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-youtube @tiptap/extension-table @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-placeholder
npm install @dnd-kit/sortable @dnd-kit/core @dnd-kit/utilities
```

### 2. Supabase Storage 버킷 설정

#### 방법 1: Supabase Dashboard 사용
1. [Supabase Dashboard](https://app.supabase.com) 로그인
2. 프로젝트 선택
3. Storage 메뉴로 이동
4. "New bucket" 클릭
5. 다음 설정으로 버킷 생성:
   - Name: `protocol-media`
   - Public bucket: ✅ (체크)
   - File size limit: 10MB (또는 원하는 크기)
   - Allowed MIME types: `image/*`

#### 방법 2: SQL 쿼리 사용
Supabase SQL Editor에서 다음 쿼리 실행:
```sql
-- Storage 버킷 생성 (Supabase Dashboard에서만 가능)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('protocol-media', 'protocol-media', true);
```

### 3. 데이터베이스 마이그레이션 적용

#### Supabase SQL Editor에서 실행:
1. **프로토콜 향상 기능 테이블 생성**
   - 파일 경로: `supabase/migrations/20250121_protocol_enhancements.sql`
   - SQL Editor에 복사하여 실행

2. **Storage 정책 설정**
   - 파일 경로: `supabase/migrations/20250121_protocol_storage_setup.sql`
   - SQL Editor에 복사하여 실행

### 4. 환경 변수 확인
`.env.local` 파일에 다음 변수들이 설정되어 있는지 확인:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 기능 테스트

### 1. 프로토콜 생성 테스트
1. 대시보드로 이동
2. "프로토콜" 탭 선택
3. "새 프로토콜 작성" 클릭
4. 다음 기능들 테스트:
   - 제목 입력
   - 카테고리 선택
   - 태그 추천 확인

### 2. 리치 에디터 테스트
**통합 에디터** 탭에서:
- 텍스트 서식 (굵게, 이탤릭, 제목)
- 이미지 업로드 (드래그 앤 드롭 또는 버튼 클릭)
- YouTube 비디오 임베딩
- 테이블 삽입
- 체크리스트 생성

### 3. 단계별 작성 테스트
**단계별 작성** 탭에서:
- 새 단계 추가
- 단계 제목 및 내용 입력
- 드래그 앤 드롭으로 순서 변경
- 단계 복제
- 선택사항 표시

### 4. 스마트 태그 테스트
- 제목에 "임플란트" 입력 → 관련 태그 추천 확인
- 카테고리 선택 → 카테고리 관련 태그 추천 확인
- 자동완성 기능 테스트

## 문제 해결

### Storage 업로드 오류
```javascript
// 오류: "The resource was not found"
// 해결: protocol-media 버킷이 생성되었는지 확인

// 오류: "Row level security (RLS) is not enabled"
// 해결: SQL Editor에서 다음 실행
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
```

### 태그 추천이 표시되지 않음
```javascript
// clinicId가 올바르게 설정되었는지 확인
// dataService.getSession()이 올바른 값을 반환하는지 확인
```

### 이미지 업로드 실패
```javascript
// 1. Storage 버킷 권한 확인
// 2. 파일 크기 제한 확인 (기본 5MB)
// 3. MIME 타입 확인 (image/jpeg, image/png, image/gif, image/webp)
```

## 데이터베이스 스키마

### 새로 추가된 테이블
1. **protocol_steps**: 프로토콜 단계 정보
2. **protocol_media**: 미디어 파일 메타데이터
3. **tag_suggestions**: 태그 사용 통계
4. **protocol_templates**: 재사용 가능한 템플릿

### 주요 함수
- `increment_tag_usage()`: 태그 사용 횟수 증가
- `get_recommended_tags()`: 추천 태그 가져오기

## 개발 팁

### 태그 추천 커스터마이징
`src/lib/tagSuggestionService.ts`에서 의료 용어 사전 수정:
```typescript
const medicalTerms: Record<string, string[]> = {
  '임플란트': ['임플란트', '식립', '픽스처'],
  // 추가 용어...
}
```

### 에디터 확장
`src/components/Protocol/EnhancedTiptapEditor.tsx`에서 새 extension 추가:
```typescript
import NewExtension from '@tiptap/extension-new'

const extensions = [
  // 기존 extensions...
  NewExtension.configure({
    // 설정
  })
]
```

## 유지보수

### 사용하지 않는 이미지 정리
```javascript
// mediaService의 cleanupUnusedImages 메서드가 자동으로 처리
// 프로토콜 업데이트 시 이전 콘텐츠와 비교하여 삭제된 이미지 제거
```

### 태그 통계 초기화
```sql
-- 특정 클리닉의 태그 통계 초기화
DELETE FROM tag_suggestions WHERE clinic_id = 'your_clinic_id';
```

## 지원 및 문의
- 버그 리포트: GitHub Issues
- 기능 요청: GitHub Discussions
- 긴급 지원: 시스템 관리자 연락

---
마지막 업데이트: 2025년 1월 21일