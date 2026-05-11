// 원장용 직원 승인 API — 인원 상한 가드 포함
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { aligoFetch } from '@/lib/aligoFetch'
import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
} from '@/lib/billingService'
import { findPlanByHeadcount, requiresUpgrade } from '@/lib/subscriptionPlans'

const FREE_LIMIT = 4
const ALIGO_API_URL = 'https://apis.aligo.in'

function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^0-9]/g, '')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.userIds)
    ? body.userIds.filter((x: unknown): x is string => typeof x === 'string')
    : body.userId
      ? [body.userId as string]
      : []
  const permissions: string[] | undefined = Array.isArray(body.permissions) ? body.permissions : undefined

  if (ids.length === 0) {
    return NextResponse.json({ error: 'NO_USER_IDS' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (meErr || !me) {
    return NextResponse.json({ error: 'NO_USER' }, { status: 403 })
  }
  if (!['owner', 'master_admin'].includes(me.role as string)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const isMaster = me.role === 'master_admin'
  // 일반 owner 는 본인 clinic 의 직원만 승인 가능하므로 clinic_id 필수.
  // master_admin 은 전체 서비스의 신규 가입(특히 다른 clinic 의 owner)을 승인하는 권한이므로 clinic_id 없어도 통과.
  if (!isMaster && !me.clinic_id) {
    return NextResponse.json({ error: 'NO_CLINIC' }, { status: 403 })
  }

  // 인원 상한 가드: owner 가 자기 직원을 승인하는 경우에만 본인 clinic 한도로 검사한다.
  // master_admin 은 다른 clinic 의 owner 를 승인하는 행위라 본인 clinic 한도 검사가 의미 없음.
  // (승인 대상 clinic 별 한도는 그 clinic 의 owner 가 자기 직원을 승인할 때 다시 검사됨)
  if (!isMaster) {
    const [activeCount, subscription] = await Promise.all([
      countActiveEmployees(me.clinic_id as string),
      getSubscription(me.clinic_id as string),
    ])
    const currentPlan = subscription?.plan_id ? await getPlanById(subscription.plan_id) : null
    const currentLimit = currentPlan?.max_users ?? FREE_LIMIT

    if (
      requiresUpgrade({
        currentActive: activeCount,
        pendingToApprove: ids.length,
        currentLimit,
      })
    ) {
      const projected = activeCount + ids.length
      return NextResponse.json(
        {
          error: 'UPGRADE_REQUIRED',
          currentPlan: currentPlan?.name ?? 'free',
          currentLimit,
          currentActive: activeCount,
          pendingToApprove: ids.length,
          recommendedPlan: findPlanByHeadcount(projected),
        },
        { status: 403 },
      )
    }
  }

  // 승인 실행 (pending → active)
  const updatePayload: Record<string, unknown> = {
    status: 'active',
    approved_at: new Date().toISOString(),
  }
  if (permissions && permissions.length > 0) {
    updatePayload.permissions = permissions
  }

  // master_admin 은 어떤 clinic 의 사용자든 승인 가능, owner 는 본인 clinic 의 사용자만.
  let q = supabase.from('users').update(updatePayload).in('id', ids)
  if (!isMaster) {
    q = q.eq('clinic_id', me.clinic_id as string)
  }
  const { error: upErr } = await q

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // 승인 안내 SMS — 승인된 owner 에게 가입 승인 완료를 알린다. 실패해도 승인 자체에는 영향 없음.
  // (현재는 owner 한정. 마스터의 책임 영역이 owner 가입 승인이라 사용자 요청에 맞춰 한정.)
  try {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data: approvedUsers } = await admin
        .from('users')
        .select('id, name, phone, role, clinic_id, clinic:clinics(name)')
        .in('id', ids)
        .eq('status', 'active')

      const targets = (approvedUsers ?? [])
        .filter((u: any) => u.role === 'owner')
        .map((u: any) => ({ ...u, phone: normalizePhone(u.phone) }))
        .filter((u: any) => u.phone.length >= 10)

      if (targets.length > 0) {
        // 발송용 알리고 설정: 승인자(me) clinic → 시스템 첫 활성 폴백
        let aligo: { api_key: string; user_id: string; sender_number: string } | null = null
        if (me.clinic_id) {
          const { data } = await admin
            .from('aligo_settings')
            .select('api_key, user_id, sender_number')
            .eq('clinic_id', me.clinic_id)
            .maybeSingle()
          if (data?.api_key && data?.user_id && data?.sender_number) aligo = data as any
        }
        if (!aligo) {
          const { data } = await admin
            .from('aligo_settings')
            .select('api_key, user_id, sender_number')
            .not('api_key', 'is', null)
            .not('user_id', 'is', null)
            .not('sender_number', 'is', null)
            .limit(1)
            .maybeSingle()
          if (data?.api_key && data?.user_id && data?.sender_number) aligo = data as any
        }

        if (aligo) {
          const origin =
            process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || ''
          const loginUrl = origin ? `${origin}/` : ''

          await Promise.all(
            targets.map(async (u: any) => {
              const clinicName = (u.clinic?.name as string | undefined) ?? ''
              const message =
                `[클리닉매니저] 안녕하세요 ${u.name}님,\n` +
                `${clinicName ? `${clinicName} ` : ''}대표원장 가입이 승인되었습니다.\n` +
                `지금 로그인하여 서비스를 이용해주세요.` +
                (loginUrl ? `\n${loginUrl}` : '')
              const msgBytes = new Blob([message]).size
              const actualType = msgBytes > 90 ? 'LMS' : 'SMS'

              const params = new URLSearchParams()
              params.append('key', aligo!.api_key)
              params.append('user_id', aligo!.user_id)
              params.append('sender', aligo!.sender_number)
              params.append('receiver', u.phone)
              params.append('msg', message)
              params.append('msg_type', actualType)
              if (actualType !== 'SMS') params.append('title', '가입 승인 안내')
              if (process.env.NODE_ENV === 'development') params.append('testmode_yn', 'Y')

              try {
                const r = await aligoFetch(`${ALIGO_API_URL}/send/`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: params.toString(),
                })
                const j = (await r.json().catch(() => ({}))) as { result_code?: string | number; message?: string }
                if (process.env.NODE_ENV !== 'production') {
                  console.log('[approve sms]', u.id, j)
                }
              } catch (smsErr) {
                console.warn('[approve] sms send failed (non-blocking):', smsErr)
              }
            }),
          )
        }
      }
    }
  } catch (notifyErr) {
    console.warn('[approve] approval-sms flow error (non-blocking):', notifyErr)
  }

  return NextResponse.json({ success: true, approvedCount: ids.length })
}
