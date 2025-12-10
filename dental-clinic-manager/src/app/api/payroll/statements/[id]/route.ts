/**
 * 급여 명세서 상세 API
 * GET: 특정 급여 명세서 조회
 * PATCH: 급여 명세서 상태 업데이트 (확정, 열람 등)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from('payroll_statements')
      .select(`
        *,
        employee:users!employee_user_id(id, name, email, phone, role)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Get payroll statement error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Statement not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Get payroll statement error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await request.json()
    const { action, current_user_id } = body

    if (!action) {
      return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 })
    }

    let updateData: Record<string, any> = {}

    switch (action) {
      case 'confirm':
        updateData = {
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: current_user_id
        }
        break
      case 'viewed':
        updateData = {
          status: 'viewed',
          viewed_at: new Date().toISOString()
        }
        break
      case 'sent':
        updateData = {
          status: 'sent',
          sent_at: new Date().toISOString()
        }
        break
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('payroll_statements')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        employee:users!employee_user_id(id, name, email, phone, role)
      `)
      .single()

    if (error) {
      console.error('Update payroll statement error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Update payroll statement error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
