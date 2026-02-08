'use client'

import { useState, useEffect, useCallback } from 'react'
import { communityCategoryService } from '@/lib/communityService'
import type { CommunityCategoryItem } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'

interface UseCommunityCategories {
  categories: CommunityCategoryItem[]
  loading: boolean
  error: string | null
  labelMap: Record<string, string>
  colorMap: Record<string, string>
  refresh: () => Promise<void>
}

export function useCommunityCategories(includeInactive: boolean = false): UseCommunityCategories {
  const [categories, setCategories] = useState<CommunityCategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labelMap, setLabelMap] = useState<Record<string, string>>(COMMUNITY_CATEGORY_LABELS)
  const [colorMap, setColorMap] = useState<Record<string, string>>(COMMUNITY_CATEGORY_COLORS)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await communityCategoryService.getCategories(includeInactive)

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return
    }

    if (data && data.length > 0) {
      setCategories(data)

      const labels: Record<string, string> = {}
      const colors: Record<string, string> = {}
      data.forEach((cat) => {
        labels[cat.slug] = cat.label
        colors[cat.slug] = `${cat.color_bg} ${cat.color_text}`
      })
      setLabelMap(labels)
      setColorMap(colors)
    }

    setLoading(false)
  }, [includeInactive])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  return { categories, loading, error, labelMap, colorMap, refresh: fetchCategories }
}
