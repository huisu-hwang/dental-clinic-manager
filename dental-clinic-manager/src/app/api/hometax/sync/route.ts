import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ALL_DATA_TYPES = [
  'tax_invoice_sales',
  'tax_invoice_purchase',
  'cash_receipt_sales',
  'cash_receipt_purchase',
  'business_card_purchase',
  'credit_card_sales',
];

// POST: 수동 동기화 요청 (Job 생성)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinicId, year, month, dataTypes, jobType } = body;

    if (!clinicId || !year || !month) {
      return NextResponse.json(
        { error: 'clinicId, year, month가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류가 발생했습니다.' }, { status: 500 });
    }

    // 인증정보 등록 여부 확인
    const { data: cred } = await supabase
      .from('hometax_credentials')
      .select('id, is_active')
      .eq('clinic_id', clinicId)
      .single();

    if (!cred) {
      return NextResponse.json(
        { error: '홈택스 인증정보를 먼저 등록해주세요.' },
        { status: 400 }
      );
    }

    if (!cred.is_active) {
      return NextResponse.json(
        { error: '홈택스 인증정보가 비활성 상태입니다.' },
        { status: 400 }
      );
    }

    // 이미 진행 중인 Job이 있는지 확인
    const { data: existingJob } = await supabase
      .from('scraping_jobs')
      .select('id, status')
      .eq('clinic_id', clinicId)
      .in('status', ['pending', 'running'])
      .limit(1)
      .single();

    if (existingJob) {
      return NextResponse.json(
        { error: '이미 진행 중인 동기화 작업이 있습니다.', jobId: existingJob.id },
        { status: 409 }
      );
    }

    // Job 생성
    const targetDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const { data: job, error } = await supabase
      .from('scraping_jobs')
      .insert({
        clinic_id: clinicId,
        job_type: jobType || 'manual_sync',
        data_types: dataTypes || ALL_DATA_TYPES,
        target_year: year,
        target_month: month,
        target_date: targetDate,
        status: 'pending',
        priority: jobType === 'manual_sync' ? 1 : 5,
        max_retries: 3,
      })
      .select()
      .single();

    if (error) {
      console.error('Job 생성 실패:', error);
      return NextResponse.json({ error: '동기화 작업 생성에 실패했습니다.' }, { status: 500 });
    }

    // 워커가 실행 중이 아니면 watchdog에게 시작 요청
    const { data: workerControl } = await supabase
      .from('worker_control')
      .select('worker_running')
      .eq('id', 'main')
      .single();

    if (!workerControl?.worker_running) {
      await supabase
        .from('worker_control')
        .update({ start_requested: true })
        .eq('id', 'main');
      console.log('[sync] 워커가 실행 중이 아님, watchdog에 시작 요청');
    }

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error('POST /api/hometax/sync error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
