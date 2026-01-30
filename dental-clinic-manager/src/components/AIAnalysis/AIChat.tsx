'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types/aiAnalysis';

interface AIChatProps {
  clinicId: string;
}

export default function AIChat({ clinicId }: AIChatProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 텍스트 영역 자동 높이 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  const generateId = () => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    // AI 응답 플레이스홀더 추가
    const assistantMessageId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      },
    ]);

    try {
      const response = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages,
          clinicId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI 분석 중 오류가 발생했습니다.');
      }

      // 응답으로 메시지 업데이트
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: data.message,
                isLoading: false,
              }
            : msg
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했습니다.';
      setError(errorMessage);
      // 오류 시 로딩 메시지 제거
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: errorMessage,
                isLoading: false,
                error: errorMessage,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const exampleQuestions = [
    '최근 3개월간의 상담 성과를 분석해줘',
    '24년 8월 25일 부터 25년 1월 30일까지 리콜 예약 전환율 분석해줘',
    '이번 달 네이버 리뷰와 선물 증정의 상관관계를 분석해줘',
    '지난 주 현금 흐름을 분석하고 특이사항을 알려줘',
  ];

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI 데이터 분석</h2>
            <p className="text-sm text-gray-500">병원 데이터를 분석하고 인사이트를 제공합니다</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            className="text-gray-500 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            대화 지우기
          </Button>
        )}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl mb-6">
              <Bot className="w-12 h-12 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              무엇을 분석해 드릴까요?
            </h3>
            <p className="text-gray-500 mb-8 max-w-md">
              Supabase에 저장된 모든 데이터에 접근하여 분석할 수 있습니다.
              <br />
              날짜 범위를 지정하거나 특정 기간의 데이터를 요청해 보세요.
            </p>

            {/* 예시 질문들 */}
            <div className="w-full max-w-2xl">
              <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                이런 질문을 해보세요
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {exampleQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => setInputValue(question)}
                    className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 입력 영역 */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="분석하고 싶은 내용을 입력하세요... (Shift+Enter로 줄바꿈)"
              className="w-full min-h-[44px] max-h-[150px] px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none transition-all text-sm"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="h-[44px] px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          AI 분석 결과는 참고용이며, 실제 의사결정에는 추가적인 검토가 필요합니다.
        </p>
      </div>
    </div>
  );
}

// 메시지 버블 컴포넌트
function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === 'user';
  const isError = !!message.error;

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* 아바타 */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
            : 'bg-gradient-to-br from-gray-100 to-gray-200'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className={cn('w-4 h-4', isError ? 'text-red-500' : 'text-gray-600')} />
        )}
      </div>

      {/* 메시지 내용 */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
            : isError
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-gray-100 text-gray-900'
        )}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">분석 중...</span>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            <MessageContent content={message.content} isUser={isUser} />
          </div>
        )}
      </div>
    </div>
  );
}

// 마크다운 스타일 메시지 렌더링
function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <>{content}</>;
  }

  // 간단한 마크다운 파싱 (## 헤더, - 리스트, **볼드**, 숫자 등)
  const lines = content.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        // ## 헤더
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="font-bold text-base mt-3 mb-1 text-gray-900">
              {line.replace('## ', '')}
            </h3>
          );
        }
        // ### 서브헤더
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="font-semibold text-sm mt-2 mb-1 text-gray-800">
              {line.replace('### ', '')}
            </h4>
          );
        }
        // - 리스트 아이템
        if (line.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 ml-2">
              <span className="text-blue-500">•</span>
              <span>{formatInlineStyles(line.replace('- ', ''))}</span>
            </div>
          );
        }
        // 숫자 리스트
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            return (
              <div key={index} className="flex gap-2 ml-2">
                <span className="font-semibold text-blue-600 min-w-[20px]">{match[1]}.</span>
                <span>{formatInlineStyles(match[2])}</span>
              </div>
            );
          }
        }
        // 빈 줄
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }
        // 일반 텍스트
        return (
          <p key={index}>
            {formatInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

// 인라인 스타일 (볼드, 숫자 강조 등)
function formatInlineStyles(text: string): React.ReactNode {
  // **볼드** 텍스트 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
