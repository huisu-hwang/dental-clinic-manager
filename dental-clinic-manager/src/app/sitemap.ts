import type { MetadataRoute } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]

  // 활성 공개 공유 링크를 사이트맵에 포함
  try {
    const supabase = getSupabaseAdmin()
    if (supabase) {
      const { data: publicLinks } = await supabase
        .from('shared_links')
        .select('token, created_at')
        .eq('is_active', true)
        .eq('access_level', 'public')
        .order('created_at', { ascending: false })
        .limit(200)

      if (publicLinks) {
        for (const link of publicLinks) {
          entries.push({
            url: `${SITE_URL}/shared/${link.token}`,
            lastModified: new Date(link.created_at),
            changeFrequency: 'weekly',
            priority: 0.7,
          })
        }
      }
    }
  } catch (error) {
    console.error('[Sitemap] 공유 링크 조회 실패:', error)
  }

  return entries
}
