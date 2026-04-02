import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

interface LabExpenseItem {
  description: string;
  amount: number;
  vendor_name?: string;
}

/**
 * POST /api/marketing/worker-api/email/lab-expense
 * 기공료 데이터 저장 - Worker API Key 인증
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, year, month, items } = body as {
      clinicId: string;
      year: number;
      month: number;
      items: LabExpenseItem[];
    };

    if (!clinicId || !year || !month || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'clinicId, year, month, items가 필요합니다.' },
        { status: 400 }
      );
    }

    // expense_categories에서 type='lab' 카테고리 조회
    let { data: labCategory } = await admin
      .from('expense_categories')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('type', 'lab')
      .maybeSingle();

    // 없으면 자동 생성
    if (!labCategory) {
      const { data: newCategory, error: createError } = await admin
        .from('expense_categories')
        .insert({
          clinic_id: clinicId,
          name: '기공료',
          type: 'lab',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[worker-api/email/lab-expense] Category create error:', createError);
        return NextResponse.json(
          { error: '기공료 카테고리 생성 실패: ' + createError.message },
          { status: 500 }
        );
      }
      labCategory = newCategory;
    }

    // 각 item을 expense_records에 INSERT
    const insertedIds: string[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const { data: record, error: insertError } = await admin
        .from('expense_records')
        .insert({
          clinic_id: clinicId,
          category_id: labCategory!.id,
          description: item.description,
          amount: item.amount,
          vendor_name: item.vendor_name || null,
          expense_date: `${year}-${String(month).padStart(2, '0')}-01`,
          year,
          month,
          notes: '이메일 자동 입력',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        errors.push(`${item.description}: ${insertError.message}`);
      } else if (record) {
        insertedIds.push(record.id);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      insertedCount: insertedIds.length,
      totalCount: items.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[worker-api/email/lab-expense]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
