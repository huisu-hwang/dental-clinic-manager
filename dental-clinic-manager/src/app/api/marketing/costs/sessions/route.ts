import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 세션(글)별 비용 목록
// GET /api/marketing/costs/sessions?page=1&limit=20&clinicId=xxx
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    if (userData.role !== 'master_admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const clinicFilter = searchParams.get('clinicId');

    // 환율 조회
    const { data: exchangeRateRow } = await supabase
      .from('marketing_cost_settings')
      .select('usd_to_krw')
      .eq('clinic_id', userData.clinic_id)
      .eq('model', 'exchange_rate')
      .single();

    const exchangeRate = exchangeRateRow?.usd_to_krw ?? 1380;

    // master_admin은 모든 클리닉 데이터 조회 (치과별 필터 가능)
    let query = supabase
      .from('marketing_api_usage')
      .select('generation_session_id, clinic_id, cost_usd, call_type, generation_options, success, created_at')
      .order('created_at', { ascending: false });

    if (clinicFilter) {
      query = query.eq('clinic_id', clinicFilter);
    }

    const { data: rows, error: queryError } = await query;
    if (queryError) throw queryError;

    // clinic_id → clinic_name 매핑
    const clinicIds = [...new Set((rows ?? []).map(r => r.clinic_id).filter(Boolean))];
    const clinicNameMap = new Map<string, string>();
    if (clinicIds.length > 0) {
      const { data: clinics } = await supabase
        .from('clinics')
        .select('id, name')
        .in('id', clinicIds);
      for (const c of clinics ?? []) {
        clinicNameMap.set(c.id, c.name);
      }
    }

    // generation_session_id 기준으로 집계
    const sessionMap = new Map<string, {
      generation_session_id: string;
      clinic_id: string;
      clinic_name: string;
      generation_options: Record<string, unknown> | null;
      total_cost_usd: number;
      text_cost_usd: number;
      image_cost_usd: number;
      call_count: number;
      created_at: string;
      success: boolean;
    }>();

    for (const row of rows ?? []) {
      const sessionId = row.generation_session_id;
      if (!sessionId) continue;

      const costUsd = Number(row.cost_usd) || 0;
      const isTextCall = typeof row.call_type === 'string' && row.call_type.startsWith('text_');
      const isImageCall = typeof row.call_type === 'string' &&
        (row.call_type.includes('image') || row.call_type === 'filename_generation');

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          generation_session_id: sessionId,
          clinic_id: row.clinic_id,
          clinic_name: clinicNameMap.get(row.clinic_id) || '-',
          generation_options: row.generation_options ?? null,
          total_cost_usd: 0,
          text_cost_usd: 0,
          image_cost_usd: 0,
          call_count: 0,
          created_at: row.created_at,
          success: true,
        });
      }

      const session = sessionMap.get(sessionId)!;
      session.total_cost_usd += costUsd;
      if (isTextCall) session.text_cost_usd += costUsd;
      if (isImageCall) session.image_cost_usd += costUsd;
      session.call_count += 1;
      if (!row.success) session.success = false;
      if (!session.generation_options && row.generation_options) {
        session.generation_options = row.generation_options;
      }
      if (row.created_at < session.created_at) {
        session.created_at = row.created_at;
      }
    }

    // 최신순 정렬 후 페이지네이션
    const allSessions = Array.from(sessionMap.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const totalCount = allSessions.length;
    const sessions = allSessions.slice(offset, offset + limit).map(s => ({
      ...s,
      total_cost_krw: s.total_cost_usd * exchangeRate,
      text_cost_krw: s.text_cost_usd * exchangeRate,
      image_cost_krw: s.image_cost_usd * exchangeRate,
    }));

    // 치과 목록 (필터 UI용)
    const clinics = Array.from(clinicNameMap.entries()).map(([id, name]) => ({ id, name }));

    return NextResponse.json({
      sessions,
      totalCount,
      page,
      limit,
      exchangeRate,
      clinics,
    });
  } catch (error) {
    console.error('[API] marketing/costs/sessions GET:', error);
    return NextResponse.json({ error: '세션 비용 조회 실패' }, { status: 500 });
  }
}
