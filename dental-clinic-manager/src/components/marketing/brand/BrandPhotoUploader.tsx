'use client';
import { useRef } from 'react';
import type { BrandPhoto } from '@/types/brand';
import { TrashIcon, PhotoIcon } from '@heroicons/react/24/outline';

interface Props {
  photos: BrandPhoto[];
  onUpload: (file: File) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onUpdateCaption: (id: string, caption: string) => Promise<void>;
}

export function BrandPhotoUploader({ photos, onUpload, onDelete, onUpdateCaption }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      try { await onUpload(f); } catch (e) { console.error(e); }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-at-border rounded-xl p-6 text-center hover:border-at-accent cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <PhotoIcon className="h-8 w-8 mx-auto text-at-text-weak" />
        <p className="text-sm text-at-text-secondary mt-2">사진을 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-at-text-weak mt-0.5">JPG/PNG, 10MB 이하 — 갯수 제한 없음</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="rounded-lg border border-at-border overflow-hidden bg-white">
              <div className="aspect-[4/3] bg-at-surface-alt">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="p-2 space-y-1.5">
                <input
                  type="text"
                  defaultValue={photo.caption ?? ''}
                  placeholder="캡션 (예: 임플란트 시술실)"
                  onBlur={(e) => onUpdateCaption(photo.id, e.target.value)}
                  className="w-full text-xs px-1.5 py-1 border border-at-border rounded"
                />
                <button
                  type="button"
                  onClick={() => onDelete(photo.id)}
                  className="text-[11px] text-red-600 hover:underline inline-flex items-center gap-1"
                >
                  <TrashIcon className="h-3 w-3" /> 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
