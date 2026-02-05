import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AIMessage } from '@/types/aiAnalysis';

// 대화 목록 조회 (대표 원장 전용)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 대표 원장 권한 확인
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || userData?.role !== 'owner') {
      return NextResponse.json(
        { error: 'AI 데이터 분석 기능은 대표 원장만 사용할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: conversations, error } = await supabase
      .from('ai_conversations')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json(
        { error: '대화 목록을 불러오는데 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversations: conversations || [] });
  } catch (error) {
    console.error('AI Conversations API Error:', error);
    return NextResponse.json(
      { error: '대화 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 새 대화 생성 (대표 원장 전용)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 사용자의 clinic_id와 role 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.clinic_id) {
      return NextResponse.json(
        { error: '사용자 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 대표 원장 권한 확인
    if (userData.role !== 'owner') {
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

    // 첫 번째 사용자 메시지에서 제목 생성
    const conversationTitle = title || generateTitle(messages);

    const { data: conversation, error } = await supabase
      .from('ai_conversations')
      .insert({
        clinic_id: userData.clinic_id,
        user_id: user.id,
        title: conversationTitle,
        messages: messages || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return NextResponse.json(
        { error: '대화 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('AI Conversations API Error:', error);
    return NextResponse.json(
      { error: '대화 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 첫 번째 메시지에서 제목 생성
function generateTitle(messages?: AIMessage[]): string {
  if (!messages || messages.length === 0) {
    return '새 대화';
  }

  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) {
    return '새 대화';
  }

  // 첫 번째 메시지를 30자로 제한
  const title = firstUserMessage.content.slice(0, 30);
  return title.length < firstUserMessage.content.length ? `${title}...` : title;
}
