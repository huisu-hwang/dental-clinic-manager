/**
 * Parse ZIP File API Route
 * ZIP 파일에서 PDF 파일명 + PDF 내용에서 직원 이름까지 추출하여 반환.
 * 파일명에 한글 직원명이 없는 경우(예: payslip_2026.pdf)에도 자동 매칭 가능.
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { extractPayslipEmployeeName } from '@/utils/payslipPdfParser'

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10MB per PDF

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const zipFile = formData.get('zipFile') as File | null
    const pdfFilesRaw = formData.getAll('pdfFiles')
    const pdfFiles = pdfFilesRaw.filter((v): v is File => v instanceof File)

    if (!zipFile && pdfFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'zipFile 또는 pdfFiles가 필요합니다.' },
        { status: 400 }
      )
    }

    const result: { name: string; path: string; extractedName: string | null }[] = []

    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer())
      const entries: { name: string; path: string; entry: JSZip.JSZipObject }[] = []
      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.pdf')) {
          const fileName = relativePath.split('/').pop() || relativePath
          entries.push({ name: fileName, path: relativePath, entry: zipEntry })
        }
      })

      for (const { name, path, entry } of entries) {
        let extractedName: string | null = null
        try {
          const buf = Buffer.from(await entry.async('arraybuffer'))
          if (buf.byteLength <= MAX_PDF_BYTES) {
            extractedName = await extractPayslipEmployeeName(buf)
          }
        } catch (err) {
          console.error(`[parse-zip] PDF 이름 추출 실패 (${name}):`, err)
        }
        result.push({ name, path, extractedName })
      }
    } else {
      for (const pdf of pdfFiles) {
        let extractedName: string | null = null
        try {
          if (pdf.size <= MAX_PDF_BYTES) {
            const buf = Buffer.from(await pdf.arrayBuffer())
            extractedName = await extractPayslipEmployeeName(buf)
          }
        } catch (err) {
          console.error(`[parse-zip] PDF 이름 추출 실패 (${pdf.name}):`, err)
        }
        result.push({ name: pdf.name, path: pdf.name, extractedName })
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
    })
  } catch (error) {
    console.error('[API] parse-zip POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'ZIP 파일 파싱 중 오류가 발생했습니다.',
      },
      { status: 500 }
    )
  }
}
