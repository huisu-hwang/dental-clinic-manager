'use client'

import type { CommunityCategory, CommunityCategoryItem } from '@/types/community'

interface CategoryFilterProps {
  selected: CommunityCategory | ''
  onChange: (category: CommunityCategory | '') => void
  categories: CommunityCategoryItem[]
  colorMap: Record<string, string>
  labelMap: Record<string, string>
}

export default function CategoryFilter({ selected, onChange, categories, colorMap, labelMap }: CategoryFilterProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
      {/* 전체 버튼 */}
      <button
        onClick={() => onChange('')}
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          selected === ''
            ? 'bg-gray-900 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        전체
      </button>
      {/* 동적 카테고리 버튼 */}
      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => onChange(cat.slug)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            selected === cat.slug
              ? (colorMap[cat.slug] || 'bg-gray-100 text-gray-700').replace('100', '600').replace(/text-\w+-700/, 'text-white')
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {labelMap[cat.slug] || cat.label}
        </button>
      ))}
    </div>
  )
}
