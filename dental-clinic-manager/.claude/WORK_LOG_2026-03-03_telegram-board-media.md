## 2026-03-03 [기능 개발] 텔레그램 게시판 - 파일 첨부 + 미디어 삽입 + 링크 미리보기

**키워드:** #텔레그램 #게시판 #파일첨부 #미디어 #링크미리보기 #TipTap

### 📋 작업 내용

텔레그램 게시판 글쓰기 기능을 강화하여 파일 첨부, 본문 내 이미지/동영상 삽입, 링크 미리보기 기능을 구현했다.

### ✅ 구현 완료 항목 (9단계)

#### Step 1: 타입 정의 수정 (`src/types/telegram.ts`)
- `CreateTelegramBoardPostDto`에 `file_urls` 필드 추가
- `UpdateTelegramBoardPostDto`에 `file_urls` 필드 추가
- 타입: `{ url: string; name: string; type?: string; size?: number }[]`

#### Step 2: mediaService 확장 (`src/lib/mediaService.ts`)
- `uploadTelegramBoardMedia(file)` 추가 - 본문 삽입용 이미지/동영상 업로드
  - 이미지: 10MB 제한, 동영상(MP4/WebM): 50MB 제한
  - 버킷: `protocol-media`, 경로: `telegram-board/`
- `uploadTelegramBoardFile(file)` 추가 - 첨부 파일 업로드
  - 50MB 제한, 모든 파일 타입 허용
  - 버킷: `bulletin-files`, 경로: `telegram-board-files/`

#### Step 3: EnhancedTiptapEditor 동영상 지원 (`src/components/Protocol/EnhancedTiptapEditor.tsx`)
- 커스텀 `VideoNode` TipTap 확장 추가 (`<video>` 태그 렌더링)
- `onMediaUpload` prop 추가 - 커스텀 업로드 핸들러 지원
- `enableVideoUpload` prop 추가 - 동영상 업로드 활성화
- 동영상 업로드 버튼 (Film 아이콘) 툴바에 추가
- 드래그&드롭, 붙여넣기에서 동영상 파일 지원
- 기존 프로토콜 에디터 동작 유지 (하위 호환성)

#### Step 4: API 라우트 수정
- POST `/api/telegram/groups/[id]/board-posts/route.ts`
  - `fileUrls` 파라미터 추가, `file_urls: fileUrls || []`로 저장
- PATCH `/api/telegram/board-posts/[postId]/route.ts`
  - `fileUrls` 파라미터 추가, `file_urls` 업데이트 지원

#### Step 5: telegramService 수정 (`src/lib/telegramService.ts`)
- `createPost`: fetch body에 `fileUrls: dto.file_urls ?? []` 추가
- `updatePost`: fetch body에 `fileUrls: dto.file_urls` 추가

#### Step 6: TelegramBoardPostForm 전면 업그레이드 (`src/components/Telegram/TelegramBoardPostForm.tsx`)
- 기본 TiptapEditor → EnhancedTiptapEditor 교체
- 파일 첨부 섹션 추가 (최대 5개, 50MB/파일)
- 파일 업로드/삭제/미리보기 UI
- 이미지 파일 썸네일 미리보기
- 파일 크기 포맷팅 (formatFileSize)
- 파일 아이콘 자동 선택 (getFileIcon)
- `onSubmit` 인터페이스에 `fileUrls` 추가

#### Step 7: TelegramBoardPostList 수정 (`src/components/Telegram/TelegramBoardPostList.tsx`)
- `handleFormSubmit` 시그니처에 `fileUrls` 파라미터 추가
- createPost/updatePost에 `file_urls` 전달

#### Step 8: 링크 미리보기 기능
- **새 파일** `src/app/api/link-preview/route.ts`
  - OG 메타데이터 추출 API (title, description, image, siteName)
  - SSRF 방지 (내부 IP 차단)
  - 5초 타임아웃, 50KB HTML 제한
  - 5분 캐시 헤더
- **새 파일** `src/components/Telegram/LinkPreviewCard.tsx`
  - URL을 받아 OG 카드 렌더링
  - 로딩/에러 상태 처리
  - 이미지 fallback

#### Step 9: PostDetail 미디어 렌더링 보강 (`src/components/Telegram/TelegramBoardPostDetail.tsx`)
- `LinkPreviewCard` 임포트 및 링크 미리보기 카드 섹션 추가
- `extractedLinks` useMemo - content 내 `<a>` 태그 + `link_urls`에서 URL 추출 (최대 5개)
- `[&_video]:rounded-lg [&_video]:max-w-full [&_video]:my-4` 비디오 스타일 추가

### 🗂️ 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/types/telegram.ts` | DTO에 file_urls 추가 |
| `src/lib/mediaService.ts` | uploadTelegramBoardMedia, uploadTelegramBoardFile 추가 |
| `src/components/Protocol/EnhancedTiptapEditor.tsx` | VideoNode, onMediaUpload, enableVideoUpload |
| `src/components/Telegram/TelegramBoardPostForm.tsx` | EnhancedTiptapEditor + 파일 첨부 |
| `src/components/Telegram/TelegramBoardPostList.tsx` | handleFormSubmit에 fileUrls |
| `src/components/Telegram/TelegramBoardPostDetail.tsx` | 링크 미리보기 + 비디오 스타일 |
| `src/lib/telegramService.ts` | createPost/updatePost에 file_urls |
| `src/app/api/telegram/groups/[id]/board-posts/route.ts` | fileUrls 지원 |
| `src/app/api/telegram/board-posts/[postId]/route.ts` | fileUrls 지원 |
| `src/app/api/link-preview/route.ts` | **새 파일** - OG 메타데이터 API |
| `src/components/Telegram/LinkPreviewCard.tsx` | **새 파일** - 링크 미리보기 카드 |

### 🧪 테스트 결과
- `npx tsc --noEmit` → 타입 에러 0건
- `npm run build` → 빌드 성공 (모든 페이지 정상 컴파일)

### 💡 참고사항
- EnhancedTiptapEditor의 `onMediaUpload` prop은 선택적이므로 기존 프로토콜 에디터는 영향 없음
- 파일 업로드는 기존 Supabase Storage 버킷(`protocol-media`, `bulletin-files`)을 경로로 구분하여 재사용
- 링크 미리보기 API는 SSRF 방지를 위해 내부 IP(10.x, 172.16-31.x, 192.168.x, 127.x)를 차단함

---
