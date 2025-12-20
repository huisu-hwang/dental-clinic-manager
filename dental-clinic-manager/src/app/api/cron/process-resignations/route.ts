import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * 퇴사 처리 크론 작업 API
 *
 * 사직서, 권고사직서, 해고통보서의 퇴사일이 경과된 직원을 자동으로
 * 해당 병원의 직원 목록에서 제외(상태를 'resigned'로 변경)합니다.
 *
 * 매일 자정(한국시간 00:00)에 실행됩니다.
 */

// Vercel Cron Job용 인증
const CRON_SECRET = process.env.CRON_SECRET

interface DocumentSubmission {
  id: string
  clinic_id: string
  submitted_by: string
  target_employee_id: string | null
  document_type: string
  document_data: Record<string, unknown>
  status: string
}

interface UserInfo {
  id: string
  name: string
  status: string
}

export async function GET(request: NextRequest) {
  try {
    // Vercel Cron 인증 확인 (production 환경에서만)
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        console.error('[Cron process-resignations] Unauthorized access attempt')
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD 형식
    console.log(`[Cron process-resignations] Processing resignations for date: ${today}`)

    // 1. 승인된 사직서 조회
    const { data: resignations, error: resignationError } = await supabaseAdmin
      .from('document_submissions')
      .select('id, clinic_id, submitted_by, target_employee_id, document_type, document_data, status')
      .eq('document_type', 'resignation')
      .eq('status', 'approved')

    if (resignationError) {
      console.error('[Cron process-resignations] Error fetching resignations:', resignationError)
      return NextResponse.json(
        { error: `Failed to fetch resignations: ${resignationError.message}` },
        { status: 500 }
      )
    }

    // 2. 승인된 권고사직서 조회
    const { data: recommendedResignations, error: recommendedError } = await supabaseAdmin
      .from('document_submissions')
      .select('id, clinic_id, submitted_by, target_employee_id, document_type, document_data, status')
      .eq('document_type', 'recommended_resignation')
      .eq('status', 'approved')

    if (recommendedError) {
      console.error('[Cron process-resignations] Error fetching recommended resignations:', recommendedError)
      return NextResponse.json(
        { error: `Failed to fetch recommended resignations: ${recommendedError.message}` },
        { status: 500 }
      )
    }

    // 3. 승인된 해고통보서 조회
    const { data: terminations, error: terminationError } = await supabaseAdmin
      .from('document_submissions')
      .select('id, clinic_id, submitted_by, target_employee_id, document_type, document_data, status')
      .eq('document_type', 'termination_notice')
      .eq('status', 'approved')

    if (terminationError) {
      console.error('[Cron process-resignations] Error fetching terminations:', terminationError)
      return NextResponse.json(
        { error: `Failed to fetch terminations: ${terminationError.message}` },
        { status: 500 }
      )
    }

    const processedEmployees: { id: string; name: string; type: string; resignationDate: string }[] = []
    const errors: string[] = []

    // 사용자 정보 조회 헬퍼 함수
    async function getUserInfo(userId: string): Promise<UserInfo | null> {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, status')
        .eq('id', userId)
        .single()

      if (error || !data) return null
      return data as UserInfo
    }

    // 사직서 처리 - 직원이 직접 제출한 경우 (submitted_by가 퇴사 대상)
    for (const doc of (resignations as DocumentSubmission[]) || []) {
      const documentData = doc.document_data as { resignationDate?: string }
      const resignationDate = documentData?.resignationDate

      if (!resignationDate) continue

      // 퇴사일이 오늘 이전인지 확인
      if (resignationDate <= today) {
        const submitter = await getUserInfo(doc.submitted_by)

        // 이미 resigned 상태이거나 active가 아닌 경우 스킵
        if (!submitter || submitter.status !== 'active') continue

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            status: 'resigned',
            updated_at: new Date().toISOString()
          })
          .eq('id', submitter.id)
          .eq('clinic_id', doc.clinic_id)

        if (updateError) {
          console.error(`[Cron process-resignations] Error updating user ${submitter.id}:`, updateError)
          errors.push(`Failed to update user ${submitter.name}: ${updateError.message}`)
        } else {
          console.log(`[Cron process-resignations] Successfully processed resignation for: ${submitter.name}`)
          processedEmployees.push({
            id: submitter.id,
            name: submitter.name,
            type: 'resignation',
            resignationDate
          })
        }
      }
    }

    // 권고사직서 처리 - 대상 직원(target_employee_id)이 퇴사 대상
    for (const doc of (recommendedResignations as DocumentSubmission[]) || []) {
      const documentData = doc.document_data as { expectedResignationDate?: string }
      const expectedResignationDate = documentData?.expectedResignationDate

      if (!expectedResignationDate || !doc.target_employee_id) continue

      // 예정 퇴직일이 오늘 이전인지 확인
      if (expectedResignationDate <= today) {
        const targetEmployee = await getUserInfo(doc.target_employee_id)

        // 이미 resigned 상태이거나 active가 아닌 경우 스킵
        if (!targetEmployee || targetEmployee.status !== 'active') continue

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            status: 'resigned',
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.target_employee_id)
          .eq('clinic_id', doc.clinic_id)

        if (updateError) {
          console.error(`[Cron process-resignations] Error updating user ${doc.target_employee_id}:`, updateError)
          errors.push(`Failed to update user ${targetEmployee.name}: ${updateError.message}`)
        } else {
          console.log(`[Cron process-resignations] Successfully processed recommended resignation for: ${targetEmployee.name}`)
          processedEmployees.push({
            id: targetEmployee.id,
            name: targetEmployee.name,
            type: 'recommended_resignation',
            resignationDate: expectedResignationDate
          })
        }
      }
    }

    // 해고통보서 처리 - 대상 직원(target_employee_id)이 해고 대상
    for (const doc of (terminations as DocumentSubmission[]) || []) {
      const documentData = doc.document_data as { terminationDate?: string }
      const terminationDate = documentData?.terminationDate

      if (!terminationDate || !doc.target_employee_id) continue

      // 해고일이 오늘 이전인지 확인
      if (terminationDate <= today) {
        const targetEmployee = await getUserInfo(doc.target_employee_id)

        // 이미 resigned 상태이거나 active가 아닌 경우 스킵
        if (!targetEmployee || targetEmployee.status !== 'active') continue

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            status: 'resigned',
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.target_employee_id)
          .eq('clinic_id', doc.clinic_id)

        if (updateError) {
          console.error(`[Cron process-resignations] Error updating user ${doc.target_employee_id}:`, updateError)
          errors.push(`Failed to update user ${targetEmployee.name}: ${updateError.message}`)
        } else {
          console.log(`[Cron process-resignations] Successfully processed termination for: ${targetEmployee.name}`)
          processedEmployees.push({
            id: targetEmployee.id,
            name: targetEmployee.name,
            type: 'termination_notice',
            resignationDate: terminationDate
          })
        }
      }
    }

    const result = {
      success: true,
      processedDate: today,
      totalProcessed: processedEmployees.length,
      processedEmployees,
      errors: errors.length > 0 ? errors : undefined
    }

    console.log(`[Cron process-resignations] Completed. Processed ${processedEmployees.length} employees.`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Cron process-resignations] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
