import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');
    const platform = searchParams.get('platform');

    if (!clinicId || !platform) {
      return NextResponse.json({ error: 'clinic_id and platform required' }, { status: 400 });
    }

    const { data } = await admin
      .from('marketing_platform_settings')
      .select('config')
      .eq('clinic_id', clinicId)
      .eq('platform', platform)
      .single();

    return NextResponse.json({ config: data?.config || null });
  } catch (error) {
    console.error('[worker-api/platform-settings]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
