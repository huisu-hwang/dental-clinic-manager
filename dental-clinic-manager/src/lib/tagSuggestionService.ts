import { createClient } from './supabase/client'
import type { ProtocolCategory, TagSuggestion } from '@/types'

/**
 * 의료 용어 사전 (키워드 추출용)
 */
const medicalTerms: Record<string, string[]> = {
  '임플란트': ['임플란트', '식립', '픽스처', 'fixture', 'implant'],
  '신경치료': ['신경치료', '근관', '엔도', 'endo', 'root canal'],
  '크라운': ['크라운', '보철', 'CAD/CAM', 'crown'],
  '발치': ['발치', '수술', '봉합', 'extraction'],
  '스케일링': ['스케일링', '치석제거', '잇몸치료', 'scaling'],
  '교정': ['교정', '브라켓', 'bracket', 'orthodontic'],
  '미백': ['미백', '화이트닝', 'whitening', 'bleaching'],
  '충치': ['충치', '우식', 'cavity', 'caries'],
  '잇몸': ['잇몸', '치주', '치은', 'periodontal', 'gum'],
  '골이식': ['골이식', 'GBR', 'bone graft'],
  '상악동': ['상악동', 'sinus', '사이너스'],
  '브릿지': ['브릿지', 'bridge', '가교'],
  '인레이': ['인레이', 'inlay', '충전'],
  '레진': ['레진', 'resin', '복합레진'],
  '라미네이트': ['라미네이트', 'veneer', '베니어'],
  '틀니': ['틀니', 'denture', '의치'],
  'CT': ['CT', '씨티', '전산화단층촬영'],
  '파노라마': ['파노라마', 'panorama', '파노라믹']
}

/**
 * 카테고리별 추천 태그
 */
const categoryTags: Record<string, string[]> = {
  '보존치료': ['충치', '신경치료', '크라운', '인레이', '레진', '충전'],
  '구강외과': ['발치', '임플란트', '골이식', '상악동', '수술', '봉합'],
  '치주치료': ['스케일링', '잇몸치료', '치주수술', '치태제거'],
  '보철치료': ['크라운', '브릿지', '틀니', '임플란트', '라미네이트'],
  '교정치료': ['교정', '브라켓', '투명교정', '유지장치'],
  '심미치료': ['미백', '라미네이트', '레진', '심미보철']
}

export const tagSuggestionService = {
  /**
   * 태그 추천 가져오기
   */
  async getTagSuggestions(
    title: string,
    categoryId: string | undefined,
    clinicId: string
  ): Promise<{
    keywords: string[]
    category: string[]
    frequent: TagSuggestion[]
  }> {
    try {
      const supabase = createClient()
      if (!supabase) throw new Error('Supabase client is not initialized')
      const suggestions = {
        keywords: [] as string[],
        category: [] as string[],
        frequent: [] as TagSuggestion[]
      }

      // 1. 제목에서 키워드 추출
      if (title) {
        suggestions.keywords = this.extractKeywords(title)
      }

      // 2. 카테고리 기반 추천
      if (categoryId) {
        // 카테고리 이름 가져오기
        const { data: categoryData } = await supabase
          .from('protocol_categories')
          .select('name')
          .eq('id', categoryId)
          .single()

        const categoryRecord = (categoryData ?? null) as Pick<ProtocolCategory, 'name'> | null

        if (categoryRecord?.name) {
          suggestions.category = categoryTags[categoryRecord.name] || []
        }

        // 같은 카테고리에서 자주 사용된 태그
        const { data: categoryFrequentTags } = await supabase
          .from('tag_suggestions')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('category_id', categoryId)
          .order('usage_count', { ascending: false })
          .limit(5)

        if (categoryFrequentTags) {
          const frequentByCategory = categoryFrequentTags as TagSuggestion[]
          suggestions.category = [
            ...suggestions.category,
            ...frequentByCategory.map(t => t.tag_name)
          ].filter((tag, index, self) => self.indexOf(tag) === index) // 중복 제거
        }
      }

      // 3. 전체적으로 자주 사용하는 태그
      const { data: frequentTags } = await supabase
        .from('tag_suggestions')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('usage_count', { ascending: false })
        .limit(10)

      if (frequentTags) {
        suggestions.frequent = frequentTags as TagSuggestion[]
      }

      console.log('[TagSuggestion] Generated suggestions:', suggestions)
      return suggestions
    } catch (error) {
      console.error('[TagSuggestion] Error getting suggestions:', error)
      return {
        keywords: [],
        category: [],
        frequent: []
      }
    }
  },

  /**
   * 제목에서 키워드 추출
   */
  extractKeywords(text: string): string[] {
    const keywords = new Set<string>()
    const lowerText = text.toLowerCase()

    // 의료 용어 사전에서 매칭
    for (const [key, terms] of Object.entries(medicalTerms)) {
      if (terms.some(term => lowerText.includes(term.toLowerCase()))) {
        keywords.add(key)
      }
    }

    // 추가 키워드 추출 로직
    // 1차, 2차 등의 단계 표시
    if (lowerText.includes('1차') || lowerText.includes('첫')) {
      keywords.add('1차')
    }
    if (lowerText.includes('2차') || lowerText.includes('두')) {
      keywords.add('2차')
    }

    // 응급, 긴급
    if (lowerText.includes('응급') || lowerText.includes('긴급')) {
      keywords.add('응급')
    }

    // 소아, 어린이
    if (lowerText.includes('소아') || lowerText.includes('어린이') || lowerText.includes('유아')) {
      keywords.add('소아')
    }

    // 노인, 고령
    if (lowerText.includes('노인') || lowerText.includes('고령')) {
      keywords.add('노인')
    }

    return Array.from(keywords)
  },

  /**
   * 태그 사용 통계 업데이트
   */
  async updateTagStatistics(
    clinicId: string,
    tags: string[],
    categoryId?: string
  ): Promise<void> {
    if (!tags || tags.length === 0) return

    try {
      const supabase = createClient()
      if (!supabase) throw new Error('Supabase client is not initialized')

      // 각 태그에 대해 통계 업데이트
      for (const tag of tags) {
        const { error } = await supabase
          .from('tag_suggestions')
          .upsert({
            clinic_id: clinicId,
            tag_name: tag,
            category_id: categoryId,
            usage_count: 1,
            last_used: new Date().toISOString()
          } as any, {
            onConflict: 'clinic_id,tag_name',
            ignoreDuplicates: false
          })

        if (error) {
          console.error('[TagSuggestion] Error updating tag statistics:', error)
        }
      }

      // 사용 횟수 증가 (upsert가 update인 경우)
      await supabase.rpc('increment_tag_usage', {
        p_clinic_id: clinicId,
        p_tags: tags
      })

      console.log('[TagSuggestion] Tag statistics updated for:', tags)
    } catch (error) {
      console.error('[TagSuggestion] Error updating statistics:', error)
    }
  },

  /**
   * 자동완성을 위한 태그 검색
   */
  async searchTags(
    clinicId: string,
    query: string
  ): Promise<string[]> {
    if (!query || query.length < 1) return []

    try {
      const supabase = createClient()
      if (!supabase) throw new Error('Supabase client is not initialized')

      const { data } = await supabase
        .from('tag_suggestions')
        .select('tag_name')
        .eq('clinic_id', clinicId)
        .ilike('tag_name', `${query}%`)
        .order('usage_count', { ascending: false })
        .limit(5)

      return data?.map((t: any) => t.tag_name) || []
    } catch (error) {
      console.error('[TagSuggestion] Error searching tags:', error)
      return []
    }
  }
}