'use client';
import { BRAND_COLOR_PRESETS, type BrandColorPreset } from '@/lib/marketing/brand/presets';

interface Props {
  primary: string;
  secondary: string;
  onSelect: (preset: BrandColorPreset) => void;
}

function normalize(c: string) {
  return (c || '').trim().toLowerCase();
}

export function BrandColorPresetPicker({ primary, secondary, onSelect }: Props) {
  const activeKey = BRAND_COLOR_PRESETS.find(
    p => normalize(p.primary) === normalize(primary) && normalize(p.secondary) === normalize(secondary)
  )?.key;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {BRAND_COLOR_PRESETS.map(p => {
        const selected = activeKey === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p)}
            className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
              selected ? 'border-at-accent shadow-md' : 'border-at-border hover:border-at-text-weak'
            }`}
          >
            <div className="flex h-12">
              <div className="flex-1" style={{ background: p.primary }} />
              <div className="w-1/3" style={{ background: p.secondary }} />
            </div>
            <div className="px-2 py-1.5 bg-white">
              <p className="text-[11px] font-semibold text-at-text leading-tight">{p.label}</p>
              <p className="text-[10px] text-at-text-weak leading-tight">{p.description}</p>
            </div>
            {selected && (
              <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-at-accent text-white text-[10px] font-bold">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
