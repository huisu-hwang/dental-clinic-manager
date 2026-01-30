import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performAnalysis } from '@/lib/aiAnalysisService';
import type { AIAnalysisRequest, AIMessage } from '@/types/aiAnalysis';

export const maxDuration = 60; // 최대 60초 실행 허용 (Vercel Pro)

export async function POST(request: NextRequest) {
  try {
    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase 설정이 누락되었습니다.' },
        { status: 500 }
      );
    }

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다. 환경 변수 OPENAI_API_KEY를 확인하세요.' },
        { status: 500 }
      );
    }

    // 요청 본문 파싱
    const body = await request.json();
    const { message, conversationHistory, dateRange, clinicId } = body as {
      message: string;
      conversationHistory?: AIMessage[];
      dateRange?: { startDate: string; endDate: string };
      clinicId: string;
    };

    if (!message || message.trim() === '') {
      return NextResponse.json(
        { error: '메시지를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: '클리닉 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 인증 확인 (선택적)
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        console.warn('Auth warning:', authError.message);
        // 인증 실패해도 계속 진행 (클리닉 ID로 데이터 접근 제한)
      }
    }

    // AI 분석 수행
    const analysisRequest: AIAnalysisRequest = {
      message,
      conversationHistory,
      dateRange,
    };

    const response = await performAnalysis(
      analysisRequest,
      supabaseUrl,
      supabaseKey,
      openaiApiKey,
      clinicId
    );

    if (response.error) {
      return NextResponse.json(
        { error: response.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: response.message,
      data: response.data,
    });
  } catch (error) {
    console.error('AI Analysis API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
