import { describe, it, expect } from 'vitest';
import { computeCacheKey } from '@/lib/marketing/brand/cache-key';
import type { BrandAssets } from '@/types/brand';

const sampleAssets: BrandAssets = {
  id: 'a',
  clinic_id: 'c',
  name_ko: '강남숙면치과',
  name_en: 'GANGNAM SM',
  logo_url: 'https://example/logo.png',
  primary_color: '#1B5E20',
  secondary_color: '#FFC107',
  slogan: '책임진료',
  medical_law_preset: 'yellow_black',
  medical_law_top_text: '본 포스팅은…',
  medical_law_bottom_text: '모든 시술…',
  created_at: '',
  updated_at: '',
};

describe('computeCacheKey', () => {
  it('same inputs → same key (deterministic)', () => {
    const a = computeCacheKey('medical_law', sampleAssets, {});
    const b = computeCacheKey('medical_law', sampleAssets, {});
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{40}$/); // sha1 hex
  });

  it('different copy → different title key', () => {
    const a = computeCacheKey('title', sampleAssets, { copy: 'A' });
    const b = computeCacheKey('title', sampleAssets, { copy: 'B' });
    expect(a).not.toBe(b);
  });

  it('photo key depends only on photoId + name + logo', () => {
    const a = computeCacheKey('photo', sampleAssets, { photoId: 'p1' });
    const b = computeCacheKey('photo', sampleAssets, { photoId: 'p1' });
    const c = computeCacheKey('photo', sampleAssets, { photoId: 'p2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('medical_law key ignores primary_color (irrelevant input)', () => {
    const a = computeCacheKey('medical_law', sampleAssets, {});
    const b = computeCacheKey('medical_law', { ...sampleAssets, primary_color: '#000000' }, {});
    expect(a).toBe(b);
  });
});
