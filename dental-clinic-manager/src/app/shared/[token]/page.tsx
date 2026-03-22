import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import SharedPostView from './SharedPostView'
import type { SharedPostData } from '@/types/sharedLink'
import { SOURCE_TYPE_LABELS } from '@/types/sharedLink'

interface PageProps {
  params: Promise<{ token: string }>
}

// 동적 OG 메타데이터 생성
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params

  try {
    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) throw new Error('DB 연결 실패')

    // 토큰으로 공유 링크 조회
    const { data: link } = await supabaseAdmin
      .from('shared_links')
      .select('source_type, source_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (!link) throw new Error('링크 없음')

    let title = ''
    let description = ''

    if (link.source_type === 'announcement') {
      const { data } = await supabaseAdmin
        .from('announcements')
        .select('title, content')
        .eq('id', link.source_id)
        .single()
      if (data) {
        title = data.title
        description = (data.content || '').replace(/<[^>]*>/g, '').slice(0, 150)
      }
    } else if (link.source_type === 'document') {
      const { data } = await supabaseAdmin
        .from('documents')
        .select('title, description, content')
        .eq('id', link.source_id)
        .single()
      if (data) {
        title = data.title
        description = data.description || (data.content || '').replace(/<[^>]*>/g, '').slice(0, 150)
      }
    } else if (link.source_type === 'community_post') {
      const { data } = await supabaseAdmin
        .from('community_posts')
        .select('title, content')
        .eq('id', link.source_id)
        .single()
      if (data) {
        title = data.title
        description = (data.content || '').replace(/<[^>]*>/g, '').slice(0, 150)
      }
    }

    if (!title) throw new Error('게시글 없음')

    const sourceLabel = SOURCE_TYPE_LABELS[link.source_type as keyof typeof SOURCE_TYPE_LABELS] || '게시물'
    const fullTitle = `${title} - 하얀치과 ${sourceLabel}`
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'
    const canonicalUrl = `${siteUrl}/shared/${token}`

    return {
      title: fullTitle,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: fullTitle,
        description,
        url: canonicalUrl,
        type: 'article',
        siteName: '클리닉 매니저',
        locale: 'ko_KR',
      },
      twitter: {
        card: 'summary',
        title: fullTitle,
        description,
      },
      robots: {
        index: true,
        follow: false,
        'max-snippet': -1,
      },
      other: {
        'article:published_time': new Date().toISOString(),
      },
    }
  } catch {
    return {
      title: '공유된 게시물 | 클리닉 매니저',
      description: '하얀치과 대시보드에서 공유한 게시글입니다.',
    }
  }
}

export default async function SharedPage({ params }: PageProps) {
  const { token } = await params
  const supabaseAdmin = getSupabaseAdmin()

  if (!supabaseAdmin) {
    return notFound()
  }

  // 1. 토큰으로 공유 링크 조회
  const { data: link } = await supabaseAdmin
    .from('shared_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!link) return notFound()

  // 2. 인증 확인 (authenticated 레벨)
  if (link.access_level === 'authenticated') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return <SharedPostView loginRequired />
    }
  }

  // 3. 게시물 데이터 조회
  let postData: SharedPostData | null = null

  if (link.source_type === 'announcement') {
    const { data } = await supabaseAdmin
      .from('announcements')
      .select('title, content, author_id, category, is_important, start_date, end_date, created_at')
      .eq('id', link.source_id)
      .single()

    if (data) {
      const { data: author } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('id', data.author_id)
        .single()

      postData = {
        source_type: 'announcement',
        access_level: link.access_level as 'authenticated' | 'public',
        title: data.title,
        content: data.content || '',
        author_name: author?.name || '알 수 없음',
        created_at: data.created_at,
        category: data.category,
        is_important: data.is_important,
        start_date: data.start_date,
        end_date: data.end_date,
      }
    }
  } else if (link.source_type === 'document') {
    const { data } = await supabaseAdmin
      .from('documents')
      .select('title, content, description, file_url, file_name, file_size, author_id, created_at')
      .eq('id', link.source_id)
      .single()

    if (data) {
      const { data: author } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('id', data.author_id)
        .single()

      postData = {
        source_type: 'document',
        access_level: link.access_level as 'authenticated' | 'public',
        title: data.title,
        content: data.content || '',
        author_name: author?.name || '알 수 없음',
        created_at: data.created_at,
        description: data.description,
        file_url: data.file_url,
        file_name: data.file_name,
        file_size: data.file_size,
      }
    }
  } else if (link.source_type === 'community_post') {
    const { data } = await supabaseAdmin
      .from('community_posts')
      .select('title, content, category, created_at, profile_id')
      .eq('id', link.source_id)
      .single()

    if (data) {
      const { data: profile } = await supabaseAdmin
        .from('community_profiles')
        .select('nickname')
        .eq('id', data.profile_id)
        .single()

      postData = {
        source_type: 'community_post',
        access_level: link.access_level as 'authenticated' | 'public',
        title: data.title,
        content: data.content || '',
        author_name: profile?.nickname || '익명',
        created_at: data.created_at,
        category: data.category,
      }
    }
  }

  if (!postData) return notFound()

  // JSON-LD 구조화 데이터 (Article 스키마)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'
  const plainText = postData.content.replace(/<[^>]*>/g, '').slice(0, 300)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: postData.title,
    description: plainText,
    author: {
      '@type': 'Person',
      name: postData.author_name,
    },
    publisher: {
      '@type': 'Organization',
      name: '클리닉 매니저',
      url: siteUrl,
    },
    datePublished: postData.created_at,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/shared/${token}`,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SharedPostView postData={postData} />
    </>
  )
}
