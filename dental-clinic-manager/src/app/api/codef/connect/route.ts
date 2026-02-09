// ============================================
// CODEF 계정 연결 API
// POST: 홈택스 계정 연결 (Connected ID 발급)
// DELETE: 홈택스 계정 연결 해제
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCodefAccount,
  updateCodefAccount,
  getConnectedIdList,
  deleteCodefAccount,
  isCodefConfigured,
  getCodefServiceType,
  encryptPasswordForStorage,
} from '@/lib/codefService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

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

    // DB에서 기존 연결 정보 확인 (활성/비활성 모두 조회)
    const supabase = getServiceClient();
    const { data: activeConnection } = await supabase
      .from('codef_connections')
      .select('connected_id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    // 비활성 연결도 조회 (연결 해제 후 재연결 시 기존 connectedId 재사용)
    const { data: anyConnection } = await supabase
      .from('codef_connections')
      .select('connected_id')
      .eq('clinic_id', clinicId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    let connectedId: string | null = null;

    // 기존 connectedId가 있으면 (활성이든 비활성이든) updateAccount로 갱신 시도
    const existingConnectedId = activeConnection?.connected_id || anyConnection?.connected_id;

    if (existingConnectedId) {
      console.log('CODEF: 기존 connectedId 발견, updateAccount 시도:', existingConnectedId);
      const updateResult = await updateCodefAccount(existingConnectedId, userId, password, identity);
      console.log('CODEF updateAccount result:', JSON.stringify(updateResult.result));

      if (updateResult.result.code === 'CF-00000') {
        connectedId = existingConnectedId;
      } else {
        // updateAccount 실패 → createAccount 시도
        console.log('CODEF: updateAccount 실패, createAccount 시도');
        const createResult = await createCodefAccount(userId, password, identity);
        console.log('CODEF createAccount result:', JSON.stringify(createResult.result));

        if (createResult.result.code === 'CF-00000') {
          connectedId = createResult.data?.connectedId;
        } else if (createResult.result.code === 'CF-04000') {
          // 이미 등록된 계정 → 기존 connectedId 그대로 재사용
          console.log('CODEF: CF-04000, 기존 connectedId 재사용:', existingConnectedId);
          connectedId = existingConnectedId;
        } else {
          const errorMsg = createResult.result.extraMessage
            ? `${createResult.result.message} (${createResult.result.extraMessage})`
            : createResult.result.message || 'CODEF 계정 연결에 실패했습니다.';
          return NextResponse.json(
            { success: false, error: errorMsg, code: createResult.result.code },
            { status: 400 }
          );
        }
      }
    } else {
      // DB에 연결 이력이 전혀 없으면 새로 생성
      const createResult = await createCodefAccount(userId, password, identity);
      console.log('CODEF createAccount result:', JSON.stringify(createResult.result));

      if (createResult.result.code === 'CF-00000') {
        connectedId = createResult.data?.connectedId;
      } else if (createResult.result.code === 'CF-04000') {
        // DB에 없지만 CODEF에 이미 등록됨 → connectedId 목록에서 조회
        console.log('CODEF: CF-04000, connectedIdList 조회');
        const idListResult = await getConnectedIdList();
        const connectedIds = idListResult.data?.connectedIdList || [];
        console.log('CODEF connectedIdList:', connectedIds);

        if (connectedIds.length > 0) {
          for (const existingId of connectedIds) {
            const updateResult = await updateCodefAccount(existingId, userId, password, identity);
            if (updateResult.result.code === 'CF-00000') {
              connectedId = existingId;
              break;
            }
          }
          if (!connectedId) {
            connectedId = connectedIds[0];
          }
        }

        if (!connectedId) {
          return NextResponse.json(
            {
              success: false,
              error: 'CODEF에 이미 등록된 계정이 있으나, 연결 ID를 찾을 수 없습니다. 관리자에게 문의하세요.',
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
    }

    if (!connectedId) {
      return NextResponse.json(
        { success: false, error: 'Connected ID를 받지 못했습니다.' },
        { status: 500 }
      );
    }

    // 비밀번호 AES 암호화 후 DB 저장 (sync 시 복호화하여 CODEF API 호출)
    const encryptedPw = encryptPasswordForStorage(password);

    // DB에 연결 정보 저장 (service_role로 RLS 우회)
    const { error: dbError } = await supabase
      .from('codef_connections')
      .upsert(
        {
          clinic_id: clinicId,
          connected_id: connectedId,
          hometax_user_id: userId,
          encrypted_password: encryptedPw,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id' }
      );

    if (dbError) {
      console.error('DB save error:', dbError);
      return NextResponse.json(
        { success: false, error: 'CODEF 연결은 성공했으나 DB 저장에 실패했습니다. 다시 시도해주세요.', details: dbError.message },
        { status: 500 }
      );
    }

    const serviceType = getCodefServiceType();

    return NextResponse.json({
      success: true,
      data: {
        connectedId,
        serviceType,
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

    // DB에서 Connected ID 조회 (service_role로 RLS 우회)
    const supabase = getServiceClient();
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

    const supabase = getServiceClient();
    const { data: connection, error } = await supabase
      .from('codef_connections')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    const configured = isCodefConfigured();
    const serviceType = getCodefServiceType();

    if (error || !connection) {
      return NextResponse.json({
        success: true,
        data: {
          isConnected: false,
          connectedId: null,
          lastSyncDate: null,
          isConfigured: configured,
          serviceType,
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
        serviceType,
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
