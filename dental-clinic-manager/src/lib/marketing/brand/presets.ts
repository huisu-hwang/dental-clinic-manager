import type { MedicalLawPreset, MedicalLawPresetKey } from '@/types/brand';

export const MEDICAL_LAW_PRESETS: Record<MedicalLawPresetKey, MedicalLawPreset> = {
  yellow_black: {
    key: 'yellow_black',
    label: '노랑/블랙 — 강한 시인성',
    background: '#FBC531',
    accent: '#1B1B1B',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#1B1B1B',
  },
  mint_navy: {
    key: 'mint_navy',
    label: '민트그린/네이비 — 청결·신뢰',
    background: '#A8E6CF',
    accent: '#1A237E',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#0D1B5E',
  },
  sand_green: {
    key: 'sand_green',
    label: '샌드베이지/다크그린 — 차분·자연',
    background: '#F5E6CA',
    accent: '#2E5339',
    textOnAccent: '#F5E6CA',
    textOnBackground: '#2E5339',
  },
  pink_charcoal: {
    key: 'pink_charcoal',
    label: '소프트핑크/차콜 — 따뜻함',
    background: '#F8C9D4',
    accent: '#3A3A3A',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#3A3A3A',
  },
  white_blue: {
    key: 'white_blue',
    label: '퓨어화이트/딥블루 — 미니멀',
    background: '#FFFFFF',
    accent: '#0B3D91',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#0B3D91',
  },
};

export const MEDICAL_LAW_PRESET_LIST = Object.values(MEDICAL_LAW_PRESETS);
