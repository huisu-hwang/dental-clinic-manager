import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import SharedPostView from './SharedPostView'
import type { SharedPostData } from '@/types/sharedLink'

interface PageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: '공유된 게시물 | 하얀치과' }
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

  return <SharedPostView postData={postData} />
}
