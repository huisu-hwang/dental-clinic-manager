/**
 * KIS 잔고 조회 API
 *
 * GET /api/investment/balance
 * 활성 credential의 KIS 계좌 잔고를 조회합니다.
 *
 * 응답:
 * - totalEvaluation: 총 평가금액
 * - totalPnl: 총 손익 (실현 포함)
 * - items: 보유 종목 목록
 * - isPaperTrading: 모의투자 여부
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getKRBalance } from '@/lib/kisApiService'
import { investmentDecrypt } from '@/lib/investmentCrypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // 1. 활성 credential 조회
  const { data: credential, error: credError } = await supabase
    .from('user_broker_credentials')
    .select('id, app_key_encrypted, app_secret_encrypted, account_number_encrypted, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (credError || !credential) {
    return NextResponse.json({ error: '연결된 계좌가 없습니다', hasCredential: false }, { status: 404 })
  }

  try {
    // 2. 암호화된 정보 복호화
    const appKey = investmentDecrypt(credential.app_key_encrypted)
    const appSecret = investmentDecrypt(credential.app_secret_encrypted)
    const accountNumber = investmentDecrypt(credential.account_number_encrypted)

    // 3. 감사 로그 (credential 접근)
    await supabase.from('credential_access_log').insert({
      credential_id: credential.id,
      user_id: userId,
      action: 'decrypt_for_balance',
    })

    // 4. KIS API로 잔고 조회 (국내 기준)
    const balance = await getKRBalance(
      credential.id,
      {
        appKey,
        appSecret,
        isPaperTrading: credential.is_paper_trading,
      },
      accountNumber
    )

    return NextResponse.json({
      success: true,
      data: {
        totalEvaluation: balance.totalEvaluation,
        totalPnl: balance.totalPnl,
        items: balance.items,
        isPaperTrading: credential.is_paper_trading,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '잔고 조회 실패'
    console.error('[balance] 조회 실패:', message)

    // 감사 로그 (실패)
    await supabase.from('credential_access_log').insert({
      credential_id: credential.id,
      user_id: userId,
      action: 'balance_fetch_failed',
    })

    return NextResponse.json({
      error: message,
      hasCredential: true,
    }, { status: 500 })
  }
}
