import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { notification } = body;

    const { error } = await admin
      .from('notifications')
      .insert(notification);

    if (error) {
      console.error('[scraping/notifications] DB Error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/notifications] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
