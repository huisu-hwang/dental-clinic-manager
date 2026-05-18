'use client';
import { useEffect, useState } from 'react';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { useBrandImageSets } from '@/hooks/useBrandImageSets';
import type { BrandImageOptions } from '@/types/brand';
import Link from 'next/link';

interface Props {
  clinicNameForCopy: string;
  keyword: string;
  /** 글 제목(주제) — 텍스트 카드 자동 카피의 기본값으로 사용 */
  topic?: string;
  value: BrandImageOptions;
  onChange: (next: BrandImageOptions) => void;
  disabled?: boolean;
}

const POSITIONS: { key: 'top' | 'middle' | 'bottom'; label: string }[] = [
  { key: 'top', label: '위' },
  { key: 'middle', label: '중간' },
  { key: 'bottom', label: '끝' },
];

export function BrandImageSection({ clinicNameForCopy, keyword, topic, value, onChange, disabled }: Props) {
  const { assets, photos } = useBrandAssets();
  const { sets } = useBrandImageSets();
  const [copyTouched, setCopyTouched] = useState(false);

  useEffect(() => {
    if (copyTouched) return;
    // 기본 카피는 글 제목(topic) 으로 자동 세팅.
    // 제목이 비어있으면 키워드 → 클리닉명 순으로 폴백, 모두 비면 빈 문자열 유지(서버에서 글 제목으로 자동 채움).
    const auto = (topic || '').trim()
      || (keyword || '').trim()
      || (clinicNameForCopy || '').trim();
    if (auto !== value.title.copy) {
      onChange({ ...value, title: { ...value.title, copy: auto } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, keyword, clinicNameForCopy, copyTouched]);

  const togglePosition = (
    section: keyof BrandImageOptions,
    pos: 'top' | 'middle' | 'bottom',
  ) => {
    const cur = value[section]?.positions ?? [];
    const next = cur.includes(pos) ? cur.filter(p => p !== pos) : [...cur, pos];
    // imageSet 은 optional 이라 기본 구조를 채워서 안전하게 전개
    if (section === 'imageSet') {
      const base = value.imageSet ?? { enabled: false, positions: [], setId: undefined };
      onChange({ ...value, imageSet: { ...base, positions: next } });
      return;
    }
    onChange({ ...value, [section]: { ...value[section], positions: next } });
  };

  const setEnabled = (section: keyof BrandImageOptions, enabled: boolean) => {
    if (section === 'imageSet') {
      const base = value.imageSet ?? { enabled: false, positions: ['bottom'] as ('top'|'middle'|'bottom')[], setId: undefined };
      onChange({ ...value, imageSet: { ...base, enabled } });
      return;
    }
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
        label="끝맺음 이미지 세트 (LRU 순환 + 동적 변형)"
        enabled={value.imageSet?.enabled ?? false}
        onEnabledChange={(v) => setEnabled('imageSet', v)}
        disabled={disabled || sets.length === 0}
      >
        {sets.length === 0 ? (
          <p className="text-xs text-at-text-weak">
            세트가 없습니다 —{' '}
            <Link href="/dashboard/marketing/brand" className="text-at-accent underline">설정 페이지</Link>
            에서 먼저 세트를 만들어주세요.
          </p>
        ) : (
          <>
            <div className="mt-2">
              <label className="block text-xs text-at-text-secondary mb-1">사용할 세트</label>
              <select
                value={value.imageSet?.setId ?? ''}
                onChange={(e) => {
                  const base = value.imageSet ?? { enabled: false, positions: ['bottom' as const] };
                  onChange({ ...value, imageSet: { ...base, setId: e.target.value || undefined } });
                }}
                disabled={disabled || !(value.imageSet?.enabled)}
                className="w-full px-2 py-1.5 border border-at-border rounded text-xs disabled:bg-at-surface-alt"
              >
                <option value="">선택하세요…</option>
                {sets.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.cards.length}장)
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2">
              <PositionPicker
                positions={value.imageSet?.positions ?? []}
                onToggle={(p) => togglePosition('imageSet', p)}
                disabled={disabled || !(value.imageSet?.enabled)}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-at-text-weak leading-relaxed">
              매번 다른 카드가 LRU 순서로 자동 선택되며, 발행 시점에 크롭·색조·텍스트 오버레이를 미세 변형해
              네이버 유사이미지 판독을 회피합니다.
            </p>
          </>
        )}
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
