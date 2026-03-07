import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { getBridgeAgentFiles, generateEnvContent } from '@/lib/bridgeAgentFiles'

// 브릿지 에이전트 ZIP 다운로드 (설치파일 + 설정파일 통합)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    // 사용자의 clinic_id 조회
    const { data: staffData } = await supabase
      .from('staff')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single()

    if (!staffData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const clinicId = staffData.clinic_id

    // dentweb_sync_config에서 API 키 조회 (없으면 생성)
    let { data: configData } = await supabase
      .from('dentweb_sync_config')
      .select('*')
      .eq('clinic_id', clinicId)
      .single()

    let apiKey = configData?.api_key

    // 설정이 없으면 생성
    if (!configData) {
      apiKey = `dw_${crypto.randomUUID().replace(/-/g, '')}`
      const { data: newConfig, error: insertError } = await supabase
        .from('dentweb_sync_config')
        .insert({
          clinic_id: clinicId,
          is_active: true,
          api_key: apiKey,
          sync_interval_seconds: 300,
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json({ error: '설정 생성에 실패했습니다.' }, { status: 500 })
      }
      configData = newConfig
    }

    // API 키가 없으면 생성
    if (!apiKey) {
      apiKey = `dw_${crypto.randomUUID().replace(/-/g, '')}`
      await supabase
        .from('dentweb_sync_config')
        .update({ api_key: apiKey })
        .eq('clinic_id', clinicId)
    }

    // 동기화 비활성이면 자동 활성화
    if (configData && !configData.is_active) {
      await supabase
        .from('dentweb_sync_config')
        .update({ is_active: true })
        .eq('clinic_id', clinicId)
    }

    const syncInterval = configData?.sync_interval_seconds || 300

    // ZIP 생성
    const zip = new JSZip()

    // 브릿지 에이전트 소스 파일 추가
    const files = getBridgeAgentFiles()
    for (const file of files) {
      zip.file(file.path, file.content)
    }

    // .env 설정 파일 추가 (클리닉별 자동 설정)
    const envContent = generateEnvContent({
      clinicId,
      apiKey: apiKey!,
      syncInterval,
    })
    zip.file('dentweb-bridge-agent/.env', envContent)

    // ZIP 생성
    const zipArrayBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })

    // 응답
    return new NextResponse(zipArrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="dentweb-bridge-agent.zip"',
        'Content-Length': zipArrayBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('Bridge agent download error:', error)
    return NextResponse.json(
      { error: '다운로드 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
