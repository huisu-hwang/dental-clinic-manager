import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST: 브릿지 에이전트에서 DentWeb DB 스키마 수신
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, schema_data, writable_tables } = body

    if (!clinic_id || !api_key || !schema_data) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinic_id, api_key, schema_data)' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // API 키 인증
    const { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: '인증 실패: 유효하지 않은 API 키입니다.' },
        { status: 401 }
      )
    }

    if (!config.is_active) {
      return NextResponse.json(
        { success: false, error: '동기화가 비활성화되어 있습니다.' },
        { status: 403 }
      )
    }

    // 스키마 캐시 UPSERT (clinic_id 기준)
    const { error: upsertError } = await supabase
      .from('dentweb_schema_cache')
      .upsert(
        {
          clinic_id,
          schema_data,
          writable_tables: writable_tables || [],
          discovered_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id' }
      )

    if (upsertError) {
      console.error('[dentweb/schema] Failed to upsert schema:', upsertError)
      return NextResponse.json(
        { success: false, error: `스키마 저장 실패: ${upsertError.message}` },
        { status: 500 }
      )
    }

    const tableCount = schema_data?.tables?.length || 0

    return NextResponse.json({
      success: true,
      table_count: tableCount,
      writable_table_count: (writable_tables || []).length,
    })
  } catch (error) {
    console.error('[dentweb/schema] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
