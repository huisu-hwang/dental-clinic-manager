'use client'

import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// pdfjs worker (jsDelivr CDN — react-pdf 내장 pdfjs-dist 버전과 일치)
const PDFJS_VERSION = pdfjs.version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

const PDF_OPTIONS = {
  cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
}

interface Props {
  fileUrl: string
  fileName?: string | null
}

export default function PayslipMobileViewer({ fileUrl, fileName }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [width, setWidth] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 컨테이너 폭에 맞춰 PDF 자동 스케일
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        if (w > 0) setWidth(w)
      }
    }
    updateWidth()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateWidth) : null
    if (ro && containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', updateWidth)
    return () => {
      window.removeEventListener('resize', updateWidth)
      ro?.disconnect()
    }
  }, [])

  return (
    <div className="border border-at-border rounded-xl overflow-hidden bg-white">
      <div ref={containerRef} className="overflow-x-auto">
        {error ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-10 h-10 mx-auto text-at-error" />
            <p className="text-sm font-medium text-at-text">PDF를 표시할 수 없습니다</p>
            <p className="text-xs text-at-text-weak">{error}</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-at-accent underline"
            >
              새 탭에서 열기
            </a>
          </div>
        ) : (
          <Document
            file={fileUrl}
            options={PDF_OPTIONS}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n)
              setPageNumber(1)
              setError(null)
            }}
            onLoadError={(e) => {
              console.error('[PayslipMobileViewer] PDF 로드 실패:', e)
              setError(e.message || 'PDF 로드 중 오류가 발생했습니다.')
            }}
            loading={
              <div className="p-8 flex flex-col items-center gap-2 text-at-text-weak">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">PDF 불러오는 중...</span>
              </div>
            }
          >
            {width && (
              <Page
                pageNumber={pageNumber}
                width={width}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            )}
          </Document>
        )}
      </div>

      {numPages && numPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-at-border bg-at-surface-alt/40">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-white border border-at-border disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> 이전
          </button>
          <span className="text-xs text-at-text-secondary">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-white border border-at-border disabled:opacity-40"
          >
            다음 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-3 border-t border-at-border bg-white flex flex-col sm:flex-row gap-2">
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-at-accent text-white text-sm font-medium rounded-lg"
        >
          새 탭에서 열기
        </a>
        <a
          href={fileUrl}
          download={fileName || 'payslip.pdf'}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-at-border text-at-text text-sm font-medium rounded-lg"
        >
          PDF 다운로드
        </a>
      </div>
    </div>
  )
}
