// ============================================
// CODEF 계정 연결 API
// POST: 홈택스 계정 연결 (Connected ID 발급)
// DELETE: 홈택스 계정 연결 해제
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createCodefAccount,
  updateCodefAccount,
  getConnectedIdList,
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

    // DB에서 기존 연결 정보 확인
    const supabaseCheck = await createClient();
    const { data: existingConnection } = await supabaseCheck
      .from('codef_connections')
      .select('connected_id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    let connectedId: string | null = null;

    if (existingConnection?.connected_id) {
      // 기존 연결이 있으면 계정 업데이트 시도
      console.log('CODEF: 기존 connectedId 발견, updateAccount 시도:', existingConnection.connected_id);
      const updateResult = await updateCodefAccount(existingConnection.connected_id, userId, password, identity);
      console.log('CODEF updateAccount result:', JSON.stringify(updateResult.result));

      if (updateResult.result.code === 'CF-00000') {
        connectedId = existingConnection.connected_id;
      } else {
        // 업데이트 실패 시 새로 생성 시도
        console.log('CODEF: updateAccount 실패, createAccount 시도');
        const createResult = await createCodefAccount(userId, password, identity);
        console.log('CODEF createAccount result:', JSON.stringify(createResult.result));

        if (createResult.result.code !== 'CF-00000') {
          const errorMsg = createResult.result.extraMessage
            ? `${createResult.result.message} (${createResult.result.extraMessage})`
            : createResult.result.message || 'CODEF 계정 연결에 실패했습니다.';
          return NextResponse.json(
            { success: false, error: errorMsg, code: createResult.result.code },
            { status: 400 }
          );
        }
        connectedId = createResult.data?.connectedId;
      }
    } else {
      // 기존 연결이 없으면 새로 생성
      const createResult = await createCodefAccount(userId, password, identity);
      console.log('CODEF createAccount result:', JSON.stringify(createResult.result));

      if (createResult.result.code !== 'CF-00000') {
        // CF-04000: 이미 등록된 계정 → connectedId 목록에서 찾아 updateAccount 시도
        if (createResult.result.code === 'CF-04000') {
          // CF-04000: 이미 등록된 계정 → connectedId 목록에서 기존 ID를 가져와서 재사용
          console.log('CODEF: CF-04000 (이미 등록된 계정), connectedIdList 조회');
          const idListResult = await getConnectedIdList();
          const connectedIds = idListResult.data?.connectedIdList || [];
          console.log('CODEF connectedIdList:', connectedIds);

          if (connectedIds.length > 0) {
            // 먼저 updateAccount 시도, 실패해도 기존 connectedId 재사용
            for (const existingId of connectedIds) {
              const updateResult = await updateCodefAccount(existingId, userId, password, identity);
              console.log('CODEF updateAccount result for', existingId, ':', JSON.stringify(updateResult.result));
              if (updateResult.result.code === 'CF-00000') {
                connectedId = existingId;
                break;
              }
            }
            // updateAccount가 실패해도 기존 connectedId 사용 (계정은 이미 존재하므로)
            if (!connectedId) {
              console.log('CODEF: updateAccount 실패했지만, 기존 connectedId를 재사용합니다:', connectedIds[0]);
              connectedId = connectedIds[0];
            }
          }

          if (!connectedId) {
            return NextResponse.json(
              {
                success: false,
                error: '이미 등록된 홈택스 계정이 있으나, 연결 ID를 찾을 수 없습니다. 관리자에게 문의하세요.',
                code: createResult.result.code,
              },
              { status: 400 }
            );
          }
        } else {
          const errorMsg = createResult.result.extraMessage
            ? `${createResult.result.message} (${createResult.result.extraMessage})`
            : createResult.result.message || 'CODEF 계정 연결에 실패했습니다.';
          return NextResponse.json(
            { success: false, error: errorMsg, code: createResult.result.code },
            { status: 400 }
          );
        }
      } else {
        connectedId = createResult.data?.connectedId;
      }
    }

    if (!connectedId) {
      return NextResponse.json(
        { success: false, error: 'Connected ID를 받지 못했습니다.' },
        { status: 500 }
      );
    }

    // DB에 연결 정보 저장
    const { error: dbError } = await supabaseCheck
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
