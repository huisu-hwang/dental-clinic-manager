'use client';
import { useState, useEffect } from 'react';
import type { BrandAssets, MedicalLawPresetKey } from '@/types/brand';
import { MedicalLawPresetPicker } from './MedicalLawPresetPicker';

interface Props {
  assets: BrandAssets | null;
  onSave: (input: Partial<BrandAssets>) => Promise<BrandAssets>;
  onLogoUpload: (file: File) => Promise<string>;
}

export function BrandSettingsForm({ assets, onSave, onLogoUpload }: Props) {
  const [nameKo, setNameKo] = useState(assets?.name_ko ?? '');
  const [nameEn, setNameEn] = useState(assets?.name_en ?? '');
  const [logoUrl, setLogoUrl] = useState(assets?.logo_url ?? '');
  const [primary, setPrimary] = useState(assets?.primary_color ?? '#1B5E20');
  const [secondary, setSecondary] = useState(assets?.secondary_color ?? '#FFC107');
  const [slogan, setSlogan] = useState(assets?.slogan ?? '');
  const [preset, setPreset] = useState<MedicalLawPresetKey>(assets?.medical_law_preset ?? 'yellow_black');
  const [topText, setTopText] = useState(assets?.medical_law_top_text ?? '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.');
  const [bottomText, setBottomText] = useState(assets?.medical_law_bottom_text ?? '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assets) return;
    setNameKo(assets.name_ko ?? '');
    setNameEn(assets.name_en ?? '');
    setLogoUrl(assets.logo_url ?? '');
    setPrimary(assets.primary_color);
    setSecondary(assets.secondary_color);
    setSlogan(assets.slogan ?? '');
    setPreset(assets.medical_law_preset);
    setTopText(assets.medical_law_top_text);
    setBottomText(assets.medical_law_bottom_text);
  }, [assets]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({
        name_ko: nameKo || null,
        name_en: nameEn || null,
        logo_url: logoUrl || null,
        primary_color: primary,
        secondary_color: secondary,
        slogan: slogan || null,
        medical_law_preset: preset,
        medical_law_top_text: topText,
        medical_law_bottom_text: bottomText,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleLogo = async (file: File) => {
    try {
      const url = await onLogoUpload(file);
      setLogoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로고 업로드 실패');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="클리닉명 (한글)">
          <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} className={inputCls} placeholder="강남숙면치과" />
        </Field>
        <Field label="클리닉명 (영문)">
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} placeholder="GANGNAM SM DENTAL CLINIC" />
        </Field>
      </div>

      <Field label="로고 이미지">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-16 w-16 object-contain bg-white border border-at-border rounded" />
          )}
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-at-border rounded-lg hover:bg-at-surface-alt text-sm">
            업로드
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); }} />
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="주 브랜드 컬러">
          <div className="flex items-center gap-2">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={primary} onChange={(e) => setPrimary(e.target.value)} className={inputCls} />
          </div>
        </Field>
        <Field label="보조 브랜드 컬러">
          <div className="flex items-center gap-2">
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inputCls} />
          </div>
        </Field>
      </div>

      <Field label="슬로건 (텍스트 이미지 상단)">
        <input value={slogan} onChange={(e) => setSlogan(e.target.value)} className={inputCls} placeholder="보건복지부 인증 치주과 전문의 의료진의 책임진료!" />
      </Field>

      <Field label="의료법 안내 컬러 프리셋">
        <MedicalLawPresetPicker value={preset} onChange={setPreset} />
      </Field>

      <Field label="의료법 안내 — 상단 문장">
        <textarea value={topText} onChange={(e) => setTopText(e.target.value)} className={`${inputCls} min-h-[60px]`} />
        <p className="text-[11px] text-at-text-weak mt-1">{'`{clinic_name}`은 클리닉명으로 자동 치환됩니다.'}</p>
      </Field>

      <Field label="의료법 안내 — 하단 문장">
        <textarea value={bottomText} onChange={(e) => setBottomText(e.target.value)} className={`${inputCls} min-h-[60px]`} />
      </Field>

      {error && <p className="text-sm text-at-error">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-at-accent text-white rounded-lg text-sm font-medium hover:bg-at-accent-hover disabled:opacity-50"
      >
        {saving ? '저장 중…' : '브랜드 자산 저장'}
      </button>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-at-text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  );
}
