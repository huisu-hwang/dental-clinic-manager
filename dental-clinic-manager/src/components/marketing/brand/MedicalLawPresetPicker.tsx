'use client';
import { MEDICAL_LAW_PRESET_LIST } from '@/lib/marketing/brand/presets';
import type { MedicalLawPresetKey } from '@/types/brand';

interface Props {
  value: MedicalLawPresetKey;
  onChange: (key: MedicalLawPresetKey) => void;
}

export function MedicalLawPresetPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {MEDICAL_LAW_PRESET_LIST.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
            value === p.key ? 'border-at-accent shadow-md' : 'border-at-border hover:border-at-text-weak'
          }`}
        >
          <div className="h-20 flex" style={{ background: p.background }}>
            <div className="flex-1" />
            <div className="w-1/3 flex items-center justify-center" style={{ background: p.accent, color: p.textOnAccent, fontSize: 11, fontWeight: 700 }}>
              {p.label.split(' — ')[0]}
            </div>
          </div>
          <div className="px-2 py-1.5 bg-white">
            <p className="text-[11px] font-medium text-at-text">{p.label.split(' — ')[0]}</p>
            <p className="text-[10px] text-at-text-weak">{p.label.split(' — ')[1] ?? ''}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
