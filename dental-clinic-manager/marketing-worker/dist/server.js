import http from 'http';
import { processScheduledItemsOnce, stopScheduler } from './scheduler.js';
// ============================================
// 마케팅 워커 HTTP 서버
// Next.js 앱에서 즉시 발행 트리거 가능
// ============================================
export function startHttpServer(port) {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        // POST /trigger → 즉시 발행 처리
        if (req.method === 'POST' && req.url === '/trigger') {
            console.log('[Worker] 즉시 발행 트리거 수신');
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
            processScheduledItemsOnce().catch(console.error);
            return;
        }
        // GET /health → 헬스 체크
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, running: true }));
            return;
        }
        // POST /stop → 워커 종료
        if (req.method === 'POST' && req.url === '/stop') {
            console.log('[Worker] 중지 요청 수신');
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
            // 응답 전송 후 정리 후 종료
            setTimeout(async () => {
                await stopScheduler();
                process.exit(0);
            }, 300);
            return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[Worker] 포트 ${port} 이미 사용 중 - HTTP 서버 건너뜀`);
        }
        else {
            console.error('[Worker] HTTP 서버 오류:', err);
        }
    });
    server.listen(port, () => {
        console.log(`[Worker] HTTP 서버: http://localhost:${port}`);
    });
}
