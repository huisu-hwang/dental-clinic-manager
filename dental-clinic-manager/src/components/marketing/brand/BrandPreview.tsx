'use client';
import { useEffect, useState } from 'react';
import type { BrandAssets, BrandPhoto } from '@/types/brand';

interface Props {
  assets: BrandAssets | null;
  photos: BrandPhoto[];
  sampleCopy?: string;
}

const TYPES = [
  { type: 'medical_law' as const, label: '의료법 안내' },
  { type: 'title' as const, label: '텍스트 카드' },
  { type: 'photo' as const, label: '병원 사진' },
];

export function BrandPreview({ assets, photos, sampleCopy = '강남숙면치과 / 임플란트' }: Props) {
  const [urls, setUrls] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assets) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const requests: Promise<{ key: string; url?: string }>[] = [];
        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'medical_law' }),
          }).then(r => r.json()).then(j => ({ key: 'medical_law', url: j.url })),
        );
        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'title', copy: sampleCopy }),
          }).then(r => r.json()).then(j => ({ key: 'title', url: j.url })),
        );
        if (photos.length > 0) {
          requests.push(
            fetch('/api/marketing/brand/render', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'photo', photoId: photos[0].id }),
            }).then(r => r.json()).then(j => ({ key: 'photo', url: j.url })),
          );
        }
        const results = await Promise.all(requests);
        if (cancelled) return;
        const next: Record<string, string | undefined> = {};
        for (const r of results) next[r.key] = r.url;
        setUrls(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [assets, photos, sampleCopy]);

  if (!assets) return <p className="text-sm text-at-text-weak">먼저 자산을 저장해주세요.</p>;

  return (
    <div className="space-y-4">
      {TYPES.map(({ type, label }) => (
        <div key={type} className="rounded-lg border border-at-border bg-white p-3">
          <p className="text-xs font-semibold text-at-text-secondary mb-2">{label}</p>
          {urls[type] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[type]} alt={label} className="max-w-full rounded" />
          ) : (
            <div className="aspect-video bg-at-surface-alt flex items-center justify-center text-xs text-at-text-weak">
              {loading ? '합성 중…' : type === 'photo' && photos.length === 0 ? '사진을 먼저 업로드해주세요' : '대기'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
