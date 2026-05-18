'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BrandImageSetCard, BrandImageSetWithCards } from '@/types/brand';

export function useBrandImageSets() {
  const [sets, setSets] = useState<BrandImageSetWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/marketing/brand/image-sets').then(r => r.json());
      setSets(r.sets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createSet = useCallback(async (name: string, description?: string) => {
    const res = await fetch('/api/marketing/brand/image-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '세트 생성 실패');
    setSets(prev => [...prev, json.set]);
    return json.set as BrandImageSetWithCards;
  }, []);

  const updateSet = useCallback(async (id: string, update: { name?: string; description?: string | null; sort_order?: number }) => {
    const res = await fetch(`/api/marketing/brand/image-sets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '세트 수정 실패');
    setSets(prev => prev.map(s => s.id === id ? { ...s, ...json.set } : s));
  }, []);

  const deleteSet = useCallback(async (id: string) => {
    const res = await fetch(`/api/marketing/brand/image-sets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || '세트 삭제 실패');
    }
    setSets(prev => prev.filter(s => s.id !== id));
  }, []);

  const addCard = useCallback(async (setId: string, file: File, titleCopy?: string, subtitleCopy?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (titleCopy) fd.append('title_copy', titleCopy);
    if (subtitleCopy) fd.append('subtitle_copy', subtitleCopy);
    const res = await fetch(`/api/marketing/brand/image-sets/${setId}/cards`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '카드 추가 실패');
    setSets(prev => prev.map(s => s.id === setId ? { ...s, cards: [...s.cards, json.card] } : s));
    return json.card as BrandImageSetCard;
  }, []);

  /**
   * AI 이미지 생성으로 카드 추가.
   * - 사용자 프롬프트 + 카피 → OpenAI gpt-image-2 (infographic_only) → Storage → 카드 INSERT
   * - 생성 + 업로드까지 30~60초 소요 — 호출부에서 로딩 상태 표시 필요
   */
  const generateCard = useCallback(async (
    setId: string,
    args: { prompt: string; titleCopy?: string; subtitleCopy?: string },
  ) => {
    const res = await fetch(`/api/marketing/brand/image-sets/${setId}/cards/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: args.prompt,
        title_copy: args.titleCopy,
        subtitle_copy: args.subtitleCopy,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '이미지 생성 실패');
    setSets(prev => prev.map(s => s.id === setId ? { ...s, cards: [...s.cards, json.card] } : s));
    return json.card as BrandImageSetCard;
  }, []);

  const updateCard = useCallback(async (setId: string, cardId: string, update: { title_copy?: string | null; subtitle_copy?: string | null; sort_order?: number }) => {
    const res = await fetch(`/api/marketing/brand/image-sets/${setId}/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '카드 수정 실패');
    setSets(prev => prev.map(s => s.id === setId
      ? { ...s, cards: s.cards.map(c => c.id === cardId ? json.card : c) }
      : s));
  }, []);

  const deleteCard = useCallback(async (setId: string, cardId: string) => {
    const res = await fetch(`/api/marketing/brand/image-sets/${setId}/cards/${cardId}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || '카드 삭제 실패');
    }
    setSets(prev => prev.map(s => s.id === setId
      ? { ...s, cards: s.cards.filter(c => c.id !== cardId) }
      : s));
  }, []);

  return { sets, loading, error, refresh, createSet, updateSet, deleteSet, addCard, generateCard, updateCard, deleteCard };
}
