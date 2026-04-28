/**
 * 병원 게시판 서비스
 * Bulletin Service - 공지사항, 문서, 업무 지시
 */

import { ensureConnection } from './supabase/connectionCheck'
import { userNotificationService } from './userNotificationService'
import type {
  Announcement,
  CreateAnnouncementDto,
  AnnouncementCategory,
  Document,
  CreateDocumentDto,
  DocumentCategory,
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  TaskStatus,
  TaskPriority,
  TaskComment,
  CreateTaskCommentDto,
  RecurringTaskTemplate,
  CreateRecurringTaskTemplateDto,
  UpdateRecurringTaskTemplateDto,
} from '@/types/bulletin'

// Helper function to extract error message
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }
    if ('error' in error && typeof (error as any).error === 'string') {
      return (error as any).error
    }
  }
  return 'Unknown error occurred'
}

// 현재 클리닉 ID 가져오기
const getCurrentClinicId = (): string | null => {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
}

// 현재 사용자 ID 가져오기
const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return user.id
  } catch {
    return null
  }
}

// 현재 사용자 이름 가져오기
const getCurrentUserName = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return user.name
  } catch {
    return null
  }
}

// 현재 사용자 정보 가져오기
const getCurrentUser = (): { id: string; role: string; clinic_id: string; name: string } | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

// 사용자 이름 조회 헬퍼 함수
const getUserNames = async (supabase: any, userIds: string[]): Promise<Record<string, string>> => {
  if (userIds.length === 0) return {}

  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const { data } = await supabase
    .from('users')
    .select('id, name')
    .in('id', uniqueIds)

  const nameMap: Record<string, string> = {}
  ;(data || []).forEach((user: { id: string; name: string }) => {
    nameMap[user.id] = user.name
  })
  return nameMap
}

// =====================================================
// 공지사항 서비스
// =====================================================
export const announcementService = {
  /**
   * 공지사항 목록 조회
   */
  async getAnnouncements(options?: {
    category?: AnnouncementCategory
    limit?: number
    offset?: number
    search?: string
  }): Promise<{ data: Announcement[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('announcements')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (options?.category) {
        query = query.eq('category', options.category)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,content.ilike.%${options.search}%`)
      }

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) throw error

      // author 이름 조회
      const authorIds = (data || []).map((item: any) => item.author_id)
      const nameMap = await getUserNames(supabase, authorIds)

      // author 정보 매핑
      const announcements = (data || []).map((item: any) => ({
        ...item,
        author_name: nameMap[item.author_id] || '알 수 없음',
      }))

      return { data: announcements, total: count || 0, error: null }
    } catch (error) {
      console.error('[announcementService.getAnnouncements] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 공지사항 상세 조회
   */
  async getAnnouncement(id: string): Promise<{ data: Announcement | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // 조회수 증가
      await (supabase as any).rpc('increment_announcement_view_count', { p_announcement_id: id })

      // author 이름 조회
      const nameMap = await getUserNames(supabase, [data.author_id])

      return {
        data: {
          ...data,
          author_name: nameMap[data.author_id] || '알 수 없음',
        },
        error: null,
      }
    } catch (error) {
      console.error('[announcementService.getAnnouncement] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 공지사항 상세 조회 — 조회수 미증가 (대시보드 미리보기용)
   */
  async getAnnouncementPreview(id: string): Promise<{ data: Announcement | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // author 이름 조회 (조회수 증가 RPC는 호출하지 않음)
      const nameMap = await getUserNames(supabase, [data.author_id])

      return {
        data: {
          ...data,
          author_name: nameMap[data.author_id] || '알 수 없음',
        },
        error: null,
      }
    } catch (error) {
      console.error('[announcementService.getAnnouncementPreview] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 공지사항 생성
   */
  async createAnnouncement(input: CreateAnnouncementDto): Promise<{ data: Announcement | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('announcements')
        .insert({
          clinic_id: clinicId,
          title: input.title,
          content: input.content,
          category: input.category,
          is_pinned: input.is_pinned || false,
          is_important: input.is_important || false,
          start_date: input.start_date || null,
          end_date: input.end_date || null,
          author_id: userId,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[announcementService.createAnnouncement] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 공지사항 수정
   */
  async updateAnnouncement(id: string, input: Partial<CreateAnnouncementDto>): Promise<{ data: Announcement | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('announcements')
        .update({
          ...(input.title && { title: input.title }),
          ...(input.content && { content: input.content }),
          ...(input.category && { category: input.category }),
          ...(input.is_pinned !== undefined && { is_pinned: input.is_pinned }),
          ...(input.is_important !== undefined && { is_important: input.is_important }),
          ...(input.start_date !== undefined && { start_date: input.start_date || null }),
          ...(input.end_date !== undefined && { end_date: input.end_date || null }),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[announcementService.updateAnnouncement] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 공지사항 삭제
   */
  async deleteAnnouncement(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('announcements')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[announcementService.deleteAnnouncement] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 다가오는 일정 조회 (대시보드용)
   */
  async getUpcomingSchedules(limit: number = 5): Promise<{ data: Announcement[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await (supabase as any)
        .from('announcements')
        .select('*')
        .eq('clinic_id', clinicId)
        .in('category', ['schedule', 'holiday'])
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(limit)

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[announcementService.getUpcomingSchedules] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 문서 서비스
// =====================================================
export const documentService = {
  /**
   * 문서 목록 조회
   */
  async getDocuments(options?: {
    category?: DocumentCategory
    limit?: number
    offset?: number
    search?: string
  }): Promise<{ data: Document[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('documents')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      if (options?.category) {
        query = query.eq('category', options.category)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,description.ilike.%${options.search}%`)
      }

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) throw error

      // author 이름 조회
      const authorIds = (data || []).map((item: any) => item.author_id)
      const nameMap = await getUserNames(supabase, authorIds)

      // author 정보 매핑
      const documents = (data || []).map((item: any) => ({
        ...item,
        author_name: nameMap[item.author_id] || '알 수 없음',
      }))

      return { data: documents, total: count || 0, error: null }
    } catch (error) {
      console.error('[documentService.getDocuments] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 문서 상세 조회
   */
  async getDocument(id: string): Promise<{ data: Document | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('documents')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // 조회수 증가
      await (supabase as any).rpc('increment_document_view_count', { p_document_id: id })

      // author 이름 조회
      const nameMap = await getUserNames(supabase, [data.author_id])

      return {
        data: {
          ...data,
          author_name: nameMap[data.author_id] || '알 수 없음',
        },
        error: null,
      }
    } catch (error) {
      console.error('[documentService.getDocument] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 문서 생성
   */
  async createDocument(input: CreateDocumentDto): Promise<{ data: Document | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      const attachments = Array.isArray(input.attachments) ? input.attachments : []
      const firstAttachment = attachments[0]

      const { data, error } = await (supabase as any)
        .from('documents')
        .insert({
          clinic_id: clinicId,
          title: input.title,
          description: input.description || null,
          category: input.category,
          attachments,
          file_url: firstAttachment?.url || null,
          file_name: firstAttachment?.name || null,
          file_size: firstAttachment?.size || null,
          content: input.content || null,
          author_id: userId,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[documentService.createDocument] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 문서 수정
   */
  async updateDocument(id: string, input: Partial<CreateDocumentDto>): Promise<{ data: Document | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const updatePayload: Record<string, unknown> = {
        ...(input.title && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.category && { category: input.category }),
        ...(input.content !== undefined && { content: input.content }),
      }

      if (input.attachments !== undefined) {
        const attachments = Array.isArray(input.attachments) ? input.attachments : []
        const firstAttachment = attachments[0]
        updatePayload.attachments = attachments
        updatePayload.file_url = firstAttachment?.url || null
        updatePayload.file_name = firstAttachment?.name || null
        updatePayload.file_size = firstAttachment?.size || null
      }

      const { data, error } = await (supabase as any)
        .from('documents')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[documentService.updateDocument] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 문서 삭제
   */
  async deleteDocument(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('documents')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[documentService.deleteDocument] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 다운로드 카운트 증가
   */
  async incrementDownloadCount(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      await (supabase as any).rpc('increment_document_download_count', { p_document_id: id })

      return { success: true, error: null }
    } catch (error) {
      console.error('[documentService.incrementDownloadCount] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 업무 서비스
// =====================================================
export const taskService = {
  /**
   * 업무 목록 조회
   */
  async getTasks(options?: {
    status?: TaskStatus
    priority?: TaskPriority
    assignee_id?: string
    limit?: number
    offset?: number
    search?: string
  }): Promise<{ data: Task[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      if (options?.status) {
        query = query.eq('status', options.status)
      }

      if (options?.priority) {
        query = query.eq('priority', options.priority)
      }

      if (options?.assignee_id) {
        query = query.eq('assignee_id', options.assignee_id)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,description.ilike.%${options.search}%`)
      }

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) throw error

      // 사용자 이름 조회
      const userIds = (data || []).flatMap((item: any) => [item.assignee_id, item.assigner_id])
      const nameMap = await getUserNames(supabase, userIds)

      // 각 업무의 댓글 수 조회 및 매핑
      const tasks = await Promise.all(
        (data || []).map(async (item: any) => {
          const { count: commentsCount } = await (supabase as any)
            .from('task_comments')
            .select('*', { count: 'exact', head: true })
            .eq('task_id', item.id)

          return {
            ...item,
            assignee_name: nameMap[item.assignee_id] || '알 수 없음',
            assigner_name: nameMap[item.assigner_id] || '알 수 없음',
            comments_count: commentsCount || 0,
          }
        })
      )

      return { data: tasks, total: count || 0, error: null }
    } catch (error) {
      console.error('[taskService.getTasks] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 업무 목록 조회
   */
  async getMyTasks(options?: {
    status?: TaskStatus
    limit?: number
  }): Promise<{ data: Task[] | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const result = await this.getTasks({
        ...options,
        assignee_id: userId,
      })

      return { data: result.data, error: result.error }
    } catch (error) {
      console.error('[taskService.getMyTasks] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 상세 조회
   */
  async getTask(id: string): Promise<{ data: Task | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // 사용자 이름 조회
      const nameMap = await getUserNames(supabase, [data.assignee_id, data.assigner_id])

      // 댓글 수 조회
      const { count: commentsCount } = await (supabase as any)
        .from('task_comments')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)

      return {
        data: {
          ...data,
          assignee_name: nameMap[data.assignee_id] || '알 수 없음',
          assigner_name: nameMap[data.assigner_id] || '알 수 없음',
          comments_count: commentsCount || 0,
        },
        error: null,
      }
    } catch (error) {
      console.error('[taskService.getTask] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 생성
   */
  async createTask(input: CreateTaskDto): Promise<{ data: Task | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('tasks')
        .insert({
          clinic_id: clinicId,
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'medium',
          assignee_id: input.assignee_id,
          assigner_id: userId,
          due_date: input.due_date || null,
        })
        .select()
        .single()

      if (error) throw error

      // 담당자에게 업무 할당 알림 전송
      if (data && input.assignee_id) {
        const userName = getCurrentUserName()
        userNotificationService.notifyTaskAssigned(
          input.assignee_id,
          userName || '관리자',
          input.title,
          data.id
        ).catch(err => console.error('[taskService.createTask] Notification error:', err))
      }

      return { data, error: null }
    } catch (error) {
      console.error('[taskService.createTask] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 수정
   */
  async updateTask(id: string, input: UpdateTaskDto): Promise<{ data: Task | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const updateData: any = {}
      if (input.title !== undefined) updateData.title = input.title
      if (input.description !== undefined) updateData.description = input.description
      if (input.status !== undefined) {
        updateData.status = input.status
        if (input.status === 'completed') {
          updateData.completed_at = new Date().toISOString()
          updateData.progress = 100
        }
      }
      if (input.priority !== undefined) updateData.priority = input.priority
      if (input.assignee_id !== undefined) updateData.assignee_id = input.assignee_id
      if (input.due_date !== undefined) updateData.due_date = input.due_date || null
      if (input.progress !== undefined) updateData.progress = input.progress

      // 검토 요청 또는 완료 시 알림을 위해 현재 업무 정보를 먼저 조회
      let existingTask: any = null
      if (input.status === 'review' || input.status === 'completed') {
        const { data: taskData } = await (supabase as any)
          .from('tasks')
          .select('assignee_id, assigner_id, title')
          .eq('id', id)
          .single()
        existingTask = taskData
      }

      const { data, error } = await (supabase as any)
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // 검토 요청 시 할당자(결재자)에게 알림 전송
      if (input.status === 'review' && existingTask?.assigner_id) {
        const userName = getCurrentUserName()
        userNotificationService.notifyTaskCompleted(
          existingTask.assigner_id,
          userName || '담당자',
          `[검토 요청] ${existingTask.title}`,
          id
        ).catch(err => console.error('[taskService.updateTask] Review notification error:', err))
      }

      // 업무 완료 승인 시 담당자에게 알림 전송
      if (input.status === 'completed' && existingTask?.assignee_id) {
        const userName = getCurrentUserName()
        userNotificationService.notifyTaskCompleted(
          existingTask.assignee_id,
          userName || '결재자',
          `[완료 승인] ${existingTask.title}`,
          id
        ).catch(err => console.error('[taskService.updateTask] Completion notification error:', err))
      }

      return { data, error: null }
    } catch (error) {
      console.error('[taskService.updateTask] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 삭제
   */
  async deleteTask(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[taskService.deleteTask] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 상태 변경
   */
  async updateTaskStatus(id: string, status: TaskStatus): Promise<{ data: Task | null; error: string | null }> {
    return this.updateTask(id, { status })
  },

  /**
   * 업무 진행률 변경
   */
  async updateTaskProgress(id: string, progress: number): Promise<{ data: Task | null; error: string | null }> {
    return this.updateTask(id, { progress })
  },

  /**
   * 대시보드 홈 위젯용 업무 조회
   * - 일반 직원: 내가 담당자인 미완료 업무만
   * - 관리자(includeAssignedByMe=true): 내가 담당자인 업무 + 내가 지시했지만 담당자가 내가 아닌 미완료 업무
   */
  async getDashboardTasks(options?: {
    includeAssignedByMe?: boolean
  }): Promise<{
    data: { assignedToMe: Task[]; assignedByMe: Task[] } | null
    error: string | null
  }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      const activeStatuses = ['pending', 'in_progress', 'review', 'on_hold']

      // 내가 담당자인 미완료 업무
      const { data: toMeRaw, error: toMeError } = await (supabase as any)
        .from('tasks')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('assignee_id', userId)
        .in('status', activeStatuses)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (toMeError) throw toMeError

      let byMeRaw: any[] = []
      if (options?.includeAssignedByMe) {
        const { data, error: byMeError } = await (supabase as any)
          .from('tasks')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('assigner_id', userId)
          .neq('assignee_id', userId)
          .in('status', activeStatuses)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(50)

        if (byMeError) throw byMeError
        byMeRaw = data || []
      }

      // 사용자 이름 매핑
      const userIds = [
        ...(toMeRaw || []).flatMap((t: any) => [t.assignee_id, t.assigner_id]),
        ...byMeRaw.flatMap((t: any) => [t.assignee_id, t.assigner_id]),
      ]
      const nameMap = await getUserNames(supabase, userIds)

      const mapTask = (item: any): Task => ({
        ...item,
        assignee_name: nameMap[item.assignee_id] || '알 수 없음',
        assigner_name: nameMap[item.assigner_id] || '알 수 없음',
        comments_count: item.comments_count || 0,
      })

      return {
        data: {
          assignedToMe: (toMeRaw || []).map(mapTask),
          assignedByMe: byMeRaw.map(mapTask),
        },
        error: null,
      }
    } catch (error) {
      console.error('[taskService.getDashboardTasks] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 업무 통계 조회
   */
  async getTaskStats(): Promise<{
    data: {
      total: number
      pending: number
      in_progress: number
      review: number
      completed: number
      overdue: number
    } | null
    error: string | null
  }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const today = new Date().toISOString().split('T')[0]

      // 전체 업무 수
      const { count: total } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)

      // 대기 중
      const { count: pending } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'pending')

      // 진행 중
      const { count: in_progress } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'in_progress')

      // 검토 요청
      const { count: review } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'review')

      // 완료
      const { count: completed } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'completed')

      // 기한 초과
      const { count: overdue } = await (supabase as any)
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', ['pending', 'in_progress', 'review'])
        .lt('due_date', today)

      return {
        data: {
          total: total || 0,
          pending: pending || 0,
          in_progress: in_progress || 0,
          review: review || 0,
          completed: completed || 0,
          overdue: overdue || 0,
        },
        error: null,
      }
    } catch (error) {
      console.error('[taskService.getTaskStats] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 업무 댓글 서비스
// =====================================================
export const taskCommentService = {
  /**
   * 댓글 목록 조회
   */
  async getComments(taskId: string): Promise<{ data: TaskComment[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (error) throw error

      // author 이름 조회
      const authorIds = (data || []).map((item: any) => item.author_id)
      const nameMap = await getUserNames(supabase, authorIds)

      const comments = (data || []).map((item: any) => ({
        ...item,
        author_name: nameMap[item.author_id] || '알 수 없음',
      }))

      return { data: comments, error: null }
    } catch (error) {
      console.error('[taskCommentService.getComments] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 생성
   */
  async createComment(taskId: string, input: CreateTaskCommentDto): Promise<{ data: TaskComment | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('task_comments')
        .insert({
          task_id: taskId,
          author_id: userId,
          content: input.content,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[taskCommentService.createComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 수정
   */
  async updateComment(id: string, content: string): Promise<{ data: TaskComment | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('task_comments')
        .update({ content })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[taskCommentService.updateComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 삭제
   */
  async deleteComment(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('task_comments')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[taskCommentService.deleteComment] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 반복 업무 템플릿 서비스
// =====================================================
export const recurringTaskTemplateService = {
  /**
   * 반복 업무 템플릿 목록 조회
   */
  async listTemplates(options?: {
    active_only?: boolean
  }): Promise<{ data: RecurringTaskTemplate[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      let query = (supabase as any)
        .from('recurring_task_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })

      if (options?.active_only) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query
      if (error) throw error

      const userIds = (data || []).flatMap((item: any) => [item.assignee_id, item.assigner_id])
      const nameMap = await getUserNames(supabase, userIds)

      const templates = (data || []).map((item: any) => ({
        ...item,
        assignee_name: nameMap[item.assignee_id] || '알 수 없음',
        assigner_name: nameMap[item.assigner_id] || '알 수 없음',
      })) as RecurringTaskTemplate[]

      return { data: templates, error: null }
    } catch (error) {
      console.error('[recurringTaskTemplateService.listTemplates] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 반복 업무 템플릿 생성
   */
  async createTemplate(
    input: CreateRecurringTaskTemplateDto
  ): Promise<{ data: RecurringTaskTemplate | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      // 주기별 필수 필드 검증
      if (input.recurrence_type === 'weekly') {
        if (input.recurrence_weekday === undefined || input.recurrence_weekday === null) {
          throw new Error('주간 반복은 요일을 지정해야 합니다.')
        }
      } else if (input.recurrence_type === 'monthly') {
        if (!input.recurrence_day_of_month) {
          throw new Error('월간 반복은 일자를 지정해야 합니다.')
        }
      } else if (input.recurrence_type === 'yearly') {
        if (!input.recurrence_month || !input.recurrence_day_of_month) {
          throw new Error('연간 반복은 월과 일을 모두 지정해야 합니다.')
        }
      }

      const startDate = input.start_date || new Date().toISOString().split('T')[0]

      const { data, error } = await (supabase as any)
        .from('recurring_task_templates')
        .insert({
          clinic_id: clinicId,
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'medium',
          assignee_id: input.assignee_id,
          assigner_id: userId,
          recurrence_type: input.recurrence_type,
          recurrence_weekday: input.recurrence_weekday ?? null,
          recurrence_day_of_month: input.recurrence_day_of_month ?? null,
          recurrence_month: input.recurrence_month ?? null,
          start_date: startDate,
          end_date: input.end_date || null,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[recurringTaskTemplateService.createTemplate] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 반복 업무 템플릿 수정
   */
  async updateTemplate(
    id: string,
    input: UpdateRecurringTaskTemplateDto
  ): Promise<{ data: RecurringTaskTemplate | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const updateData: Record<string, any> = {}
      if (input.title !== undefined) updateData.title = input.title
      if (input.description !== undefined) updateData.description = input.description || null
      if (input.priority !== undefined) updateData.priority = input.priority
      if (input.assignee_id !== undefined) updateData.assignee_id = input.assignee_id
      if (input.recurrence_type !== undefined) updateData.recurrence_type = input.recurrence_type
      if (input.recurrence_weekday !== undefined) updateData.recurrence_weekday = input.recurrence_weekday
      if (input.recurrence_day_of_month !== undefined) updateData.recurrence_day_of_month = input.recurrence_day_of_month
      if (input.recurrence_month !== undefined) updateData.recurrence_month = input.recurrence_month
      if (input.start_date !== undefined) updateData.start_date = input.start_date
      if (input.end_date !== undefined) updateData.end_date = input.end_date || null
      if (input.is_active !== undefined) updateData.is_active = input.is_active

      const { data, error } = await (supabase as any)
        .from('recurring_task_templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('[recurringTaskTemplateService.updateTemplate] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 반복 업무 템플릿 삭제 (과거 인스턴스는 유지됨 — ON DELETE SET NULL)
   */
  async deleteTemplate(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('recurring_task_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { success: true, error: null }
    } catch (error) {
      console.error('[recurringTaskTemplateService.deleteTemplate] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 오늘(또는 지정한 날짜)이 매칭되는 모든 활성 템플릿을 순회해
   * tasks 테이블에 인스턴스를 upsert. 유니크 인덱스가 중복을 막으므로 멱등적.
   * 일반 직원도 호출 가능하도록 DB 측에서 SECURITY DEFINER RPC로 구현.
   */
  async materializeDueInstances(forDate?: Date): Promise<{ created: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const target = forDate || new Date()
      // YYYY-MM-DD (로컬 타임존 기준)
      const y = target.getFullYear()
      const m = String(target.getMonth() + 1).padStart(2, '0')
      const d = String(target.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`

      const { data, error } = await (supabase as any).rpc('materialize_recurring_tasks', {
        p_clinic_id: clinicId,
        p_date: dateStr,
      })

      if (error) throw error
      return { created: Number(data) || 0, error: null }
    } catch (error) {
      console.error('[recurringTaskTemplateService.materializeDueInstances] Error:', error)
      return { created: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 치과 기본 반복 업무 템플릿 일괄 등록
   * 이미 동일 제목의 템플릿이 존재하면 건너뛰고, 신규만 삽입한다.
   * @returns 신규 등록 건수
   */
  async seedDefaultTemplates(): Promise<{ created: number; skipped: number; error: string | null }> {
    try {
      const { DEFAULT_RECURRING_TEMPLATES } = await import('@/data/defaultRecurringTemplates')

      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')
      if (!userId) throw new Error('User not found')

      // 기존 템플릿 제목 목록 조회 (중복 방지)
      const { data: existing } = await (supabase as any)
        .from('recurring_task_templates')
        .select('title')
        .eq('clinic_id', clinicId)

      const existingTitles = new Set((existing || []).map((t: any) => t.title))

      const toInsert = DEFAULT_RECURRING_TEMPLATES.filter((t) => !existingTitles.has(t.title))

      if (toInsert.length === 0) {
        return { created: 0, skipped: DEFAULT_RECURRING_TEMPLATES.length, error: null }
      }

      const rows = toInsert.map((t) => ({
        clinic_id: clinicId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        assignee_id: userId,   // 기본 담당자 = 현재 사용자 (추후 편집)
        assigner_id: userId,
        recurrence_type: t.recurrence_type,
        recurrence_weekday: t.recurrence_weekday ?? null,
        recurrence_day_of_month: t.recurrence_day_of_month ?? null,
        recurrence_month: t.recurrence_month ?? null,
        start_date: new Date().toISOString().split('T')[0],
        is_active: true,
      }))

      const { error: insertError } = await (supabase as any)
        .from('recurring_task_templates')
        .insert(rows)

      if (insertError) throw insertError

      return {
        created: toInsert.length,
        skipped: DEFAULT_RECURRING_TEMPLATES.length - toInsert.length,
        error: null,
      }
    } catch (error) {
      console.error('[recurringTaskTemplateService.seedDefaultTemplates] Error:', error)
      return { created: 0, skipped: 0, error: extractErrorMessage(error) }
    }
  },
}

// 통합 export
export const bulletinService = {
  announcements: announcementService,
  documents: documentService,
  tasks: taskService,
  taskComments: taskCommentService,
  recurringTaskTemplates: recurringTaskTemplateService,
}

export default bulletinService
