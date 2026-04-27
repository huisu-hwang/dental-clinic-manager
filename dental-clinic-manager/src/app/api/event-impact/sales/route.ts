// ============================================
// 이벤트 효과 분석 - 일별 매출 조회 API
// GET: DentWeb 브릿지 에이전트를 통해 TB_진료비내역에서 일별 매출 합계 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface DentwebSalesRow {
  day: string;
  total: number | string | null;
}

// GET /api/event-impact/sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date, end_date 필수' },
        { status: 400 }
      );
    }

    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { success: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 사용자 인증 (Supabase SSR 쿠키 기반)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 사용자의 clinic_id 조회
    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json(
        { success: false, error: '클리닉 정보가 없습니다.' },
        { status: 403 }
      );
    }

    const clinicId = userData.clinic_id;

    // DentWeb 연동 활성 확인 + 브릿지 온라인 확인
    const { data: syncConfig } = await supabase
      .from('dentweb_sync_config')
      .select('is_active, last_sync_at')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (!syncConfig?.is_active) {
      return NextResponse.json(
        { success: false, error: 'DentWeb 연동이 비활성화되어 있습니다.' },
        { status: 503 }
      );
    }

    if (syncConfig.last_sync_at) {
      const lastSync = new Date(syncConfig.last_sync_at);
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (lastSync < threeMinutesAgo) {
        return NextResponse.json(
          {
            success: false,
            error: '원내 PC(브릿지 에이전트)가 오프라인 상태입니다. PC가 켜져 있고 에이전트가 실행 중인지 확인하세요.',
          },
          { status: 503 }
        );
      }
    }

    // DentWeb DB에서 일별 매출 조회 (sz진료일 = char(8) YYYYMMDD)
    const startYYYYMMDD = startDate.replace(/-/g, '');
    const endYYYYMMDD = endDate.replace(/-/g, '');

    const sqlQuery = `
      SELECT
        sz진료일 AS day,
        SUM(COALESCE(n공단부담금, 0) + COALESCE(n본인부담금, 0) + COALESCE(n비급여진료비, 0)) AS total
      FROM TB_진료비내역
      WHERE sz진료일 >= '${startYYYYMMDD}' AND sz진료일 <= '${endYYYYMMDD}'
      GROUP BY sz진료일
      ORDER BY sz진료일
    `.trim();

    // 쿼리 요청 INSERT (브릿지 에이전트가 폴링하여 처리)
    const { data: queryReq, error: insertError } = await supabase
      .from('dentweb_query_requests')
      .insert({
        clinic_id: clinicId,
        query_type: 'read',
        query_text: sqlQuery,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !queryReq) {
      return NextResponse.json(
        { success: false, error: `쿼리 요청 실패: ${insertError?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }

    // 결과 폴링 (2초 간격, 최대 30초)
    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { data: result } = await supabase
        .from('dentweb_query_results')
        .select('*')
        .eq('request_id', queryReq.id)
        .maybeSingle();

      if (result) {
        if (result.error_message) {
          return NextResponse.json(
            { success: false, error: result.error_message },
            { status: 500 }
          );
        }

        // 결과 정규화: sz진료일(YYYYMMDD) -> YYYY-MM-DD, total -> amount
        const rows = (result.data as DentwebSalesRow[] | null) ?? [];
        const data = rows
          .filter((r) => typeof r.day === 'string' && r.day.length >= 8)
          .map((r) => ({
            date: `${r.day.slice(0, 4)}-${r.day.slice(4, 6)}-${r.day.slice(6, 8)}`,
            amount: Number(r.total) || 0,
          }));

        return NextResponse.json({ success: true, data });
      }

      // 요청 상태 확인 (error로 변경되었는지)
      const { data: reqStatus } = await supabase
        .from('dentweb_query_requests')
        .select('status')
        .eq('id', queryReq.id)
        .single();

      if (reqStatus?.status === 'error') {
        return NextResponse.json(
          { success: false, error: '쿼리 실행 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }

    // 타임아웃
    await supabase
      .from('dentweb_query_requests')
      .update({ status: 'timeout' })
      .eq('id', queryReq.id);

    return NextResponse.json(
      { success: false, error: '브릿지 에이전트 응답 시간 초과' },
      { status: 504 }
    );
  } catch (error) {
    console.error('[event-impact/sales] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
