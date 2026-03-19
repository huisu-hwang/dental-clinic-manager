import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 마케팅 글 수정 (PATCH)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { generatedContent, status, title } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (generatedContent !== undefined) {
      updateData.generated_content = JSON.stringify(generatedContent);
      updateData.generated_images = generatedContent?.generatedImages || null;
      // 제목도 생성 결과에서 업데이트
      if (generatedContent.title) {
        updateData.title = generatedContent.title;
      }
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (title !== undefined) {
      updateData.title = title;
    }

    const { data, error } = await supabase
      .from('content_calendar_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] marketing/posts/[id] PATCH:', error);
    return NextResponse.json({ error: '글 수정 실패' }, { status: 500 });
  }
}

// 마케팅 글 삭제 (DELETE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from('content_calendar_items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] marketing/posts/[id] DELETE:', error);
    return NextResponse.json({ error: '글 삭제 실패' }, { status: 500 });
  }
}
