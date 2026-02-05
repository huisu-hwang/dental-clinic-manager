// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.0.0'

console.log("[send-approval-email] Edge Function initialized")

Deno.serve(async (req) => {
  try {
    // 환경 변수 확인
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://hi-clinic.co.kr'

    if (!resendApiKey) {
      console.error("[send-approval-email] Missing RESEND_API_KEY")
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[send-approval-email] Missing Supabase credentials")
      return new Response(
        JSON.stringify({ error: 'Missing Supabase credentials' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    // 요청 바디에서 userId, clinicId 추출
    const { userId, clinicId } = await req.json()

    if (!userId || !clinicId) {
      console.error("[send-approval-email] Missing userId or clinicId")
      return new Response(
        JSON.stringify({ error: 'userId and clinicId are required' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log(`[send-approval-email] Processing approval for user: ${userId}, clinic: ${clinicId}`)

    // Supabase 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 사용자 정보 조회 (이메일 발송용)
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('email, name, clinics(name)')
      .eq('id', userId)
      .eq('clinic_id', clinicId)
      .single()

    if (fetchError || !userData) {
      console.error("[send-approval-email] Error fetching user:", fetchError)
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log(`[send-approval-email] User data fetched:`, userData.email)

    // Resend 클라이언트 생성
    const resend = new Resend(resendApiKey)
    const clinicName = (userData.clinics as any)?.name || '클리닉 매니저'

    // 승인 완료 이메일 발송
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'ClinicManager <noreply@hi-clinic.co.kr>',
      to: [userData.email],
      subject: `[${clinicName}] 회원가입 승인 완료`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">회원가입 승인 완료</h2>
          <p>안녕하세요, <strong>${userData.name}</strong>님!</p>
          <p><strong>${clinicName}</strong>의 회원가입이 승인되었습니다.</p>
          <p>이제 클리닉 매니저의 모든 기능을 사용하실 수 있습니다.</p>
          <div style="margin: 30px 0;">
            <a href="${appUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              로그인하러 가기
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">
            문의사항이 있으시면 병원 관리자에게 연락해 주세요.
          </p>
        </div>
      `
    })

    if (emailError) {
      console.error("[send-approval-email] Error sending email:", emailError)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log("[send-approval-email] Email sent successfully:", emailData)

    return new Response(
      JSON.stringify({ success: true, emailData }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error: unknown) {
    console.error("[send-approval-email] Unexpected error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Set secrets: supabase secrets set RESEND_API_KEY=your_key
  3. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-approval-email' \
    --header 'Authorization: Bearer [YOUR_ANON_KEY]' \
    --header 'Content-Type: application/json' \
    --data '{"userId":"uuid-here","clinicId":"uuid-here"}'

*/
