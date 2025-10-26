import type { ProtocolStep } from '@/types'

const STEP_HTML_WRAPPER_CLASS = 'protocol-step-section'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const serializeStepsToHtml = (steps: ProtocolStep[]): string => {
  if (!steps || steps.length === 0) {
    return ''
  }

  return steps
    .map((step, index) => {
      const title = escapeHtml(step.title.trim() || `단계 ${index + 1}`)
      const referenceMarkup = (step.reference_materials ?? [])
        .map((ref) => `<li>${escapeHtml(String(ref))}</li>`)
        .join('')

      const referenceSection = referenceMarkup
        ? `<div class="protocol-step-references"><strong>참고 자료</strong><ul>${referenceMarkup}</ul></div>`
        : ''

      return `
        <section class="${STEP_HTML_WRAPPER_CLASS}" data-step-order="${index}">
          <header class="protocol-step-header">
            <span class="protocol-step-index">Step ${index + 1}</span>
            <h3 class="protocol-step-title">${title}</h3>
            ${step.is_optional ? '<span class="protocol-step-optional">선택사항</span>' : ''}
          </header>
          <div class="protocol-step-content">${step.content || '<p></p>'}</div>
          ${referenceSection}
        </section>
      `
    })
    .join('\n')
}

export const mapStepsForInsert = (
  protocolId: string,
  versionId: string,
  steps: ProtocolStep[]
) => {
  if (!steps || steps.length === 0) {
    return []
  }

  return steps.map((step, index) => ({
    protocol_id: protocolId,
    version_id: versionId,
    step_order: index,
    title: step.title.trim(),
    content: { html: step.content || '<p></p>' },
    reference_materials: step.reference_materials ?? [],
    is_optional: step.is_optional ?? false
  }))
}

export const normalizeStepsFromDb = (records: any[] | null | undefined): ProtocolStep[] => {
  if (!records || records.length === 0) {
    return []
  }

  return records
    .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
    .map((record) => ({
      id: record.id ?? undefined,
      step_order: record.step_order ?? 0,
      title: record.title ?? '',
      content: record.content?.html ?? record.content ?? '',
      reference_materials: Array.isArray(record.reference_materials)
        ? record.reference_materials
        : [],
      is_optional: Boolean(record.is_optional)
    }))
}

export const buildDefaultStep = (index = 0): ProtocolStep => ({
  id: `new-${Date.now()}-${index}`,
  step_order: index,
  title: '',
  content: '<p></p>',
  reference_materials: [],
  is_optional: false
})

export const hasValidSteps = (steps: ProtocolStep[] | undefined): steps is ProtocolStep[] =>
  Boolean(steps && steps.length > 0 && steps.every((step) => step.title.trim() && step.content.trim()))
