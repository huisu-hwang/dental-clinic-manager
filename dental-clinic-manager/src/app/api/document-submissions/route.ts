import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * 문서 제출 관리 API
 * 사직서, 재직증명서 등 문서 제출 및 승인 처리
 */

// GET: 문서 제출 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const userId = searchParams.get('userId')
    const status = searchParams.get('status') // pending, approved, rejected
    const type = searchParams.get('type') // resignation, employment_certificate

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
        approver:users!document_submissions_approved_by_fkey(id, name, role)
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    if (userId) {
      query = query.eq('submitted_by', userId)
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
    const { clinicId, userId, documentType, documentData, signature } = body

    if (!clinicId || !userId || !documentType || !documentData) {
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

    // 문서 제출 생성
    const { data: submission, error: insertError } = await supabaseAdmin
      .from('document_submissions')
      .insert({
        clinic_id: clinicId,
        submitted_by: userId,
        document_type: documentType,
        document_data: documentData,
        employee_signature: signature || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('[API document-submissions] Insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to create submission: ${insertError.message}` },
        { status: 500 }
      )
    }

    // 알림 생성 (원장, 실장에게)
    const documentTypeLabel = documentType === 'resignation' ? '사직서' : '재직증명서'
    const today = new Date().toISOString().split('T')[0]

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
        // 문서 제출 ID 참조
        metadata: { document_submission_id: submission.id }
      })

    return NextResponse.json({ data: submission, success: true })

  } catch (error) {
    console.error('[API document-submissions] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH: 문서 승인/반려 또는 원장 서명
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, userId, submissionId, action, ownerSignature, rejectReason } = body

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
