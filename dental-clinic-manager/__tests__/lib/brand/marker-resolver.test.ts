import { describe, it, expect } from 'vitest';
import { parseBrandMarkers } from '@/lib/marketing/brand/marker-resolver';

describe('parseBrandMarkers', () => {
  it('detects medical_law marker', () => {
    const markers = parseBrandMarkers('hello [BRAND_IMAGE:medical_law] world');
    expect(markers).toEqual([{ raw: '[BRAND_IMAGE:medical_law]', type: 'medical_law', params: {}, index: 6 }]);
  });

  it('parses title with copy parameter', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:title|copy=강남숙면치과 / 임플란트]');
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe('title');
    expect(markers[0].params.copy).toBe('강남숙면치과 / 임플란트');
  });

  it('parses photo with id', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:photo|id=abc-123]');
    expect(markers[0].type).toBe('photo');
    expect(markers[0].params.id).toBe('abc-123');
  });

  it('parses photo with mode', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:photo|mode=random]');
    expect(markers[0].params.mode).toBe('random');
  });

  it('returns empty for body without markers', () => {
    expect(parseBrandMarkers('no markers here')).toEqual([]);
  });
});
