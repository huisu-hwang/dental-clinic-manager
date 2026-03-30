/**
 * Parse ZIP File API Route
 * ZIP 파일에서 PDF 파일명 목록 추출 (업로드 없이 파일명만 반환)
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

/**
 * POST /api/payroll/tax-office-files/parse-zip
 * ZIP 파일에서 PDF 파일명 목록 추출
 * Body: FormData with zipFile (File)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const zipFile = formData.get('zipFile') as File | null

    if (!zipFile) {
      return NextResponse.json(
        { success: false, error: 'zipFile이 필요합니다.' },
        { status: 400 }
      )
    }

    const zipArrayBuffer = await zipFile.arrayBuffer()
    const zip = await JSZip.loadAsync(zipArrayBuffer)

    const pdfFileNames: string[] = []

    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.pdf')) {
        // 경로에서 파일명만 추출 (디렉토리 구조 제거)
        const fileName = relativePath.split('/').pop() || relativePath
        pdfFileNames.push(fileName)
      }
    })

    return NextResponse.json({
      success: true,
      data: pdfFileNames,
      total: pdfFileNames.length
    })

  } catch (error) {
    console.error('[API] parse-zip POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'ZIP 파일 파싱 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}
