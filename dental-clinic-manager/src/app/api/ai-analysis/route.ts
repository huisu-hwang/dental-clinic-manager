import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performAnalysisV2, parseDateRange } from '@/lib/aiAnalysisServiceV2';
import type { AIAnalysisRequest, AIMessage } from '@/types/aiAnalysis';

export const maxDuration = 60; // 최대 60초 실행 허용 (Vercel Pro)

export async function POST(request: NextRequest) {
  try {
    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // Service Role Key 사용 (RLS 우회하여 모든 데이터 접근)
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase 설정이 누락되었습니다.' },
        { status: 500 }
      );
    }

    if (!supabaseServiceKey) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. ANON_KEY를 사용합니다.');
    }

    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Gemini API 키가 설정되지 않았습니다. 환경 변수 GEMINI_API_KEY를 확인하세요.' },
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
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        console.warn('Auth warning:', authError.message);
      }
    }

    // 메시지에서 날짜 범위 파싱 (명시적으로 지정되지 않은 경우)
    const parsedDateRange = dateRange || parseDateRange(message) || undefined;

    // AI 분석 수행 (V2 - Agentic 방식)
    const analysisRequest: AIAnalysisRequest = {
      message,
      conversationHistory,
      dateRange: parsedDateRange,
    };

    const response = await performAnalysisV2(
      analysisRequest,
      supabaseUrl,
      supabaseServiceKey || supabaseAnonKey,
      geminiApiKey,
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
