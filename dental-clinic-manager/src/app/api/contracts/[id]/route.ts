/**
 * Employment Contract API Route
 * Handles DELETE operations with service role key to bypass RLS
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Create Supabase client with service role key (server-side only)
const getServiceRoleClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * DELETE /api/contracts/[id]
 * Deletes a cancelled contract (bypasses RLS with service role)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await context.params

    // Get user ID from Authorization header or body
    const authHeader = request.headers.get('authorization')
    const body = await request.json().catch(() => ({}))
    const currentUserId = body.currentUserId || authHeader?.split('Bearer ')[1]

    if (!currentUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[API] Deleting contract:', contractId, 'by user:', currentUserId)

    const supabase = getServiceRoleClient()

    // 1. Verify the contract exists and is cancelled
    const { data: contract, error: fetchError } = await supabase
      .from('employment_contracts')
      .select('id, status, clinic_id')
      .eq('id', contractId)
      .single()

    if (fetchError || !contract) {
      console.error('[API] Failed to fetch contract:', fetchError?.message)
      return NextResponse.json(
        { success: false, error: '계약서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 2. Check if contract is cancelled
    if (contract.status !== 'cancelled') {
      return NextResponse.json(
        { success: false, error: '취소된 계약서만 삭제할 수 있습니다.' },
        { status: 400 }
      )
    }

    // 3. Verify user has permission (owner or manager of the clinic)
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('role, clinic_id')
      .eq('id', currentUserId)
      .single()

    if (userError || !userProfile) {
      console.error('[API] Failed to fetch user:', userError?.message)
      return NextResponse.json(
        { success: false, error: '사용자 정보를 확인할 수 없습니다.' },
        { status: 403 }
      )
    }

    // Check if user is owner/manager of the same clinic
    if (userProfile.clinic_id !== contract.clinic_id) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다.' },
        { status: 403 }
      )
    }

    if (userProfile.role !== 'owner' && userProfile.role !== 'manager') {
      return NextResponse.json(
        { success: false, error: '계약서 삭제 권한이 없습니다. (원장 또는 관리자만 가능)' },
        { status: 403 }
      )
    }

    // 4. Delete the contract (permanent delete with service role - bypasses RLS)
    const { error: deleteError } = await supabase
      .from('employment_contracts')
      .delete()
      .eq('id', contractId)

    if (deleteError) {
      console.error('[API] Failed to delete contract:', deleteError.message)
      return NextResponse.json(
        { success: false, error: '계약서 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    console.log('[API] Contract deleted successfully:', contractId)
    return NextResponse.json({ success: true, error: null })

  } catch (error) {
    console.error('[API] Delete contract error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '계약서 삭제 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}
