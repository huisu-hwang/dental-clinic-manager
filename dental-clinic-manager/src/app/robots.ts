import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/shared/'],
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/master/',
          '/attendance/',
          '/community/',
          '/bulletin/',
          '/management/',
          '/guide/',
          '/qr/',
          '/auth/',
          '/pending-approval',
          '/resigned',
          '/update-password',
          '/signup',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
