'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BrandAssets, BrandPhoto } from '@/types/brand';

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAssets | null>(null);
  const [photos, setPhotos] = useState<BrandPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p] = await Promise.all([
        fetch('/api/marketing/brand/assets').then(r => r.json()),
        fetch('/api/marketing/brand/photos').then(r => r.json()),
      ]);
      setAssets(a.assets);
      setPhotos(p.photos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveAssets = useCallback(async (input: Partial<BrandAssets>) => {
    const res = await fetch('/api/marketing/brand/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '저장 실패');
    setAssets(json.assets);
    return json.assets as BrandAssets;
  }, []);

  const uploadPhoto = useCallback(async (file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (caption) fd.append('caption', caption);
    const res = await fetch('/api/marketing/brand/photos', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    setPhotos(prev => [...prev, json.photo]);
    return json.photo as BrandPhoto;
  }, []);

  const deletePhoto = useCallback(async (id: string) => {
    const res = await fetch(`/api/marketing/brand/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || '삭제 실패');
    }
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePhoto = useCallback(async (id: string, update: Partial<Pick<BrandPhoto, 'caption' | 'sort_order'>>) => {
    const res = await fetch(`/api/marketing/brand/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '수정 실패');
    setPhotos(prev => prev.map(p => p.id === id ? json.photo : p));
  }, []);

  return { assets, photos, loading, error, refresh, saveAssets, uploadPhoto, deletePhoto, updatePhoto };
}
