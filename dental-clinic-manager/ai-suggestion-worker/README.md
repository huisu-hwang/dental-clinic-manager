# ai-suggestion-worker

자유게시판 "제안 사항" 게시글을 AI가 자동으로 구현해 PR을 생성하는 맥미니 백그라운드 워커.

## 개요

마스터가 웹앱에서 "AI 자동 구현" 버튼을 누르면 `ai_suggestion_tasks` 테이블에 row가 INSERT됩니다. 이 워커는 Supabase Realtime으로 그 이벤트를 받아:

1. git worktree를 `origin/develop` 기준으로 신규 브랜치로 생성
2. Claude Agent SDK(Anthropic SDK + tool loop)로 코드 수정 수행
3. `npm run build` 통과 확인 (실패 시 최대 N회 자동 재수정)
4. `gh pr create --base develop`로 PR 생성
5. 태스크 row에 결과(pr_url, pr_number, commit_sha, status) UPDATE

## 동작 흐름

```
┌──────────────────┐   INSERT    ┌────────────────────┐
│ 웹앱 (master UI) │────────────▶│ ai_suggestion_tasks│
└──────────────────┘             │   (Supabase DB)    │
                                 └──────────┬─────────┘
                                            │ Realtime
                                            ▼
                          ┌──────────────────────────────┐
                          │  ai-suggestion-worker (Mac)  │
                          │                              │
                          │  ① claim: pending→running    │
                          │  ② git worktree add          │
                          │  ③ Claude tool loop 실행     │
                          │  ④ npm run build 검증        │
                          │  ⑤ git commit & push         │
                          │  ⑥ gh pr create              │
                          │  ⑦ UPDATE status=completed   │
                          └──────────────────────────────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │   GitHub PR  │
                                     │ base=develop │
                                     └──────────────┘
```

## 설치

```bash
cd ai-suggestion-worker
npm install
cp .env.example .env
# .env 값 채우기
```

## 실행

개발 (watch 모드):

```bash
npm run dev
```

프로덕션 (pm2):

```bash
pm2 start ecosystem.config.cjs
pm2 logs ai-suggestion-worker
pm2 save
```

타입체크만:

```bash
npm run typecheck
```

## 필수 환경변수

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (RLS 우회) |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `REPO_PATH` | 마스터 체크아웃 경로 (git worktree add 기준) |
| `WORKTREE_ROOT` | worktree 생성될 상위 디렉토리 |
| `GITHUB_TOKEN` | PR 생성에 사용할 GitHub PAT (gh CLI가 읽음) |

## 선택 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MAX_BUILD_RETRIES` | `3` | 빌드 실패 시 Claude 재수정 요청 최대 횟수 |
| `TASK_TIMEOUT_MS` | `1800000` | 단일 태스크 타임아웃 (30분) |
| `CLAUDE_MODEL` | `claude-opus-4-5` | 사용할 모델 |

## 사전 준비 (맥미니)

1. **gh CLI 설치 및 인증**
   ```bash
   brew install gh
   gh auth login  # 혹은 GITHUB_TOKEN으로 비로그인 호출 가능
   ```

2. **git user 설정** (REPO_PATH에서)
   ```bash
   cd $REPO_PATH
   git config user.name "AI Suggestion Bot"
   git config user.email "ai-bot@whitedc.local"
   ```

3. **ripgrep 설치** (Claude의 `grep` 툴용)
   ```bash
   brew install ripgrep
   ```

4. **worktrees 디렉토리 준비** — 워커가 자동 생성하지만 수동으로 `mkdir -p $WORKTREE_ROOT`도 가능.

## 안전장치

### Bash 화이트리스트
Claude의 `run_bash` 툴이 실행할 수 있는 명령은 다음으로 제한:
- `git status`, `git diff`, `git add`, `git log`, `git show`
- `npm run build`, `npm run lint`, `npm run typecheck`
- `ls`, `cat`, `pwd`, `node --version`

그 외 명령(`rm`, `curl`, `wget`, `sudo`, 파이프 `|`, 세미콜론 `;`, 리다이렉트 `>`)은 거부됩니다.

### Worktree 격리
모든 코드 수정은 `$WORKTREE_ROOT/suggestion-{task_id}/` 내부로 격리됩니다. 모든 도구의 path 파라미터는 worktree 루트를 escape하지 못합니다 (`..` 차단).

### DB 마이그레이션 수동 적용
Claude는 SQL을 실행하지 않고 `supabase/migrations/*.sql` 파일만 생성합니다. PR 본문에 "⚠️ DB 마이그레이션 포함" 섹션이 자동 추가되며, 리뷰어가 머지 전에 Supabase MCP로 수동 적용해야 합니다.

### 타임아웃
단일 태스크가 `TASK_TIMEOUT_MS` (기본 30분)을 넘기면 자동 실패 처리.

### 동시 실행 1건
큐 기반 직렬 처리로 worktree 충돌·리소스 과다 사용을 방지합니다.

### 취소
태스크 처리 중 10초 간격으로 `status='cancelled'`를 체크합니다. 웹앱에서 status를 cancelled로 업데이트하면 진행 중인 태스크가 중단됩니다.

## 운영 팁

### 로그
- pm2: `pm2 logs ai-suggestion-worker`
- 파일: `./logs/out.log`, `./logs/err.log`

### 실패한 worktree 디버깅
실패한 태스크의 worktree는 자동으로 `$WORKTREE_ROOT/failed/suggestion-{id}-{timestamp}/`로 이동됩니다. 수동으로 확인 후 정리하세요:

```bash
ls $WORKTREE_ROOT/failed/
# 디버깅 후 제거
rm -rf $WORKTREE_ROOT/failed/suggestion-XXX
```

### pm2 명령어
```bash
pm2 status                      # 상태 확인
pm2 restart ai-suggestion-worker  # 재시작
pm2 stop ai-suggestion-worker     # 중지
pm2 delete ai-suggestion-worker   # 삭제
pm2 logs ai-suggestion-worker --lines 200
```

### 태스크 수동 재시도
실패한 태스크를 재시도하려면 Supabase SQL Editor에서:

```sql
UPDATE ai_suggestion_tasks
SET status = 'pending', error_message = NULL, started_at = NULL, completed_at = NULL
WHERE id = 'task-uuid';
```

워커가 Realtime UPDATE 이벤트로 감지해 자동 재처리합니다.

## 구조

```
ai-suggestion-worker/
├── package.json
├── tsconfig.json
├── .env.example
├── ecosystem.config.cjs
├── README.md
└── src/
    ├── index.ts         # Realtime 구독 + 큐 디스패처
    ├── supabase.ts      # service_role 클라이언트 + 태스크 헬퍼
    ├── taskRunner.ts    # 단일 태스크 생명주기
    ├── claudeRunner.ts  # Anthropic SDK + tool loop
    ├── gitOps.ts        # git worktree/commit/push
    ├── githubOps.ts     # gh CLI로 PR 생성
    └── config.ts        # 환경변수 로드·검증
```

## 필요한 Supabase 테이블 (예상)

```sql
CREATE TABLE ai_suggestion_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES community_posts(id),
  requested_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  branch_name TEXT,
  pr_url TEXT,
  pr_number INT,
  commit_sha TEXT,
  worker_log TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Realtime이 활성화되어 있어야 합니다 (`ALTER PUBLICATION supabase_realtime ADD TABLE ai_suggestion_tasks;`).
