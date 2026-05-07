'use client';
import { useEffect, useState } from 'react';
import type { BrandAssets, BrandPhoto, DraftBrandAssets } from '@/types/brand';

interface Props {
  /** 저장된 자산 (없으면 안내 메시지 표시) */
  assets: BrandAssets | null;
  photos: BrandPhoto[];
  /** 라이브 미리보기용 임시 자산 — 폼 입력값을 즉시 반영 */
  draftAssets?: DraftBrandAssets;
  /** 텍스트 카드 미리보기 카피. 미지정 시 `{name_ko} / 임플란트` 자동 생성 */
  sampleCopy?: string;
}

const TYPES = [
  { type: 'medical_law' as const, label: '의료법 안내' },
  { type: 'title' as const, label: '텍스트 카드' },
  { type: 'photo' as const, label: '병원 사진' },
];

function deriveSampleCopy(assets: BrandAssets | null, draft: DraftBrandAssets | undefined, override: string | undefined): string {
  if (override) return override;
  const nameKo = (draft?.name_ko ?? assets?.name_ko ?? '').trim();
  const base = nameKo || '클리닉명';
  return `${base} / 임플란트`;
}

export function BrandPreview({ assets, photos, draftAssets, sampleCopy: sampleCopyProp }: Props) {
  const [urls, setUrls] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);

  // draftAssets는 객체 참조가 매번 달라지므로 의미 있는 부분만 직렬화하여 의존성으로 사용
  const draftKey = draftAssets ? JSON.stringify(draftAssets) : '';
  const photosKey = photos.map((p) => p.id).join(',');

  useEffect(() => {
    if (!assets) return;
    const sampleCopy = deriveSampleCopy(assets, draftAssets, sampleCopyProp);

    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const requests: Promise<{ key: string; url?: string }>[] = [];

        const baseBody = draftAssets ? { draftAssets } : {};

        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'medical_law', ...baseBody }),
          }).then(r => r.json()).then(j => ({ key: 'medical_law', url: j.url })),
        );
        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'title', copy: sampleCopy, ...baseBody }),
          }).then(r => r.json()).then(j => ({ key: 'title', url: j.url })),
        );
        if (photos.length > 0) {
          requests.push(
            fetch('/api/marketing/brand/render', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'photo', photoId: photos[0].id, ...baseBody }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets?.clinic_id, photosKey, draftKey, sampleCopyProp]);

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
