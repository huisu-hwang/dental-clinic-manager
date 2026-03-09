# 덴트웹 브릿지 에이전트

원내 PC의 덴트웹 DB(MS SQL Server)에서 환자 데이터를 읽어 Supabase 클라우드로 자동 동기화하는 백그라운드 에이전트입니다.

## 원클릭 설치

1. 이 폴더를 원내 PC에 복사합니다
2. `setup.bat`을 **관리자 권한으로** 더블클릭합니다
3. 안내에 따라 DB 정보와 API 키를 입력합니다
4. 설치 완료! PC 부팅 시 자동으로 실행됩니다

## 수동 설치

```bash
# 1. 의존성 설치
npm install

# 2. 환경 설정
cp .env.example .env
# .env 파일 편집

# 3. 빌드
npm run build

# 4. 실행
npm start

# 5. (선택) Windows 서비스 등록 (관리자 권한 필요)
npm run install-service
```

## 환경 변수 (.env)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DENTWEB_DB_SERVER` | 덴트웹 DB 서버 주소 | `localhost` |
| `DENTWEB_DB_PORT` | DB 포트 | `1433` |
| `DENTWEB_DB_DATABASE` | 데이터베이스 이름 | `DENTWEBDB` |
| `DENTWEB_DB_USER` | DB 사용자명 | (필수) |
| `DENTWEB_DB_PASSWORD` | DB 비밀번호 | (필수) |
| `SUPABASE_URL` | Supabase 프로젝트 URL | (필수) |
| `CLINIC_ID` | 병원 UUID | (필수) |
| `API_KEY` | 동기화 API 키 (대시보드에서 생성) | (필수) |
| `SYNC_INTERVAL_SECONDS` | 동기화 주기 (초) | `300` |
| `SYNC_TYPE` | 동기화 유형 (full/incremental) | `incremental` |

## 동작 방식

```
[덴트웹 DB] → [Bridge Agent] → [Supabase API] → [웹 대시보드]
(원내 PC)     (원내 PC)        (클라우드)        (어디서나)
```

1. 에이전트 시작 시 DB 연결 테스트 (최대 5회 재시도)
2. 최초 전체 동기화 실행
3. 이후 설정된 주기마다 증분 동기화
4. 네트워크 오류 시 자동 재시도 (최대 3회, 지수 백오프)
5. 동기화 상태는 로컬 파일에 저장되어 재시작 후에도 유지

## 로그

- 콘솔 출력 + `logs/bridge-agent.log` 파일
- 동기화 상태: `data/sync-state.json`

## 서비스 관리

```bash
# 서비스 제거
node scripts/install-service.js --uninstall

# 수동 실행 (개발용)
npm run dev

# 연결 테스트
npm run test-connection
```
