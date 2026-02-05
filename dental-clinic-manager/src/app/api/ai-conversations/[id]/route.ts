import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AIMessage } from '@/types/aiAnalysis';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 대표 원장 권한 확인 헬퍼 함수
async function checkOwnerPermission(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: userData, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || userData?.role !== 'owner') {
    return false;
  }
  return true;
}

// 특정 대화 조회 (대표 원장 전용)
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 대표 원장 권한 확인
    const isOwner = await checkOwnerPermission(supabase, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'AI 데이터 분석 기능은 대표 원장만 사용할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { data: conversation, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '대화를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      console.error('Error fetching conversation:', error);
      return NextResponse.json(
        { error: '대화를 불러오는데 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('AI Conversation API Error:', error);
    return NextResponse.json(
      { error: '대화 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 대화 업데이트 (대표 원장 전용)
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 대표 원장 권한 확인
    const isOwner = await checkOwnerPermission(supabase, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'AI 데이터 분석 기능은 대표 원장만 사용할 수 있습니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, messages } = body as {
      title?: string;
      messages?: AIMessage[];
    };

    const updateData: { title?: string; messages?: AIMessage[] } = {};
    if (title !== undefined) updateData.title = title;
    if (messages !== undefined) updateData.messages = messages;

    const { data: conversation, error } = await supabase
      .from('ai_conversations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '대화를 찾을 수 없거나 수정 권한이 없습니다.' },
          { status: 404 }
        );
      }
      console.error('Error updating conversation:', error);
      return NextResponse.json(
        { error: '대화 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('AI Conversation API Error:', error);
    return NextResponse.json(
      { error: '대화 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 대화 삭제 (대표 원장 전용)
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 대표 원장 권한 확인
    const isOwner = await checkOwnerPermission(supabase, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'AI 데이터 분석 기능은 대표 원장만 사용할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting conversation:', error);
      return NextResponse.json(
        { error: '대화 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI Conversation API Error:', error);
    return NextResponse.json(
      { error: '대화 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
