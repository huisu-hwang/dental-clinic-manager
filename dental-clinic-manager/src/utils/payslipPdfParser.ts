// ============================================
// 세무사무실 급여명세서 PDF 파싱 유틸
// "지 급 액 계" 라벨 다음의 총 지급액(=총급여) 추출
// ============================================
import path from 'path'

let cachedPdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null

async function getPdfjs() {
  if (!cachedPdfjs) {
    cachedPdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  return cachedPdfjs
}

function nodeModulesPath(sub: string): string {
  // process.cwd()는 Next.js 실행 시 프로젝트 루트
  return path.join(process.cwd(), 'node_modules', 'pdfjs-dist', sub)
}

/**
 * PDF 버퍼에서 텍스트 전체를 추출.
 * 한국어 폰트(cMap) 지원 포함.
 */
async function extractPdfText(buffer: Buffer | Uint8Array): Promise<string> {
  const pdfjs = await getPdfjs()
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: nodeModulesPath('cmaps') + '/',
    cMapPacked: true,
    disableFontFace: true,
    standardFontDataUrl: nodeModulesPath('standard_fonts') + '/',
  }).promise

  let text = ''
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      text += content.items
        .map(item => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ') + '\n'
    }
  } finally {
    await doc.destroy()
  }
  return text
}

/**
 * 정규화된 텍스트에서 "지 급 액 계" 다음 첫 숫자 시퀀스를 추출하여 정수로 변환.
 * 한국 세무사무실 급여명세서 표준 양식 기준.
 */
function parseTotalPaymentFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ')

  // 1순위: "지 급 액 계" 라벨
  const labels = ['지 급 액 계', '지급액계', '지급 총액', '총 지급액', '총지급액']
  for (const label of labels) {
    const idx = normalized.indexOf(label)
    if (idx < 0) continue
    const after = normalized.slice(idx + label.length)
    // 라벨 직후의 첫 숫자/콤마/공백 시퀀스 (한글이 나오면 종료)
    const m = after.match(/^\s*([\d][\d,\s]*\d|\d)/)
    if (!m) continue
    const num = parseInt(m[1].replace(/[,\s]/g, ''), 10)
    if (!isNaN(num) && num > 0) return num
  }
  return null
}

/**
 * PDF 버퍼에서 총 지급액(=총급여) 추출.
 * @returns 인식된 금액(원). 인식 실패 시 null.
 */
export async function extractPayslipTotalPayment(buffer: Buffer | Uint8Array): Promise<number | null> {
  try {
    const text = await extractPdfText(buffer)
    return parseTotalPaymentFromText(text)
  } catch (err) {
    console.error('[payslipPdfParser] 추출 실패:', err)
    return null
  }
}
