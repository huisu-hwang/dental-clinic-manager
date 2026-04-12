'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

interface LinkPreviewData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

interface LinkPreviewCardProps {
  url: string
}

export default function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        if (!res.ok) {
          setError(true)
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setPreview(data)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPreview()

    return () => { cancelled = true }
  }, [url])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-at-surface-alt rounded-xl text-xs text-at-text-weak">
        <Loader2 className="w-3 h-3 animate-spin" />
        링크 미리보기 로딩 중...
      </div>
    )
  }

  if (error || !preview || (!preview.title && !preview.description)) {
    return null
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-at-border rounded-xl overflow-hidden hover:border-at-border transition-colors group"
    >
      <div className="flex">
        {preview.image && (
          <div className="w-32 h-24 flex-shrink-0 bg-at-surface-alt">
            <img
              src={preview.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}

        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-at-text-weak truncate">{preview.siteName || new URL(url).hostname}</span>
            <ExternalLink className="w-3 h-3 text-at-text-weak flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {preview.title && (
            <p className="text-sm font-medium text-at-text line-clamp-1 mb-0.5">
              {preview.title}
            </p>
          )}
          {preview.description && (
            <p className="text-xs text-at-text-secondary line-clamp-2">
              {preview.description}
            </p>
          )}
        </div>
      </div>
    </a>
  )
}
