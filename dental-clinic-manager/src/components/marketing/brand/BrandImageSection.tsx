'use client';
import { useEffect, useState } from 'react';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import type { BrandImageOptions } from '@/types/brand';
import Link from 'next/link';

interface Props {
  clinicNameForCopy: string;
  keyword: string;
  value: BrandImageOptions;
  onChange: (next: BrandImageOptions) => void;
  disabled?: boolean;
}

const POSITIONS: { key: 'top' | 'middle' | 'bottom'; label: string }[] = [
  { key: 'top', label: '위' },
  { key: 'middle', label: '중간' },
  { key: 'bottom', label: '끝' },
];

export function BrandImageSection({ clinicNameForCopy, keyword, value, onChange, disabled }: Props) {
  const { assets, photos } = useBrandAssets();
  const [copyTouched, setCopyTouched] = useState(false);

  useEffect(() => {
    if (copyTouched) return;
    // 클리닉명과 키워드 중 채워진 값만 합쳐 자동 카피 생성.
    // 둘 다 비어있으면 빈 문자열을 유지(서버에서 글 제목으로 자동 채움).
    const parts = [clinicNameForCopy, keyword].map((s) => (s || '').trim()).filter(Boolean);
    const auto = parts.join(' / ');
    if (auto !== value.title.copy) {
      onChange({ ...value, title: { ...value.title, copy: auto } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicNameForCopy, keyword, copyTouched]);

  const togglePosition = (
    section: keyof BrandImageOptions,
    pos: 'top' | 'middle' | 'bottom',
  ) => {
    const cur = value[section].positions;
    const next = cur.includes(pos) ? cur.filter(p => p !== pos) : [...cur, pos];
    onChange({ ...value, [section]: { ...value[section], positions: next } });
  };

  const setEnabled = (section: keyof BrandImageOptions, enabled: boolean) => {
    onChange({ ...value, [section]: { ...value[section], enabled } });
  };

  if (!assets) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        브랜드 이미지가 아직 설정되지 않았습니다.{' '}
        <Link href="/dashboard/marketing/brand" className="text-amber-800 underline">설정 페이지로 이동</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-at-border p-4 bg-at-surface-alt/40">
      <p className="text-sm font-semibold text-at-text">브랜드 이미지</p>

      <Row
        label="의료법 안내 이미지"
        enabled={value.medicalLaw.enabled}
        onEnabledChange={(v) => setEnabled('medicalLaw', v)}
        disabled={disabled}
      >
        <PositionPicker positions={value.medicalLaw.positions} onToggle={(p) => togglePosition('medicalLaw', p)} disabled={disabled || !value.medicalLaw.enabled} />
      </Row>

      <Row
        label="텍스트 카드 이미지"
        enabled={value.title.enabled}
        onEnabledChange={(v) => setEnabled('title', v)}
        disabled={disabled}
      >
        <PositionPicker positions={value.title.positions} onToggle={(p) => togglePosition('title', p)} disabled={disabled || !value.title.enabled} />
        <input
          type="text"
          value={value.title.copy}
          onChange={(e) => { setCopyTouched(true); onChange({ ...value, title: { ...value.title, copy: e.target.value } }); }}
          disabled={disabled || !value.title.enabled}
          placeholder="중앙 큰 글씨 (자동 채움 — 수정 가능)"
          className="mt-2 w-full px-2 py-1.5 border border-at-border rounded text-xs"
        />
      </Row>

      <Row
        label="병원 사진 이미지"
        enabled={value.photo.enabled}
        onEnabledChange={(v) => setEnabled('photo', v)}
        disabled={disabled || photos.length === 0}
      >
        {photos.length === 0 ? (
          <p className="text-xs text-at-text-weak">사진이 없습니다 — 설정 페이지에서 업로드하세요.</p>
        ) : (
          <>
            <PositionPicker positions={value.photo.positions} onToggle={(p) => togglePosition('photo', p)} disabled={disabled || !value.photo.enabled} />
            <div className="mt-2 flex items-center gap-3 text-xs">
              {(['random', 'manual', 'rotate'] as const).map(m => (
                <label key={m} className="inline-flex items-center gap-1">
                  <input type="radio" checked={value.photo.mode === m}
                    onChange={() => onChange({ ...value, photo: { ...value.photo, mode: m, photoId: m === 'manual' ? value.photo.photoId : undefined } })}
                    disabled={disabled || !value.photo.enabled} />
                  {m === 'random' ? '랜덤' : m === 'manual' ? '직접 선택' : '순서 회전'}
                </label>
              ))}
            </div>
            {value.photo.mode === 'manual' && (
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                {photos.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => onChange({ ...value, photo: { ...value.photo, photoId: p.id } })}
                    className={`rounded overflow-hidden border-2 ${value.photo.photoId === p.id ? 'border-at-accent' : 'border-transparent'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo_url} alt="" className="w-full aspect-square object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Row>
    </div>
  );
}

function Row({ label, enabled, onEnabledChange, disabled, children }: { label: string; enabled: boolean; onEnabledChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-at-border pt-3 first:border-t-0 first:pt-0">
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span className="font-medium text-at-text-secondary">{label}</span>
      </label>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function PositionPicker({ positions, onToggle, disabled }: { positions: ('top' | 'middle' | 'bottom')[]; onToggle: (p: 'top' | 'middle' | 'bottom') => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-xs text-at-text-secondary">
      <span>위치:</span>
      {POSITIONS.map(({ key, label }) => (
        <label key={key} className="inline-flex items-center gap-1">
          <input type="checkbox" checked={positions.includes(key)} disabled={disabled}
            onChange={() => onToggle(key)} />
          {label}
        </label>
      ))}
    </div>
  );
}
