import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { generateDocumentHash } from '@/utils/documentLegalUtils'

/**
 * 문서 제출 관리 API
 * 사직서, 재직증명서 등 문서 제출 및 승인 처리
 *
 * 법적 효력 요건 (전자서명법, 전자문서법 준수):
 * - 문서 해시(SHA-256)로 무결성 검증
 * - 서명 메타데이터(IP, 디바이스 정보) 저장
 * - 서명 시간 타임스탬프 기록
 */

// GET: 문서 제출 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const userId = searchParams.get('userId')
    const status = searchParams.get('status') // pending, approved, rejected
    const type = searchParams.get('type') // resignation, employment_certificate, recommended_resignation, termination_notice
    const filter = searchParams.get('filter') // 'sent' | 'received' - 보낸 문서 또는 받은 문서 필터

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Missing required parameter: clinicId' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    let query = supabaseAdmin
      .from('document_submissions')
      .select(`
        *,
        submitter:users!document_submissions_submitted_by_fkey(id, name, role),
        approver:users!document_submissions_approved_by_fkey(id, name, role),
        target_employee:users!document_submissions_target_employee_id_fkey(id, name, role)
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    // 보낸 문서/받은 문서 필터
    const isOwnerFilter = searchParams.get('isOwner') === 'true'

    if (filter === 'sent' && userId) {
      // 보낸 문서: 내가 작성한 문서
      query = query.eq('submitted_by', userId)
    } else if (filter === 'received' && userId) {
      if (isOwnerFilter) {
        // 원장이 받은 문서: 직원들이 제출한 사직서/재직증명서 (권고사직서/해고통보서 제외)
        query = query
          .neq('submitted_by', userId)
          .in('document_type', ['resignation', 'employment_certificate'])
      } else {
        // 직원이 받은 문서: 나를 대상으로 한 문서 (권고사직서/해고통보서 등)
        query = query.eq('target_employee_id', userId)
      }
    } else if (userId) {
      // 기존 로직: submitted_by 또는 target_employee_id가 userId인 경우
      query = query.or(`submitted_by.eq.${userId},target_employee_id.eq.${userId}`)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (type) {
      query = query.eq('document_type', type)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API document-submissions] Get error:', error)
      return NextResponse.json(
        { error: `Failed to get submissions: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })

  } catch (error) {
    console.error('[API document-submissions] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: 새 문서 제출
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      clinicId,
      userId,
      documentType,
      documentData,
      signature,
      targetEmployeeId,
      // 법적 효력 요건을 위한 추가 필드
      signatureMetadata,
      legalConsentAgreed
    } = body

    if (!clinicId || !userId || !documentType || !documentData) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // 문서 해시 생성 (무결성 검증용)
    let documentHash: string | null = null
    try {
      documentHash = await generateDocumentHash(documentData)
      console.log('[API document-submissions] Document hash generated:', documentHash?.substring(0, 16) + '...')
    } catch (hashError) {
      console.warn('[API document-submissions] Document hash generation failed:', hashError)
    }

    // 클라이언트 IP 주소 추출
    const forwarded = request.headers.get('x-forwarded-for')
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown'

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // 사용자 검증
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 권고사직서/해고통보서/복지비 지급 확인서는 원장만 작성 가능
    // 이 문서들은 원장이 직원에게 발급하는 문서
    const ownerOnlyTypes = ['recommended_resignation', 'termination_notice', 'welfare_payment']
    if (ownerOnlyTypes.includes(documentType) && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owner can create this document type' },
        { status: 403 }
      )
    }

    // 문서 제출 생성 (법적 효력 요건 포함)
    const submissionData: Record<string, any> = {
      clinic_id: clinicId,
      submitted_by: userId,
      target_employee_id: ownerOnlyTypes.includes(documentType) ? (targetEmployeeId || null) : null,
      document_type: documentType,
      document_data: documentData,
      employee_signature: ownerOnlyTypes.includes(documentType) ? null : (signature || null),
      owner_signature: ownerOnlyTypes.includes(documentType) ? (signature || null) : null,
      status: ownerOnlyTypes.includes(documentType) ? 'approved' : 'pending',
      approved_by: ownerOnlyTypes.includes(documentType) ? userId : null,
      approved_at: ownerOnlyTypes.includes(documentType) ? new Date().toISOString() : null,
      // 법적 효력 요건 필드 (전자서명법 준수)
      document_hash: documentHash,
      signature_ip_address: clientIp,
      signature_device_info: signatureMetadata?.device_info || null,
      signature_user_agent: signatureMetadata?.user_agent || null,
      legal_consent_agreed: legalConsentAgreed ?? true,
      signed_at: signature ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: submission, error: insertError } = await supabaseAdmin
      .from('document_submissions')
      .insert(submissionData)
      .select()
      .single()

    if (insertError) {
      console.error('[API document-submissions] Insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to create submission: ${insertError.message}` },
        { status: 500 }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    // 권고사직서/해고통보서인 경우 대상 직원에게 개인 알림 발송
    if (ownerOnlyTypes.includes(documentType) && targetEmployeeId) {
      // 대상 직원 정보 확인
      const { data: targetEmployee, error: targetError } = await supabaseAdmin
        .from('users')
        .select('id, name, clinic_id, status')
        .eq('id', targetEmployeeId)
        .single()

      if (!targetError && targetEmployee && targetEmployee.clinic_id === clinicId && targetEmployee.status === 'active') {
        if (documentType === 'recommended_resignation') {
          // 권고사직서: 사직서 작성 요청 알림
          await supabaseAdmin
            .from('user_notifications')
            .insert({
              clinic_id: clinicId,
              user_id: targetEmployeeId,
              type: 'document',
              title: '권고사직서가 발송되었습니다',
              content: `원장님이 권고사직서를 발송하였습니다. 내용을 확인하시고, 동의하시는 경우 사직서를 작성하여 제출해 주세요.`,
              link: '/dashboard?tab=documents&view=received',
              reference_type: 'document_submission',
              reference_id: submission.id,
              created_by: userId,
              created_at: new Date().toISOString(),
            })
        } else if (documentType === 'termination_notice') {
          // 해고통보서: 해고 통보 알림
          await supabaseAdmin
            .from('user_notifications')
            .insert({
              clinic_id: clinicId,
              user_id: targetEmployeeId,
              type: 'important',
              title: '해고통보서가 발송되었습니다',
              content: `해고통보서가 발송되었습니다. 문서 양식 메뉴에서 상세 내용을 확인하시기 바랍니다.`,
              link: '/dashboard?tab=documents&view=received',
              reference_type: 'document_submission',
              reference_id: submission.id,
              created_by: userId,
              created_at: new Date().toISOString(),
            })
        } else if (documentType === 'welfare_payment') {
          // 복지비 지급 확인서: 확인 및 서명 요청 알림
          await supabaseAdmin
            .from('user_notifications')
            .insert({
              clinic_id: clinicId,
              user_id: targetEmployeeId,
              type: 'document',
              title: '복지비 지급 확인서가 발송되었습니다',
              content: `복지비 지급 확인서가 발송되었습니다. 내용을 확인하시고 서명해 주세요.`,
              link: '/dashboard?tab=documents&view=received',
              reference_type: 'document_submission',
              reference_id: submission.id,
              created_by: userId,
              created_at: new Date().toISOString(),
            })
        }
      }
    } else if (!ownerOnlyTypes.includes(documentType)) {
      // 기존 사직서/재직증명서: 원장에게 알림
      const documentTypeLabel = documentType === 'resignation' ? '사직서' : '재직증명서'
      const targetRoles = documentType === 'resignation'
        ? ['owner', 'manager'] // 사직서: 원장, 실장
        : ['owner'] // 재직증명서: 원장만

      await supabaseAdmin
        .from('clinic_notifications')
        .insert({
          clinic_id: clinicId,
          created_by: userId,
          title: `${documentTypeLabel} 제출 - ${user.name}`,
          content: `${user.name}님이 ${documentTypeLabel}를 제출했습니다. 확인이 필요합니다.`,
          category: 'important',
          target_roles: targetRoles,
          recurrence_type: 'none',
          start_date: today,
          is_active: true,
          priority: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { document_submission_id: submission.id }
        })
    }

    return NextResponse.json({ data: submission, success: true })

  } catch (error) {
    console.error('[API document-submissions] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH: 문서 승인/반려, 원장 서명, 직원 서명
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, userId, submissionId, action, ownerSignature, employeeSignature, rejectReason } = body

    if (!clinicId || !userId || !submissionId || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // 사용자 권한 검증 (owner만 승인/반려 가능)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 승인/반려는 owner만 가능
    if ((action === 'approve' || action === 'reject') && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owner can approve or reject documents' },
        { status: 403 }
      )
    }

    let updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (action === 'approve') {
      updateData.status = 'approved'
      updateData.approved_by = userId
      updateData.approved_at = new Date().toISOString()
      if (ownerSignature) {
        updateData.owner_signature = ownerSignature
      }
    } else if (action === 'reject') {
      updateData.status = 'rejected'
      updateData.approved_by = userId
      updateData.approved_at = new Date().toISOString()
      updateData.reject_reason = rejectReason || null
    } else if (action === 'sign') {
      // 원장 서명만 추가
      if (user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Only owner can sign documents' },
          { status: 403 }
        )
      }
      updateData.owner_signature = ownerSignature
    } else if (action === 'employee_sign') {
      // 직원 서명 추가 (복지비 지급 확인서 등)
      // 해당 문서의 대상 직원인지 확인
      const { data: submission, error: subError } = await supabaseAdmin
        .from('document_submissions')
        .select('target_employee_id, document_type')
        .eq('id', submissionId)
        .eq('clinic_id', clinicId)
        .single()

      if (subError || !submission) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        )
      }

      // 대상 직원만 서명 가능
      if (submission.target_employee_id !== userId) {
        return NextResponse.json(
          { error: 'Only target employee can sign this document' },
          { status: 403 }
        )
      }

      updateData.employee_signature = employeeSignature
      updateData.signed_at = new Date().toISOString()
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('document_submissions')
      .update(updateData)
      .eq('id', submissionId)
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (updateError) {
      console.error('[API document-submissions] Update error:', updateError)
      return NextResponse.json(
        { error: `Failed to update submission: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API document-submissions] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
