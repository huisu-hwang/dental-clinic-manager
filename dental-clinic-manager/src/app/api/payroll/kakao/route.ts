/**
 * 카카오톡 알림 발송 API
 * POST: 급여 명세서 카카오톡 알림 발송
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await request.json()
    const { statement_id, phone_number, current_user_id, bulk, clinic_id, year, month } = body

    // 일괄 발송
    if (bulk && clinic_id && year && month) {
      return handleBulkSend(supabase, clinic_id, year, month, current_user_id)
    }

    // 개별 발송
    if (!statement_id || !phone_number) {
      return NextResponse.json(
        { success: false, error: 'statement_id and phone_number are required' },
        { status: 400 }
      )
    }

    // 명세서 조회
    const { data: statement, error: statementError } = await supabase
      .from('payroll_statements')
      .select(`
        *,
        employee:users!employee_user_id(name)
      `)
      .eq('id', statement_id)
      .single()

    if (statementError || !statement) {
      return NextResponse.json(
        { success: false, error: '급여 명세서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 메시지 내용 생성
    const employeeName = (statement.employee as any)?.name || '직원'
    const messageContent = generateMessageContent(statement, employeeName)

    // 실제 카카오톡 발송 로직 (외부 API 연동 필요)
    // 여기서는 발송 로그만 기록
    const { data: log, error: logError } = await supabase
      .from('payroll_kakao_logs')
      .insert({
        payroll_statement_id: statement_id,
        phone_number,
        message_content: messageContent,
        status: 'sent', // 실제로는 API 호출 후 결과에 따라 설정
        sent_at: new Date().toISOString(),
        created_by: current_user_id
      })
      .select()
      .single()

    if (logError) {
      console.error('Create kakao log error:', logError)
      return NextResponse.json({ success: false, error: logError.message }, { status: 500 })
    }

    // 명세서 상태 업데이트
    await supabase
      .from('payroll_statements')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', statement_id)

    return NextResponse.json({
      success: true,
      log,
      message: '카카오톡 알림이 발송되었습니다.'
    })
  } catch (error) {
    console.error('Send kakao notification error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function handleBulkSend(
  supabase: any,
  clinicId: string,
  year: number,
  month: number,
  currentUserId: string
) {
  try {
    // 확정된 명세서 중 카카오톡 발송이 활성화된 직원만 조회
    const { data: statements, error: statementsError } = await supabase
      .from('payroll_statements')
      .select(`
        id,
        employee_user_id,
        payment_year,
        payment_month,
        total_earnings,
        total_deductions,
        net_pay,
        employee:users!employee_user_id(name),
        payroll_setting:payroll_settings!payroll_setting_id(
          kakao_notification_enabled,
          kakao_phone_number
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('payment_year', year)
      .eq('payment_month', month)
      .eq('status', 'confirmed')

    if (statementsError) {
      return NextResponse.json({ success: false, error: statementsError.message }, { status: 500 })
    }

    let sentCount = 0
    let failedCount = 0
    let skippedCount = 0

    for (const statement of statements || []) {
      const setting = statement.payroll_setting as any

      if (!setting?.kakao_notification_enabled || !setting?.kakao_phone_number) {
        skippedCount++
        continue
      }

      const employeeName = (statement.employee as any)?.name || '직원'
      const messageContent = generateMessageContent(statement, employeeName)

      try {
        // 발송 로그 생성
        const { error: logError } = await supabase
          .from('payroll_kakao_logs')
          .insert({
            payroll_statement_id: statement.id,
            phone_number: setting.kakao_phone_number,
            message_content: messageContent,
            status: 'sent',
            sent_at: new Date().toISOString(),
            created_by: currentUserId
          })

        if (!logError) {
          // 명세서 상태 업데이트
          await supabase
            .from('payroll_statements')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', statement.id)

          sentCount++
        } else {
          failedCount++
        }
      } catch {
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      skippedCount,
      message: `${sentCount}건 발송 완료, ${failedCount}건 실패, ${skippedCount}건 건너뜀`
    })
  } catch (error) {
    console.error('Bulk send error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function generateMessageContent(statement: any, employeeName: string): string {
  return `[급여 명세서 안내]

${employeeName}님의 ${statement.payment_year}년 ${statement.payment_month}월 급여 명세서가 발급되었습니다.

총 지급액: ${Number(statement.total_earnings).toLocaleString()}원
공제 합계: ${Number(statement.total_deductions).toLocaleString()}원
실수령액: ${Number(statement.net_pay).toLocaleString()}원

자세한 내용은 치과 관리 시스템에서 확인해 주세요.`
}
