'use client';
import { useEffect, useState } from 'react';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import {
  BrandSettingsForm,
  fromAssets,
  type BrandFormState,
} from '@/components/marketing/brand/BrandSettingsForm';
import { BrandPhotoUploader } from '@/components/marketing/brand/BrandPhotoUploader';
import { BrandPreview } from '@/components/marketing/brand/BrandPreview';
import { BrandImageSetsManager } from '@/components/marketing/brand/BrandImageSetsManager';
import type { DraftBrandAssets } from '@/types/brand';

interface Props {
  canManage: boolean;
  /** true면 페이지 헤더와 외곽 padding을 생략 (서브탭/모달 안에서 사용) */
  embedded?: boolean;
}

function toDraftAssets(state: BrandFormState): DraftBrandAssets {
  return {
    name_ko: state.name_ko || null,
    name_en: state.name_en || null,
    logo_url: state.logo_url || null,
    primary_color: state.primary_color,
    secondary_color: state.secondary_color,
    slogan: state.slogan || null,
    medical_law_preset: state.medical_law_preset,
    medical_law_top_text: state.medical_law_top_text,
    medical_law_bottom_text: state.medical_law_bottom_text,
    title_border_width: state.title_border_width,
  };
}

export function BrandSettingsClient({ canManage, embedded = false }: Props) {
  const { assets, photos, loading, saveAssets, uploadPhoto, deletePhoto, updatePhoto } = useBrandAssets();
  const [formState, setFormState] = useState<BrandFormState>(() => fromAssets(null));
  const [saving, setSaving] = useState(false);

  // 자산 로드/갱신 시 폼 초기화 (사용자가 수정 중이면 덮어쓰지 않음)
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!loading && !initialized) {
      setFormState(fromAssets(assets));
      setInitialized(true);
    }
  }, [loading, initialized, assets]);

  const handleLogoUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/marketing/brand/logo', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    return json.url;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveAssets({
        name_ko: formState.name_ko || null,
        name_en: formState.name_en || null,
        logo_url: formState.logo_url || null,
        primary_color: formState.primary_color,
        secondary_color: formState.secondary_color,
        slogan: formState.slogan || null,
        medical_law_preset: formState.medical_law_preset,
        medical_law_top_text: formState.medical_law_top_text,
        medical_law_bottom_text: formState.medical_law_bottom_text,
        title_border_width: formState.title_border_width,
      });
      // 저장 완료 후 폼을 서버 결과로 동기화
      setFormState(fromAssets(saved));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-at-text-weak">불러오는 중…</div>;

  // 라이브 미리보기용 draft. 저장된 자산이 없으면 BrandPreview는 안내만 표시하므로 무관.
  const draftAssets = canManage ? toDraftAssets(formState) : undefined;

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>
      {!embedded && (
        <header>
          <h1 className="text-2xl font-bold text-at-text">브랜드 이미지 설정</h1>
          <p className="text-sm text-at-text-secondary mt-1">블로그 글에 자동으로 삽입될 의료법 안내·텍스트 카드·사진 오버레이의 디자인 자산을 설정합니다.</p>
        </header>
      )}
      {embedded && (
        <p className="text-sm text-at-text-secondary">블로그 글에 자동으로 삽입될 의료법 안내·텍스트 카드·사진 오버레이의 디자인 자산을 설정합니다.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-4">자산 입력</h2>
            {canManage ? (
              <BrandSettingsForm
                state={formState}
                onChange={setFormState}
                onSave={handleSave}
                onLogoUpload={handleLogoUpload}
                saving={saving}
              />
            ) : (
              <p className="text-sm text-at-text-weak">조회만 가능합니다 (자산 관리 권한 없음).</p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-4">병원 사진 ({photos.length}장)</h2>
            {canManage ? (
              <BrandPhotoUploader
                photos={photos}
                onUpload={uploadPhoto}
                onDelete={deletePhoto}
                onUpdateCaption={(id, caption) => updatePhoto(id, { caption })}
              />
            ) : (
              <p className="text-sm text-at-text-weak">조회만 가능합니다.</p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-1">끝맺음 브랜드 이미지 세트</h2>
            <p className="text-xs text-at-text-weak mb-4">AI 글의 마지막 부분에 자동 첨가될 이미지 카드 묶음을 만들고 관리합니다.</p>
            <BrandImageSetsManager canManage={canManage} />
          </section>
        </div>

        <aside className="lg:col-span-1">
          <section className="bg-white rounded-xl border border-at-border p-5 sticky top-4">
            <h2 className="text-sm font-semibold text-at-text mb-4">미리보기 (수정 시 즉시 반영)</h2>
            <BrandPreview assets={assets} photos={photos} draftAssets={draftAssets} />
          </section>
        </aside>
      </div>
    </div>
  );
}
