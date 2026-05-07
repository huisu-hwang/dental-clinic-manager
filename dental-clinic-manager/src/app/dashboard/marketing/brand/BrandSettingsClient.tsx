'use client';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { BrandSettingsForm } from '@/components/marketing/brand/BrandSettingsForm';
import { BrandPhotoUploader } from '@/components/marketing/brand/BrandPhotoUploader';
import { BrandPreview } from '@/components/marketing/brand/BrandPreview';

interface Props { canManage: boolean }

export function BrandSettingsClient({ canManage }: Props) {
  const { assets, photos, loading, saveAssets, uploadPhoto, deletePhoto, updatePhoto } = useBrandAssets();

  const handleLogoUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/marketing/brand/logo', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    return json.url;
  };

  if (loading) return <div className="p-8 text-sm text-at-text-weak">불러오는 중…</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-at-text">브랜드 이미지 설정</h1>
        <p className="text-sm text-at-text-secondary mt-1">블로그 글에 자동으로 삽입될 의료법 안내·텍스트 카드·사진 오버레이의 디자인 자산을 설정합니다.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-4">자산 입력</h2>
            {canManage ? (
              <BrandSettingsForm assets={assets} onSave={saveAssets} onLogoUpload={handleLogoUpload} />
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
        </div>

        <aside className="lg:col-span-1">
          <section className="bg-white rounded-xl border border-at-border p-5 sticky top-4">
            <h2 className="text-sm font-semibold text-at-text mb-4">미리보기</h2>
            <BrandPreview assets={assets} photos={photos} />
          </section>
        </aside>
      </div>
    </div>
  );
}
