import { renderBrandImage } from './render-engine';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandAssets, BrandImageType, BrandPhoto } from '@/types/brand';

export interface BrandMarker {
  raw: string;
  type: BrandImageType;
  params: Record<string, string>;
  index: number;
}

const MARKER_RE = /\[BRAND_IMAGE:([a-z_]+)(?:\|([^\]]*))?\]/g;

export function parseBrandMarkers(body: string): BrandMarker[] {
  const out: BrandMarker[] = [];
  for (const m of body.matchAll(MARKER_RE)) {
    const type = m[1] as BrandImageType;
    if (type !== 'medical_law' && type !== 'title' && type !== 'photo') continue;
    const params: Record<string, string> = {};
    if (m[2]) {
      for (const pair of m[2].split('|')) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        params[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    }
    out.push({ raw: m[0], type, params, index: m.index ?? 0 });
  }
  return out;
}

interface ResolveContext {
  clinicId: string;
  rotateCounter?: number;
}

export async function resolveBrandMarkers(body: string, ctx: ResolveContext): Promise<string> {
  const markers = parseBrandMarkers(body);
  if (markers.length === 0) return body;

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('admin 미가용');

  const { data: assets } = await (admin as any)
    .from('clinic_brand_assets')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();
  if (!assets) return body.replace(/\[BRAND_IMAGE:[^\]]+\]/g, '');
  const a = assets as BrandAssets;

  const { data: photoRows } = await (admin as any)
    .from('clinic_brand_photos')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true });
  const photos = (photoRows ?? []) as BrandPhoto[];

  let out = body;
  let rotateIdx = ctx.rotateCounter ?? 0;

  // markers index가 변동되므로 끝에서부터 치환
  for (const marker of markers.slice().reverse()) {
    let url = '';
    try {
      if (marker.type === 'medical_law') {
        url = await renderBrandImage({ type: 'medical_law', assets: a });
      } else if (marker.type === 'title') {
        // copy 가 비었거나 placeholder('/' 만) 면 의미 없는 카드가 생성되므로 폼/상위에서 articleTitle 자동 채움이 우선.
        // 여기는 최후 fallback — 클리닉명만이라도 노출.
        const rawCopy = (marker.params.copy || '').trim();
        const looksEmpty = rawCopy.length === 0 || /^\/+\s*$/.test(rawCopy);
        const copy = looksEmpty ? (a.name_ko ?? a.name_en ?? '').trim() : rawCopy;
        url = await renderBrandImage({ type: 'title', assets: a, copy });
      } else if (marker.type === 'photo') {
        let chosen: BrandPhoto | undefined;
        if (marker.params.id) {
          chosen = photos.find(p => p.id === marker.params.id);
        } else if (marker.params.mode === 'rotate') {
          if (photos.length > 0) chosen = photos[rotateIdx++ % photos.length];
        } else if (marker.params.mode === 'random' || !marker.params.mode) {
          if (photos.length > 0) chosen = photos[Math.floor(Math.random() * photos.length)];
        }
        if (chosen) url = await renderBrandImage({ type: 'photo', assets: a, photo: chosen });
      }
    } catch (err) {
      const e = err as { message?: string; stack?: string };
      console.error('[brand marker resolve] error:', {
        type: marker.type,
        params: marker.params,
        message: e?.message,
      });
    }
    const replacement = url ? `\n\n![](${url})\n\n` : '';
    out = out.slice(0, marker.index) + replacement + out.slice(marker.index + marker.raw.length);
  }

  return out;
}
