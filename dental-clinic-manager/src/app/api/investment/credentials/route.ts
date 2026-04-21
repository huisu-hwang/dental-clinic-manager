import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentEncrypt, investmentDecrypt } from '@/lib/investmentCrypto'

/**
 * POST: KIS 계좌 등록
 * - 1인 1계좌 제한 (활성 credential이 이미 있으면 차단)
 * - AES-256-GCM 필드별 암호화 저장
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { appKey, appSecret, accountNumber, isPaperTrading, label } = body

    // 입력 검증
    if (!appKey || !appSecret || !accountNumber) {
      return NextResponse.json({ error: 'AppKey, AppSecret, 계좌번호가 필요합니다.' }, { status: 400 })
    }

    if (typeof appKey !== 'string' || appKey.length < 10 || appKey.length > 100) {
      return NextResponse.json({ error: 'AppKey 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    if (typeof appSecret !== 'string' || appSecret.length < 10 || appSecret.length > 200) {
      return NextResponse.json({ error: 'AppSecret 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
    }

    // 1인 1계좌 제한: 이미 활성 credential이 있는지 확인
    const { data: existing } = await supabase
      .from('user_broker_credentials')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: '이미 연결된 계좌가 있습니다. 기존 계좌를 해제한 후 등록하세요.' },
        { status: 409 }
      )
    }

    // 필드별 암호화 (각 필드마다 고유 IV 생성)
    const encryptedAccountNumber = investmentEncrypt(accountNumber)
    const encryptedAppKey = investmentEncrypt(appKey)
    const encryptedAppSecret = investmentEncrypt(appSecret)

    // DB 저장
    const { data, error } = await supabase
      .from('user_broker_credentials')
      .insert({
        user_id: auth.user.id,
        broker: 'KIS',
        account_number_encrypted: encryptedAccountNumber,
        app_key_encrypted: encryptedAppKey,
        app_secret_encrypted: encryptedAppSecret,
        encryption_version: 1,
        is_paper_trading: isPaperTrading !== false,
        is_active: true,
        label: label || null,
      })
      .select('id, broker, is_paper_trading, is_active, label, created_at')
      .single()

    if (error) {
      console.error('[API investment/credentials] 저장 실패:', error.message)
      return NextResponse.json({ error: '계좌 등록에 실패했습니다.' }, { status: 500 })
    }

    // 감사 로그
    await supabase.from('investment_audit_logs').insert({
      user_id: auth.user.id,
      action: 'credential_registered',
      resource_type: 'credential',
      resource_id: data.id,
      status: 'success',
      metadata: { broker: 'KIS', isPaperTrading: isPaperTrading !== false },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        accountNumberMasked: '****' + accountNumber.slice(-4),
      },
    })
  } catch (error) {
    console.error('[API investment/credentials] POST error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * GET: 내 계좌 조회 (암호화 데이터 미반환, 마스킹된 정보만)
 */
export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('user_broker_credentials')
      .select('id, broker, account_number_encrypted, is_paper_trading, is_active, label, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[API investment/credentials] 조회 실패:', error.message)
      return NextResponse.json({ error: '계좌 조회에 실패했습니다.' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: true, data: null })
    }

    // 계좌번호 마스킹 (끝 4자리만 표시)
    let accountNumberMasked = '****'
    try {
      const accountNumber = investmentDecrypt(data.account_number_encrypted)
      accountNumberMasked = '****' + accountNumber.slice(-4)
    } catch {
      accountNumberMasked = '****'
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        broker: data.broker,
        accountNumberMasked,
        isPaperTrading: data.is_paper_trading,
        isActive: data.is_active,
        label: data.label,
        createdAt: data.created_at,
      },
    })
  } catch (error) {
    console.error('[API investment/credentials] GET error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE: 계좌 해제 (soft-delete)
 * - 활성 전략, 미체결 주문, 보유 포지션 확인 후 차단
 */
export async function DELETE() {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
    }

    // 활성 credential 조회
    const { data: credential } = await supabase
      .from('user_broker_credentials')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!credential) {
      return NextResponse.json({ error: '연결된 계좌가 없습니다.' }, { status: 404 })
    }

    // 활성 전략 확인
    const { count: activeStrategies } = await supabase
      .from('investment_strategies')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .eq('is_active', true)

    if (activeStrategies && activeStrategies > 0) {
      return NextResponse.json(
        { error: `활성 전략이 ${activeStrategies}개 있습니다. 먼저 전략을 비활성화하세요.` },
        { status: 409 }
      )
    }

    // 미체결 주문 확인
    const { count: pendingOrders } = await supabase
      .from('trade_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .in('status', ['pending', 'submitted', 'partially_filled'])

    if (pendingOrders && pendingOrders > 0) {
      return NextResponse.json(
        { error: `미체결 주문이 ${pendingOrders}건 있습니다. 주문이 완료된 후 해제하세요.` },
        { status: 409 }
      )
    }

    // 보유 포지션 확인
    const { count: openPositions } = await supabase
      .from('positions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .eq('status', 'open')

    if (openPositions && openPositions > 0) {
      return NextResponse.json(
        { error: `보유 포지션이 ${openPositions}건 있습니다. 포지션을 청산한 후 해제하세요.` },
        { status: 409 }
      )
    }

    // Soft-delete
    const { error } = await supabase
      .from('user_broker_credentials')
      .update({ is_active: false })
      .eq('id', credential.id)

    if (error) {
      console.error('[API investment/credentials] 해제 실패:', error.message)
      return NextResponse.json({ error: '계좌 해제에 실패했습니다.' }, { status: 500 })
    }

    // 감사 로그
    await supabase.from('investment_audit_logs').insert({
      user_id: auth.user.id,
      action: 'credential_deactivated',
      resource_type: 'credential',
      resource_id: credential.id,
      status: 'success',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API investment/credentials] DELETE error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
