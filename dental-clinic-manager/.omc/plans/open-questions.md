# Open Questions

## hometax-scraping-system - 2026-03-12

- [ ] 홈택스 테스트 계정 확보 여부 — Phase 2 로그인 구현 시 실제 계정이 필요하며, 국세청 테스트 환경 또는 실제 사업자 계정 중 어떤 것을 사용할지 결정 필요
- [ ] 스크래핑 워커 프로젝트 위치 — 기존 dental-clinic-manager 모노레포 내 (`scraping-worker/`)에 둘지, 별도 Git 저장소로 분리할지 결정 필요
- [ ] Mac mini M4 Docker 환경 준비 상태 — Docker Desktop 설치 여부, ARM 기반 Playwright Chromium 호환성 사전 확인 필요
- [ ] ENCRYPTION_KEY 관리 방식 — Next.js 앱(Vercel)과 Mac mini 워커 간 동일 키를 안전하게 공유하는 방법 결정 필요 (Vercel env vars + .env 파일 vs. Vault 서비스)
- [ ] 기존 CODEF 테이블 데이터 보존 여부 — codef_connections/codef_sync_logs의 기존 데이터를 신규 테이블로 마이그레이션할지, 아카이브 후 폐기할지 결정 필요
- [ ] 멀티테넌트 클리닉 수 예상치 — 초기 서비스 대상 클리닉 수에 따라 배치 스케줄 간격과 워커 인스턴스 수가 달라짐 (10개 이하 vs 50개 이상)
- [ ] Phase 5 Protocol 전환 착수 시점 — Phase 2 MVP 안정 운영 기간을 얼마나 둘지 (1개월? 3개월?) 결정 필요
- [ ] 홈택스 접속 차단 시 대응 프로세스 — IP 밴 발생 시 프록시 전환 vs 수동 개입 vs 수집 일시 중단 중 선호 방안 결정 필요
- [ ] 알림 채널 우선순위 — 앱 내 알림만으로 충분한지, 카카오톡/이메일 알림도 Phase 4에 포함할지 결정 필요
