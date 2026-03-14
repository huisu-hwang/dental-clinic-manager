import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 워커 상태 조회 (admin용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const _adminCheck = searchParams.get('admin');

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('scraping_workers')
      .select('*')
      .order('last_heartbeat', { ascending: false });

    if (error) {
      return NextResponse.json({ error: '워커 상태 조회에 실패했습니다.' }, { status: 500 });
    }

    // 워커 상태에 건강 정보 추가
    const workers = (data || []).map(worker => {
      const lastHeartbeat = new Date(worker.last_heartbeat).getTime();
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5분
      const isHealthy = worker.status !== 'offline' && (now - lastHeartbeat) < staleThreshold;

      return {
        ...worker,
        is_healthy: isHealthy,
        heartbeat_age_seconds: Math.round((now - lastHeartbeat) / 1000),
      };
    });

    return NextResponse.json({ success: true, data: workers });
  } catch (error) {
    console.error('GET /api/hometax/workers error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
