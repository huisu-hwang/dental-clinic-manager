'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Trash2,
  Calendar,
  Plus,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  MoreVertical,
  Edit2,
  Check,
  X,
  Paperclip,
  FileSpreadsheet,
  FileText,
  File,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { AIMessage, FileAttachment } from '@/types/aiAnalysis';
import { parseFile, formatFileSize, validateFile } from '@/lib/fileParsingUtils';
import { appConfirm } from '@/components/ui/AppDialog'

interface AIChatProps {
  clinicId: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function AIChat({ clinicId }: AIChatProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 대화 기록 관련 상태
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [showMenu, setShowMenu] = useState<string | null>(null);

  // 파일 첨부 관련 상태
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 백그라운드 처리 관련 상태
  const [showBackgroundHint, setShowBackgroundHint] = useState(false);
  const backgroundHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // 대화 목록 불러오기
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const response = await fetch('/api/ai-conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // 백그라운드 폴링 관리
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (convId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai-conversations/${convId}`);
        if (res.ok) {
          const data = await res.json();
          const convMessages = data.conversation.messages || [];
          const lastMsg = convMessages[convMessages.length - 1];
          if (lastMsg && !lastMsg.isLoading) {
            setMessages(convMessages);
            setIsLoading(false);
            setShowBackgroundHint(false);
            stopPolling();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopPolling();
      if (backgroundHintTimerRef.current) clearTimeout(backgroundHintTimerRef.current);
    };
  }, []);

  // 특정 대화 불러오기
  const loadConversation = async (conversationId: string) => {
    stopPolling();
    try {
      const response = await fetch(`/api/ai-conversations/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        const convMessages = data.conversation.messages || [];
        setMessages(convMessages);
        setCurrentConversationId(conversationId);
        setError(null);

        // 분석 대기 중인 메시지가 있는지 확인
        const lastMsg = convMessages[convMessages.length - 1];
        if (lastMsg?.isLoading) {
          const pendingTime = new Date(lastMsg.timestamp).getTime();
          if (Date.now() - pendingTime > 2 * 60 * 1000) {
            // 시간 초과 처리 (2분)
            const timeoutMessages = convMessages.map((msg: AIMessage) =>
              msg.isLoading
                ? { ...msg, content: '분석 시간이 초과되었습니다. 다시 시도해주세요.', isLoading: false, error: '시간 초과' }
                : msg
            );
            setMessages(timeoutMessages);
            await fetch(`/api/ai-conversations/${conversationId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: timeoutMessages }),
            });
          } else {
            // 아직 분석 중 → 폴링 시작
            setIsLoading(true);
            setShowBackgroundHint(true);
            startPolling(conversationId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError('대화를 불러오는데 실패했습니다.');
    }
  };

  // 대화 저장 (생성 또는 업데이트)
  const saveConversation = async (newMessages: AIMessage[], autoTitle?: string) => {
    if (newMessages.length === 0) return;

    try {
      setIsSaving(true);

      if (currentConversationId) {
        // 기존 대화 업데이트
        await fetch(`/api/ai-conversations/${currentConversationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages }),
        });
      } else {
        // 새 대화 생성
        const response = await fetch('/api/ai-conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: autoTitle,
            messages: newMessages,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentConversationId(data.conversation.id);
          // 목록 새로고침
          loadConversations();
        }
      }
    } catch (err) {
      console.error('Failed to save conversation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // 대화 제목 수정
  const updateConversationTitle = async (conversationId: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/ai-conversations/${conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });

      if (response.ok) {
        setConversations(prev =>
          prev.map(c => (c.id === conversationId ? { ...c, title: newTitle } : c))
        );
      }
    } catch (err) {
      console.error('Failed to update title:', err);
    }
    setEditingTitleId(null);
  };

  // 대화 삭제
  const deleteConversation = async (conversationId: string) => {
    if (!await appConfirm('이 대화를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/ai-conversations/${conversationId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (currentConversationId === conversationId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
    setShowMenu(null);
  };

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
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    const updatedMessages = [...messages, userMessage];

    // AI 응답 플레이스홀더
    const assistantMessageId = generateId();
    const pendingAssistantMessage: AIMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    const messagesWithPending = [...updatedMessages, pendingAssistantMessage];

    setMessages(messagesWithPending);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    // 1. 대화를 DB에 먼저 저장 (pending 상태) — 페이지 이탈 시에도 서버가 결과를 저장할 수 있도록
    let convId = currentConversationId;
    try {
      if (convId) {
        await fetch(`/api/ai-conversations/${convId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesWithPending }),
        });
      } else {
        const autoTitle = messages.length === 0
          ? (userMessage.content.length > 30 ? userMessage.content.slice(0, 30) + '...' : userMessage.content)
          : undefined;
        const saveRes = await fetch('/api/ai-conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: autoTitle, messages: messagesWithPending }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          convId = saveData.conversation.id;
          setCurrentConversationId(convId);
          loadConversations();
        }
      }
    } catch (err) {
      console.error('Failed to pre-save conversation:', err);
    }

    // 2. 백그라운드 힌트 타이머 (5초 후 표시)
    if (backgroundHintTimerRef.current) clearTimeout(backgroundHintTimerRef.current);
    backgroundHintTimerRef.current = setTimeout(() => {
      setShowBackgroundHint(true);
    }, 5000);

    // 3. AI 분석 API 호출 (서버에서 완료 시 DB에 자동 저장)
    try {
      const response = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages,
          clinicId,
          attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
          conversationId: convId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI 분석 중 오류가 발생했습니다.');
      }

      // 응답으로 메시지 업데이트 (DB는 API에서 이미 저장됨)
      const finalMessages: AIMessage[] = [
        ...updatedMessages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
          isLoading: false,
        },
      ];

      setMessages(finalMessages);
      setAttachedFiles([]);
      loadConversations();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했습니다.';
      setError(errorMessage);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: errorMessage, isLoading: false, error: errorMessage }
            : msg
        )
      );
    } finally {
      if (backgroundHintTimerRef.current) clearTimeout(backgroundHintTimerRef.current);
      setShowBackgroundHint(false);
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    stopPolling();
    setMessages([]);
    setCurrentConversationId(null);
    setError(null);
    setAttachedFiles([]);
    setFileError(null);
    setShowBackgroundHint(false);
    setIsLoading(false);
  };

  // 파일 첨부 핸들러
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setFileError(null);

    // 유효성 검사
    const validation = validateFile(file);
    if (!validation.valid) {
      setFileError(validation.error || '파일을 처리할 수 없습니다.');
      return;
    }

    // 이미 첨부된 파일인지 확인
    if (attachedFiles.some(f => f.name === file.name)) {
      setFileError('이미 첨부된 파일입니다.');
      return;
    }

    // 최대 3개 파일 제한
    if (attachedFiles.length >= 3) {
      setFileError('최대 3개의 파일까지 첨부할 수 있습니다.');
      return;
    }

    try {
      setIsParsingFile(true);
      const parsedFile = await parseFile(file);
      setAttachedFiles(prev => [...prev, parsedFile]);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '파일 파싱 중 오류가 발생했습니다.');
    } finally {
      setIsParsingFile(false);
    }
  };

  // 첨부 파일 제거
  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
    setFileError(null);
  };

  // 파일 아이콘 선택
  const getFileIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'excel':
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-at-success" />;
      case 'pdf':
        return <File className="w-4 h-4 text-at-error" />;
      case 'text':
        return <FileText className="w-4 h-4 text-at-accent" />;
      default:
        return <File className="w-4 h-4 text-at-text-secondary" />;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return '어제';
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  const exampleQuestions = [
    '최근 3개월간의 상담 성과를 분석해줘',
    '24년 8월 25일 부터 25년 1월 30일까지 리콜 예약 전환율 분석해줘',
    '이번 달 네이버 리뷰와 선물 증정의 상관관계를 분석해줘',
    '지난 주 현금 흐름을 분석하고 특이사항을 알려줘',
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* 사이드바 - 대화 기록 */}
      <div
        className={cn(
          'bg-white border-r border-at-border flex flex-col transition-all duration-300',
          isSidebarOpen ? 'w-72' : 'w-0'
        )}
      >
        {isSidebarOpen && (
          <>
            {/* 사이드바 헤더 */}
            <div className="p-4 border-b border-at-border">
              <Button
                onClick={handleNewChat}
                className="w-full bg-at-accent hover:bg-at-accent-hover text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                새 대화
              </Button>
            </div>

            {/* 대화 목록 */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-at-text-weak" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <MessageSquare className="w-10 h-10 mx-auto text-at-text-weak mb-2" />
                  <p className="text-sm text-at-text-weak">대화 기록이 없습니다</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        'group relative rounded-xl transition-colors',
                        currentConversationId === conv.id
                          ? 'bg-at-accent-light border border-at-border'
                          : 'hover:bg-at-surface-alt'
                      )}
                    >
                      {editingTitleId === conv.id ? (
                        <div className="flex items-center gap-1 p-2">
                          <input
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            className="flex-1 text-sm px-2 py-1 border rounded"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateConversationTitle(conv.id, editingTitleValue);
                              } else if (e.key === 'Escape') {
                                setEditingTitleId(null);
                              }
                            }}
                          />
                          <button
                            onClick={() => updateConversationTitle(conv.id, editingTitleValue)}
                            className="p-1 text-at-success hover:bg-at-success-bg rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingTitleId(null)}
                            className="p-1 text-at-text-weak hover:bg-at-border rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => loadConversation(conv.id)}
                          className="w-full text-left p-3 pr-8"
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 mt-0.5 text-at-text-weak flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-at-text truncate">
                                {conv.title}
                              </p>
                              <p className="text-xs text-at-text-weak flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                {formatDate(conv.updated_at)}
                              </p>
                            </div>
                          </div>
                        </button>
                      )}

                      {/* 메뉴 버튼 */}
                      {editingTitleId !== conv.id && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMenu(showMenu === conv.id ? null : conv.id);
                            }}
                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-at-border transition-opacity"
                          >
                            <MoreVertical className="w-4 h-4 text-at-text-weak" />
                          </button>

                          {/* 드롭다운 메뉴 */}
                          {showMenu === conv.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-at-border rounded-xl shadow-lg py-1 z-10 min-w-[120px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTitleId(conv.id);
                                  setEditingTitleValue(conv.title);
                                  setShowMenu(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-at-text-secondary hover:bg-at-surface-alt flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                이름 변경
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConversation(conv.id);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-at-error hover:bg-at-error-bg flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 저장 상태 표시 */}
            {isSaving && (
              <div className="px-4 py-2 border-t border-at-border text-xs text-at-text-weak flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                저장 중...
              </div>
            )}
          </>
        )}
      </div>

      {/* 사이드바 토글 버튼 */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-at-border rounded-r-lg p-1.5 shadow-at-card hover:bg-at-surface-alt transition-colors"
        style={{ marginLeft: isSidebarOpen ? '288px' : '0' }}
      >
        {isSidebarOpen ? (
          <ChevronLeft className="w-4 h-4 text-at-text-weak" />
        ) : (
          <ChevronRight className="w-4 h-4 text-at-text-weak" />
        )}
      </button>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-at-accent-light text-at-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-at-text">
              <span className="text-at-accent mr-1">AI</span>
              데이터 분석
            </h2>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="py-1.5 px-3 inline-flex items-center rounded-lg font-medium text-sm transition-all text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              새 대화
            </button>
          )}
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              {/* 안내 카드 — LeaveBalanceCard 스타일 */}
              <div className="w-full max-w-2xl bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-at-border mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-at-accent-light rounded-xl">
                    <Bot className="w-6 h-6 text-at-accent" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-at-text">무엇을 분석해 드릴까요?</h3>
                    <p className="text-sm text-at-text-weak">날짜 범위를 지정하거나 특정 기간의 데이터를 요청해 보세요</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exampleQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => setInputValue(question)}
                      className="text-left p-3 bg-white rounded-lg shadow-sm border border-transparent hover:border-blue-200 hover:shadow-md transition-all text-sm text-at-text-secondary"
                    >
                      <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-at-accent" />
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} showBackgroundHint={showBackgroundHint && message.isLoading} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mx-6 mb-2 p-3 bg-at-error-bg border border-red-200 rounded-xl text-at-error text-sm">
            {error}
          </div>
        )}

        {/* 입력 영역 */}
        <div className="border-t border-at-border p-4 bg-at-surface-alt">
          {/* 첨부 파일 미리보기 */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-at-border rounded-xl text-sm"
                >
                  {getFileIcon(file.type)}
                  <div className="flex flex-col">
                    <span className="font-medium text-at-text truncate max-w-[150px]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-xs text-at-text-weak">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    className="ml-1 text-at-text-weak hover:text-red-500 transition-colors"
                    title="파일 제거"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 파일 에러 메시지 */}
          {fileError && (
            <div className="flex items-center gap-2 p-2 mb-3 bg-at-error-bg text-at-error rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{fileError}</span>
              <button
                type="button"
                onClick={() => setFileError(null)}
                className="ml-auto text-red-500 hover:text-at-error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3">
            {/* 파일 첨부 버튼 */}
            <div className="flex items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.txt,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isParsingFile}
                className="h-[44px] px-3 text-at-text-weak hover:text-at-accent hover:bg-at-accent-light"
                title="파일 첨부 (Excel, CSV, PDF, TXT)"
              >
                {isParsingFile ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </Button>
            </div>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={attachedFiles.length > 0
                  ? "첨부한 파일과 함께 분석할 내용을 입력하세요..."
                  : "분석하고 싶은 내용을 입력하세요... (Shift+Enter로 줄바꿈)"}
                className="w-full min-h-[44px] max-h-[150px] px-4 py-3 pr-12 rounded-xl border border-at-border focus:border-at-accent focus:ring-2 focus:ring-blue-200 resize-none transition-all text-sm"
                rows={1}
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="h-[44px] px-4 bg-at-accent hover:bg-at-accent-hover text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </form>
          <p className="text-xs text-at-text-weak mt-2 text-center">
            AI 분석 결과는 참고용이며, 실제 의사결정에는 추가적인 검토가 필요합니다.
            {attachedFiles.length === 0 && ' | 클립 아이콘으로 Excel, CSV, PDF, TXT 파일 첨부 가능'}
          </p>
        </div>
      </div>
    </div>
  );
}

// 메시지 버블 컴포넌트
function MessageBubble({ message, showBackgroundHint }: { message: AIMessage; showBackgroundHint?: boolean }) {
  const isUser = message.role === 'user';
  const isError = !!message.error;
  const hasAttachments = message.attachments && message.attachments.length > 0;

  // 파일 아이콘 선택
  const getFileIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'excel':
      case 'csv':
        return <FileSpreadsheet className="w-3 h-3" />;
      case 'pdf':
        return <File className="w-3 h-3" />;
      case 'text':
        return <FileText className="w-3 h-3" />;
      default:
        return <File className="w-3 h-3" />;
    }
  };

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
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          isUser
            ? 'bg-at-accent'
            : isError
              ? 'bg-at-error-bg'
              : 'bg-at-accent-light'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className={cn('w-4 h-4', isError ? 'text-at-error' : 'text-at-accent')} />
        )}
      </div>

      {/* 메시지 내용 */}
      <div className={cn('max-w-[80%]', isUser ? 'text-right' : 'text-left')}>
        {/* 첨부 파일 표시 (사용자 메시지) */}
        {hasAttachments && (
          <div className={cn(
            'flex flex-wrap gap-1 mb-2',
            isUser ? 'justify-end' : 'justify-start'
          )}>
            {message.attachments!.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1 px-2 py-1 bg-at-tag text-at-accent rounded text-xs"
                title={file.parsedData.summary}
              >
                {getFileIcon(file.type)}
                <span className="truncate max-w-[100px]">{file.name}</span>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'rounded-xl px-4 py-3 inline-block',
            isUser
              ? 'bg-at-accent text-white'
              : isError
                ? 'bg-at-error-bg border border-red-200 text-at-error'
                : 'bg-at-surface-alt border border-at-border text-at-text'
          )}
        >
          {message.isLoading ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">분석 중...</span>
              </div>
              {showBackgroundHint && (
                <p className="text-xs text-at-text-weak mt-1">
                  다른 작업을 하고 오셔도 됩니다. 돌아오시면 결과를 확인할 수 있습니다.
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-left">
              <MessageContent content={message.content} isUser={isUser} />
            </div>
          )}
        </div>
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
            <h3 key={index} className="font-bold text-base mt-3 mb-1 text-at-text">
              {line.replace('## ', '')}
            </h3>
          );
        }
        // ### 서브헤더
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="font-semibold text-sm mt-2 mb-1 text-at-text">
              {line.replace('### ', '')}
            </h4>
          );
        }
        // - 리스트 아이템
        if (line.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 ml-2">
              <span className="text-at-accent">•</span>
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
                <span className="font-semibold text-at-accent min-w-[20px]">{match[1]}.</span>
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
