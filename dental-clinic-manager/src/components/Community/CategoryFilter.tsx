'use client'

import type { CommunityCategory } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'

interface CategoryFilterProps {
  selected: CommunityCategory | ''
  onChange: (category: CommunityCategory | '') => void
}

const categories: (CommunityCategory | '')[] = ['', 'free', 'advice', 'info', 'humor', 'daily', 'career']

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
      {categories.map((cat) => (
        <button
          key={cat || 'all'}
          onClick={() => onChange(cat)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            selected === cat
              ? cat === '' ? 'bg-gray-900 text-white' : COMMUNITY_CATEGORY_COLORS[cat].replace('100', '600').replace(/text-\w+-700/, 'text-white')
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {cat === '' ? '전체' : COMMUNITY_CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  )
}
