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

    const pdfFiles: { name: string; path: string }[] = []

    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.pdf')) {
        // 파일명 (표시용)과 전체 경로 (ZIP 내부 조회용) 모두 반환
        const fileName = relativePath.split('/').pop() || relativePath
        pdfFiles.push({ name: fileName, path: relativePath })
      }
    })

    return NextResponse.json({
      success: true,
      data: pdfFiles,
      total: pdfFiles.length
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
