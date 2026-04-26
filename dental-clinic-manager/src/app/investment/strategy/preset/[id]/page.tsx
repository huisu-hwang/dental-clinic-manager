'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PresetDetailView from '@/components/Investment/PresetDetailView'

export default function PresetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-at-text-secondary hover:text-at-text"
      >
        <ArrowLeft className="w-4 h-4" /> 뒤로
      </button>
      <PresetDetailView presetId={id} variant="page" />
    </div>
  )
}
