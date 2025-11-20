import { createClient } from './supabase/client'
interface UploadResult {
  url?: string
  error?: string
}

export const mediaService = {
  /**
   * 프로토콜 미디어 파일 업로드
   */
  async uploadProtocolImage(file: File): Promise<UploadResult> {
    try {
      const supabase = createClient()
      // 파일 검증
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        return { error: '파일 크기는 10MB를 초과할 수 없습니다.' }
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        return { error: '지원하지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP만 가능)' }
      }

      // 파일명 생성 (타임스탬프 + 랜덤 문자열)
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(2, 15)
      const fileExt = file.name.split('.').pop()
      const fileName = `protocol-images/${timestamp}_${randomString}.${fileExt}`

      console.log('[MediaService] Uploading image:', fileName, 'Size:', file.size)

      // Supabase Storage에 업로드
      const { data, error } = await supabase.storage
        .from('protocol-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('[MediaService] Upload error:', error)
        return { error: '파일 업로드에 실패했습니다.' }
      }

      if (!data) {
        return { error: '업로드 결과를 가져오지 못했습니다.' }
      }

      // Public URL 생성
      const { data: publicUrlData } = supabase.storage
        .from('protocol-media')
        .getPublicUrl(data.path)

      if (!publicUrlData) {
        return { error: '파일 URL을 생성하지 못했습니다.' }
      }

      const publicUrl = publicUrlData.publicUrl
      console.log('[MediaService] Upload success:', publicUrl)

      return { url: publicUrl }
    } catch (error) {
      console.error('[MediaService] Upload error:', error)
      return { error: '파일 업로드 중 오류가 발생했습니다.' }
    }
  },

  /**
   * 프로토콜 미디어 파일 삭제
   */
  async deleteProtocolMedia(filePath: string): Promise<{ error?: string }> {
    try {
      const supabase = createClient()
      // Storage URL에서 파일 경로 추출
      const matches = filePath.match(/protocol-media\/(.+)/)
      if (!matches) {
        return { error: '유효하지 않은 파일 경로입니다.' }
      }

      const path = matches[0]
      console.log('[MediaService] Deleting file:', path)

      const { error } = await supabase.storage
        .from('protocol-media')
        .remove([path])

      if (error) {
        console.error('[MediaService] Delete error:', error)
        return { error: '파일 삭제에 실패했습니다.' }
      }

      return {}
    } catch (error) {
      console.error('[MediaService] Delete error:', error)
      return { error: '파일 삭제 중 오류가 발생했습니다.' }
    }
  },

  /**
   * 여러 이미지 URL 추출 (콘텐츠에서)
   */
  extractImageUrls(content: string): string[] {
    const urls: string[] = []
    const regex = /<img[^>]+src="([^">]+)"/g
    let match

    while ((match = regex.exec(content)) !== null) {
      if (match[1].includes('protocol-media')) {
        urls.push(match[1])
      }
    }

    return urls
  },

  /**
   * 사용하지 않는 이미지 정리
   */
  async cleanupUnusedImages(oldContent: string, newContent: string): Promise<void> {
    const oldImages = this.extractImageUrls(oldContent)
    const newImages = this.extractImageUrls(newContent)

    // 삭제된 이미지 찾기
    const deletedImages = oldImages.filter(url => !newImages.includes(url))

    // 삭제 처리
    for (const url of deletedImages) {
      await this.deleteProtocolMedia(url)
    }
  }
}