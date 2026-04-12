'use client'

import type { ProtocolStep } from '@/types'
import { sanitizeHtml } from '@/utils/sanitize'

interface ProtocolStepViewerProps {
  steps: ProtocolStep[]
}

export default function ProtocolStepViewer({ steps }: ProtocolStepViewerProps) {
  if (!steps || steps.length === 0) {
    return null
  }

  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li
          key={step.id ?? `preview-step-${index}`}
          className="border border-at-border rounded-lg bg-white shadow-sm"
        >
          <div className="flex items-start justify-between border-b border-at-border px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-at-accent">Step {index + 1}</p>
              <h4 className="text-base font-semibold text-at-text">{step.title || `단계 ${index + 1}`}</h4>
            </div>
            {step.is_optional && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                선택사항
              </span>
            )}
          </div>
          <div className="prose prose-sm max-w-none px-4 py-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.content || '<p></p>') }} />
          {step.reference_materials && step.reference_materials.length > 0 && (
            <div className="border-t border-at-border bg-at-surface-alt px-4 py-3">
              <p className="text-xs font-medium text-at-text-secondary">참고 자료</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-at-text-secondary">
                {step.reference_materials.map((item, refIndex) => (
                  <li key={refIndex}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
