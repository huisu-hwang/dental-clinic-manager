// ============================================
// CODEF 계정 연결 API
// POST: 홈택스 계정 연결 (Connected ID 발급)
// DELETE: 홈택스 계정 연결 해제
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createCodefAccount,
  deleteCodefAccount,
  isCodefConfigured,
} from '@/lib/codefService';

// POST: 홈택스 계정 연결
export async function POST(request: NextRequest) {
  try {
    // CODEF 설정 확인
    if (!isCodefConfigured()) {
      return NextResponse.json(
        { success: false, error: 'CODEF API가 설정되지 않았습니다. 환경변수를 확인하세요.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { clinicId, userId, password, identity } = body;

    if (!clinicId || !userId || !password || !identity) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinicId, userId, password, identity)' },
        { status: 400 }
      );
    }

    // CODEF 계정 등록 (identity: 대표자 생년월일 6자리 또는 사업자등록번호)
    const result = await createCodefAccount(userId, password, identity);

    if (result.result.code !== 'CF-00000') {
      return NextResponse.json(
        {
          success: false,
          error: result.result.message || 'CODEF 계정 연결에 실패했습니다.',
          code: result.result.code,
        },
        { status: 400 }
      );
    }

    const connectedId = result.data?.connectedId;

    if (!connectedId) {
      return NextResponse.json(
        { success: false, error: 'Connected ID를 받지 못했습니다.' },
        { status: 500 }
      );
    }

    // DB에 연결 정보 저장
    const supabase = await createClient();
    const { error: dbError } = await supabase
      .from('codef_connections')
      .upsert(
        {
          clinic_id: clinicId,
          connected_id: connectedId,
          hometax_user_id: userId,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id' }
      );

    if (dbError) {
      console.error('DB save error:', dbError);
      // DB 저장 실패해도 연결은 성공한 것으로 처리
    }

    return NextResponse.json({
      success: true,
      data: {
        connectedId,
        message: '홈택스 계정이 성공적으로 연결되었습니다.',
      },
    });
  } catch (error) {
    console.error('CODEF connect error:', error);
    return NextResponse.json(
      { success: false, error: '홈택스 계정 연결 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 홈택스 계정 연결 해제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId가 필요합니다.' },
        { status: 400 }
      );
    }

    // DB에서 Connected ID 조회
    const supabase = await createClient();
    const { data: connection, error: fetchError } = await supabase
      .from('codef_connections')
      .select('connected_id')
      .eq('clinic_id', clinicId)
      .single();

    if (fetchError || !connection?.connected_id) {
      return NextResponse.json(
        { success: false, error: '연결된 홈택스 계정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // CODEF 계정 삭제
    const result = await deleteCodefAccount(connection.connected_id);

    if (result.result.code !== 'CF-00000') {
      console.warn('CODEF delete warning:', result.result);
      // CODEF 삭제 실패해도 DB에서는 삭제 진행
    }

    // DB에서 연결 정보 삭제 (soft delete)
    const { error: dbError } = await supabase
      .from('codef_connections')
      .update({
        is_active: false,
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId);

    if (dbError) {
      console.error('DB delete error:', dbError);
    }

    return NextResponse.json({
      success: true,
      message: '홈택스 계정 연결이 해제되었습니다.',
    });
  } catch (error) {
    console.error('CODEF disconnect error:', error);
    return NextResponse.json(
      { success: false, error: '홈택스 계정 연결 해제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// GET: 연결 상태 확인
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: connection, error } = await supabase
      .from('codef_connections')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    const configured = isCodefConfigured();

    if (error || !connection) {
      return NextResponse.json({
        success: true,
        data: {
          isConnected: false,
          connectedId: null,
          lastSyncDate: null,
          isConfigured: configured,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        isConnected: true,
        connectedId: connection.connected_id,
        hometaxUserId: connection.hometax_user_id,
        connectedAt: connection.connected_at,
        lastSyncDate: connection.last_sync_date,
        isConfigured: configured,
      },
    });
  } catch (error) {
    console.error('CODEF status error:', error);
    return NextResponse.json(
      { success: false, error: '연결 상태 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
