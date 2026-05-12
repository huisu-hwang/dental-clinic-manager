import type { MedicalLawPreset, MedicalLawPresetKey } from '@/types/brand';

export interface BrandColorPreset {
  key: string;
  label: string;
  description: string;
  primary: string;
  secondary: string;
}

export const BRAND_COLOR_PRESETS: BrandColorPreset[] = [
  {
    key: 'trust_blue',
    label: '신뢰 블루',
    description: '청결·전문성',
    primary: '#0B5394',
    secondary: '#4FC3F7',
  },
  {
    key: 'fresh_mint',
    label: '프레시 민트',
    description: '청량·위생',
    primary: '#00897B',
    secondary: '#B2DFDB',
  },
  {
    key: 'natural_green',
    label: '내추럴 그린',
    description: '자연·편안함',
    primary: '#1B5E20',
    secondary: '#C5E1A5',
  },
  {
    key: 'warm_coral',
    label: '웜 코랄',
    description: '친근·따뜻함',
    primary: '#E64A19',
    secondary: '#FFCCBC',
  },
  {
    key: 'soft_rose',
    label: '소프트 로즈',
    description: '부드러움·여성',
    primary: '#C2185B',
    secondary: '#F8BBD0',
  },
  {
    key: 'premium_navy',
    label: '프리미엄 네이비',
    description: '고급·전문',
    primary: '#1A237E',
    secondary: '#FFC107',
  },
  {
    key: 'modern_charcoal',
    label: '모던 차콜',
    description: '미니멀·세련',
    primary: '#263238',
    secondary: '#90A4AE',
  },
  {
    key: 'wood_brown',
    label: '우디 브라운',
    description: '내추럴·차분',
    primary: '#5D4037',
    secondary: '#D7CCC8',
  },
  {
    key: 'royal_purple',
    label: '로얄 퍼플',
    description: '고급·우아함',
    primary: '#4527A0',
    secondary: '#D1C4E9',
  },
  {
    key: 'sunny_amber',
    label: '서니 앰버',
    description: '활기·밝음',
    primary: '#F57C00',
    secondary: '#FFE0B2',
  },
  {
    key: 'sky_breeze',
    label: '스카이 브리즈',
    description: '시원·개방감',
    primary: '#0277BD',
    secondary: '#E1F5FE',
  },
  {
    key: 'forest_sage',
    label: '포레스트 세이지',
    description: '안정·평온',
    primary: '#2E5339',
    secondary: '#DCE8D5',
  },
];

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
