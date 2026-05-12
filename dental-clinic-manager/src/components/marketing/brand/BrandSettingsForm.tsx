'use client';
import { useState } from 'react';
import type { BrandAssets, MedicalLawPresetKey } from '@/types/brand';
import { MedicalLawPresetPicker } from './MedicalLawPresetPicker';
import { BrandColorPresetPicker } from './BrandColorPresetPicker';

export interface BrandFormState {
  name_ko: string;
  name_en: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  slogan: string;
  medical_law_preset: MedicalLawPresetKey;
  medical_law_top_text: string;
  medical_law_bottom_text: string;
  title_border_width: number;
}

export const DEFAULT_FORM_STATE: BrandFormState = {
  name_ko: '',
  name_en: '',
  logo_url: '',
  primary_color: '#1B5E20',
  secondary_color: '#FFC107',
  slogan: '',
  medical_law_preset: 'yellow_black',
  medical_law_top_text: '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.',
  medical_law_bottom_text: '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.',
  title_border_width: 16,
};

export function fromAssets(a: BrandAssets | null): BrandFormState {
  if (!a) return DEFAULT_FORM_STATE;
  return {
    name_ko: a.name_ko ?? '',
    name_en: a.name_en ?? '',
    logo_url: a.logo_url ?? '',
    primary_color: a.primary_color || '#1B5E20',
    secondary_color: a.secondary_color || '#FFC107',
    slogan: a.slogan ?? '',
    medical_law_preset: a.medical_law_preset,
    medical_law_top_text: a.medical_law_top_text || DEFAULT_FORM_STATE.medical_law_top_text,
    medical_law_bottom_text: a.medical_law_bottom_text || DEFAULT_FORM_STATE.medical_law_bottom_text,
    title_border_width: typeof a.title_border_width === 'number' ? a.title_border_width : 16,
  };
}

interface Props {
  state: BrandFormState;
  onChange: (next: BrandFormState) => void;
  onSave: () => Promise<void>;
  onLogoUpload: (file: File) => Promise<string>;
  saving?: boolean;
}

export function BrandSettingsForm({ state, onChange, onSave, onLogoUpload, saving }: Props) {
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof BrandFormState>(key: K, value: BrandFormState[K]) => {
    onChange({ ...state, [key]: value });
  };

  const handleSave = async () => {
    setError(null);
    try {
      await onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    }
  };

  const handleLogo = async (file: File) => {
    try {
      const url = await onLogoUpload(file);
      update('logo_url', url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로고 업로드 실패');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="클리닉명 (한글)">
          <input value={state.name_ko} onChange={(e) => update('name_ko', e.target.value)} className={inputCls} placeholder="강남숙면치과" />
        </Field>
        <Field label="클리닉명 (영문)">
          <input value={state.name_en} onChange={(e) => update('name_en', e.target.value)} className={inputCls} placeholder="GANGNAM SM DENTAL CLINIC" />
        </Field>
      </div>

      <Field label="로고 이미지">
        <div className="flex items-center gap-3">
          {state.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.logo_url} alt="" className="h-16 w-16 object-contain bg-white border border-at-border rounded" />
          )}
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-at-border rounded-lg hover:bg-at-surface-alt text-sm">
            업로드
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); }} />
          </label>
        </div>
      </Field>

      <Field label="브랜드 컬러 조합 프리셋">
        <BrandColorPresetPicker
          primary={state.primary_color}
          secondary={state.secondary_color}
          onSelect={(p) => onChange({ ...state, primary_color: p.primary, secondary_color: p.secondary })}
        />
        <p className="text-[11px] text-at-text-weak mt-2">프리셋을 선택하면 주/보조 컬러가 함께 설정됩니다. 아래에서 직접 조정도 가능합니다.</p>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="주 브랜드 컬러 (텍스트 카드 테두리)">
          <div className="flex items-center gap-2">
            <input type="color" value={state.primary_color} onChange={(e) => update('primary_color', e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={state.primary_color} onChange={(e) => update('primary_color', e.target.value)} className={inputCls} />
          </div>
        </Field>
        <Field label="보조 브랜드 컬러">
          <div className="flex items-center gap-2">
            <input type="color" value={state.secondary_color} onChange={(e) => update('secondary_color', e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={state.secondary_color} onChange={(e) => update('secondary_color', e.target.value)} className={inputCls} />
          </div>
        </Field>
      </div>

      <Field label={`테스트 카드 테두리 두께 (${state.title_border_width}px)`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={60}
            step={2}
            value={state.title_border_width}
            onChange={(e) => update('title_border_width', Number(e.target.value))}
            className="flex-1 h-2 accent-at-accent cursor-pointer"
          />
          <span className="w-12 text-right text-sm text-at-text-secondary">{state.title_border_width}px</span>
        </div>
        <p className="text-[11px] text-at-text-weak mt-1">0px(테두리 없음) ~ 60px. 주 브랜드 컬러로 적용됩니다.</p>
      </Field>

      <Field label="슬로건 (텍스트 이미지 상단)">
        <input value={state.slogan} onChange={(e) => update('slogan', e.target.value)} className={inputCls} placeholder="보건복지부 인증 치주과 전문의 의료진의 책임진료!" />
      </Field>

      <Field label="의료법 안내 컬러 프리셋">
        <MedicalLawPresetPicker value={state.medical_law_preset} onChange={(p) => update('medical_law_preset', p)} />
      </Field>

      <Field label="의료법 안내 — 상단 문장">
        <textarea value={state.medical_law_top_text} onChange={(e) => update('medical_law_top_text', e.target.value)} className={`${inputCls} min-h-[60px]`} />
        <p className="text-[11px] text-at-text-weak mt-1">{'`{clinic_name}`은 클리닉명으로 자동 치환됩니다.'}</p>
      </Field>

      <Field label="의료법 안내 — 하단 문장">
        <textarea value={state.medical_law_bottom_text} onChange={(e) => update('medical_law_bottom_text', e.target.value)} className={`${inputCls} min-h-[60px]`} />
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
