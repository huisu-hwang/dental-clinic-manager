import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { records, type } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Invalid records' }, { status: 400 });
    }

    let tableName = '';
    let conflictColumn = '';

    if (type === 'tax-invoice') {
      tableName = 'scp_tax_invoices';
      conflictColumn = 'invoice_id';
    } else if (type === 'cash-receipt') {
      tableName = 'scp_cash_receipts';
      conflictColumn = 'approval_no'; // or whichever is the unique key
    } else if (type === 'credit-card') {
      tableName = 'scp_credit_card_purchases';
      conflictColumn = 'approval_no'; // or whichever is the unique key
    } else {
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }

    const { error } = await admin
      .from(tableName as Extract<keyof import('@supabase/supabase-js').SupabaseClient['from'], string>)
      .upsert(records, { onConflict: conflictColumn });

    if (error) {
      console.error(`[scraping/data/upsert] DB Error for ${type}:`, error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error) {
    console.error('[scraping/data/upsert] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
