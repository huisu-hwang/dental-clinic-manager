import http from 'http'
import { config } from './config'
import { logger } from './logger'
import { loadState } from './state'

const STATUS_PORT = parseInt(process.env.STATUS_PORT || '52800', 10)

let agentStatus = {
  running: false,
  dbConnected: false,
  dbError: '',
  supabaseConnected: false,
  supabaseError: '',
  startedAt: '',
  lastSyncAt: '',
  lastSyncStatus: '',
  lastSyncPatientCount: 0,
  totalSyncs: 0,
  consecutiveErrors: 0,
  demoMode: false,
}

export function updateAgentStatus(updates: Partial<typeof agentStatus>): void {
  agentStatus = { ...agentStatus, ...updates }
}

export function getAgentStatus() {
  // state 파일에서 최신 동기화 정보 읽기
  const state = loadState()
  return {
    ...agentStatus,
    lastSyncAt: state.lastSyncDate || agentStatus.lastSyncAt,
    lastSyncStatus: state.lastSyncStatus || agentStatus.lastSyncStatus,
    lastSyncPatientCount: state.lastSyncPatientCount || agentStatus.lastSyncPatientCount,
    totalSyncs: state.totalSyncs || agentStatus.totalSyncs,
    consecutiveErrors: state.consecutiveErrors || agentStatus.consecutiveErrors,
  }
}

function formatStatusHtml(): string {
  const s = getAgentStatus()
  const uptime = s.startedAt ? getUptime(s.startedAt) : '-'

  const dbIcon = s.dbConnected ? '&#9989;' : '&#10060;'
  const supaIcon = s.supabaseConnected ? '&#9989;' : '&#10060;'
  const syncIcon = s.lastSyncStatus === 'success' ? '&#9989;' : (s.lastSyncStatus === 'error' ? '&#10060;' : '&#9898;')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>덴트웹 브릿지 에이전트 상태</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; background: #f0f2f5; color: #333; }
    .container { max-width: 600px; margin: 40px auto; padding: 0 20px; }
    .header { background: linear-gradient(135deg, #1a73e8, #0d47a1); color: white; padding: 24px; border-radius: 12px 12px 0 0; }
    .header h1 { font-size: 20px; margin-bottom: 4px; }
    .header .ver { font-size: 13px; opacity: 0.8; }
    .card { background: white; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 20px; }
    .status-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; }
    .status-row:last-child { border-bottom: none; }
    .label { font-size: 14px; color: #666; }
    .value { font-size: 14px; font-weight: 600; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-ok { background: #e6f4ea; color: #1e8e3e; }
    .badge-err { background: #fce8e6; color: #d93025; }
    .badge-wait { background: #fef7e0; color: #f9a825; }
    .badge-demo { background: #e8f0fe; color: #1a73e8; }
    .section { margin-top: 16px; padding-top: 12px; border-top: 2px solid #eee; }
    .section-title { font-size: 13px; color: #999; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #999; }
    .running-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; animation: pulse 2s infinite; }
    .running-dot.on { background: #1e8e3e; }
    .running-dot.off { background: #d93025; animation: none; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>&#128737; 덴트웹 브릿지 에이전트</h1>
      <div class="ver">v${config.agentVersion} ${s.demoMode ? '(데모 모드)' : ''}</div>
    </div>
    <div class="card">
      <div class="status-row">
        <span class="label">에이전트 상태</span>
        <span class="value"><span class="running-dot ${s.running ? 'on' : 'off'}"></span>${s.running ? '실행 중' : '중지됨'}</span>
      </div>
      <div class="status-row">
        <span class="label">실행 시간</span>
        <span class="value">${uptime}</span>
      </div>
      ${s.demoMode ? `<div class="status-row"><span class="label">모드</span><span class="badge badge-demo">데모 모드</span></div>` : ''}

      <div class="section">
        <div class="section-title">연결 상태</div>
      </div>
      <div class="status-row">
        <span class="label">덴트웹 DB</span>
        <span class="value">${dbIcon} ${s.dbConnected ? '연결됨' : (s.demoMode ? '건너뜀 (데모)' : ('연결 실패' + (s.dbError ? ': ' + escapeHtml(s.dbError) : '')))}</span>
      </div>
      <div class="status-row">
        <span class="label">Supabase API</span>
        <span class="value">${supaIcon} ${s.supabaseConnected ? '연결됨' : ('연결 실패' + (s.supabaseError ? ': ' + escapeHtml(s.supabaseError) : ''))}</span>
      </div>

      <div class="section">
        <div class="section-title">동기화</div>
      </div>
      <div class="status-row">
        <span class="label">마지막 동기화</span>
        <span class="value">${s.lastSyncAt ? formatKoreanTime(s.lastSyncAt) : '아직 없음'}</span>
      </div>
      <div class="status-row">
        <span class="label">동기화 결과</span>
        <span class="badge ${s.lastSyncStatus === 'success' ? 'badge-ok' : (s.lastSyncStatus === 'error' ? 'badge-err' : 'badge-wait')}">${syncIcon} ${s.lastSyncStatus === 'success' ? '성공' : (s.lastSyncStatus === 'error' ? '실패' : '대기 중')}</span>
      </div>
      <div class="status-row">
        <span class="label">동기화된 환자 수</span>
        <span class="value">${s.lastSyncPatientCount}명</span>
      </div>
      <div class="status-row">
        <span class="label">총 동기화 횟수</span>
        <span class="value">${s.totalSyncs}회</span>
      </div>
      <div class="status-row">
        <span class="label">연속 오류</span>
        <span class="value ${s.consecutiveErrors > 0 ? 'badge badge-err' : ''}">${s.consecutiveErrors}회</span>
      </div>
      <div class="status-row">
        <span class="label">동기화 주기</span>
        <span class="value">${config.sync.intervalSeconds}초</span>
      </div>

      <div class="section">
        <div class="section-title">설정</div>
      </div>
      <div class="status-row">
        <span class="label">DB 서버</span>
        <span class="value">${escapeHtml(config.dentweb.server)}:${config.dentweb.port}</span>
      </div>
      <div class="status-row">
        <span class="label">DB 이름</span>
        <span class="value">${escapeHtml(config.dentweb.database)}</span>
      </div>
      <div class="status-row">
        <span class="label">인증 방식</span>
        <span class="value">${config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : 'SQL Server'}</span>
      </div>
    </div>
    <div class="footer">
      10초마다 자동 새로고침 | 시작: ${s.startedAt ? formatKoreanTime(s.startedAt) : '-'}
    </div>
  </div>
</body>
</html>`
}

function formatStatusJson() {
  return getAgentStatus()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatKoreanTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  } catch {
    return isoStr
  }
}

function getUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const diff = Math.floor((now - start) / 1000)

  if (diff < 60) return `${diff}초`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 ${diff % 60}초`
  const hours = Math.floor(diff / 3600)
  const mins = Math.floor((diff % 3600) / 60)
  if (hours < 24) return `${hours}시간 ${mins}분`
  const days = Math.floor(hours / 24)
  return `${days}일 ${hours % 24}시간`
}

export function startStatusServer(): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status' || req.url === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(formatStatusJson(), null, 2))
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(formatStatusHtml())
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`상태 서버 포트 ${STATUS_PORT} 이미 사용 중, 상태 페이지를 사용할 수 없습니다`)
    } else {
      logger.warn('상태 서버 시작 실패:', err.message)
    }
  })

  server.listen(STATUS_PORT, '127.0.0.1', () => {
    logger.info(`상태 페이지: http://localhost:${STATUS_PORT}`)
    console.log(`  [OK] 상태 페이지: http://localhost:${STATUS_PORT}`)
    console.log(`       (브라우저에서 에이전트 상태를 확인할 수 있습니다)`)
  })
}
