/**
 * Tax Office Payslip PDF Files API Route
 * 세무사무실 급여명세서 PDF 파일 업로드/조회/삭제 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import type { TaxOfficeFileMatch, TaxOfficeUploadResult } from '@/types/payroll'
import { extractPayslipTotalPayment } from '@/utils/payslipPdfParser'

const STORAGE_BUCKET = 'payroll-documents'

// Create Supabase client with service role key (server-side only)
const getServiceRoleClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * POST /api/payroll/tax-office-files
 * ZIP 파일에서 PDF를 추출하여 Supabase Storage에 업로드하고 메타데이터를 DB에 저장
 */
export async function POST(request: NextRequest) {
  const result: TaxOfficeUploadResult = {
    success: false,
    uploadedCount: 0,
    skippedCount: 0,
    errors: []
  }

  try {
    const formData = await request.formData()
    const zipFile = formData.get('zipFile') as File | null
    const pdfFilesRaw = formData.getAll('pdfFiles')
    const pdfFiles = pdfFilesRaw.filter((v): v is File => v instanceof File)
    const year = formData.get('year') as string | null
    const month = formData.get('month') as string | null
    const clinicId = formData.get('clinicId') as string | null
    const uploadedBy = formData.get('uploadedBy') as string | null
    const matchesJson = formData.get('matches') as string | null

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (zipFile && zipFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: '파일 크기는 10MB 이하여야 합니다.' },
        { status: 413 }
      )
    }
    for (const pdf of pdfFiles) {
      if (pdf.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `PDF 파일 크기는 10MB 이하여야 합니다. (${pdf.name})` },
          { status: 413 }
        )
      }
    }

    if ((!zipFile && pdfFiles.length === 0) || !year || !month || !clinicId || !uploadedBy || !matchesJson) {
      return NextResponse.json(
        { ...result, errors: ['필수 정보가 누락되었습니다. (zipFile 또는 pdfFiles, year, month, clinicId, uploadedBy, matches)'] },
        { status: 400 }
      )
    }

    let matches: TaxOfficeFileMatch[]
    try {
      matches = JSON.parse(matchesJson)
    } catch {
      return NextResponse.json(
        { ...result, errors: ['matches JSON 파싱 오류'] },
        { status: 400 }
      )
    }

    const paymentYear = parseInt(year)
    const paymentMonth = parseInt(month)

    if (isNaN(paymentYear) || isNaN(paymentMonth)) {
      return NextResponse.json(
        { ...result, errors: ['year, month는 숫자여야 합니다.'] },
        { status: 400 }
      )
    }

    // ZIP 또는 PDF에서 PDF 바이트를 가져오는 통합 헬퍼
    const zip = zipFile ? await JSZip.loadAsync(await zipFile.arrayBuffer()) : null
    const pdfByName = new Map<string, File>()
    for (const pdf of pdfFiles) {
      pdfByName.set(pdf.name, pdf)
    }

    const getPdfArrayBuffer = async (fileName: string): Promise<ArrayBuffer | null> => {
      if (zip) {
        let zipEntry = zip.file(fileName)
        if (!zipEntry) {
          const baseName = fileName.split('/').pop() || fileName
          zip.forEach((path, entry) => {
            if (!entry.dir && (path === fileName || path.endsWith('/' + baseName) || path === baseName)) {
              zipEntry = entry
            }
          })
        }
        if (!zipEntry) return null
        return await zipEntry.async('arraybuffer')
      }
      const pdf = pdfByName.get(fileName)
      if (!pdf) return null
      return await pdf.arrayBuffer()
    }

    const supabase = getServiceRoleClient()

    for (const match of matches) {
      // 매칭되지 않은 파일은 건너뜀
      if (!match.matchedEmployeeId) {
        result.skippedCount++
        continue
      }

      const pdfArrayBuffer = await getPdfArrayBuffer(match.fileName)
      if (!pdfArrayBuffer) {
        result.errors.push(`파일을 찾을 수 없음: ${match.fileName}`)
        result.skippedCount++
        continue
      }

      // 표시용 원본 파일명 (경로에서 파일명만 추출)
      const displayFileName = match.fileName.split('/').pop() || match.fileName

      try {
        const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })

        const storagePath = `${clinicId}/${paymentYear}/${paymentMonth}/${match.matchedEmployeeId}.pdf`

        // 기존 파일 확인 (upsert: 기존 파일 삭제 후 재업로드)
        const { data: existingRecord } = await supabase
          .from('payroll_tax_office_files')
          .select('id, storage_path')
          .eq('clinic_id', clinicId)
          .eq('employee_user_id', match.matchedEmployeeId)
          .eq('payment_year', paymentYear)
          .eq('payment_month', paymentMonth)
          .maybeSingle()

        if (existingRecord?.storage_path) {
          // 기존 Storage 파일 삭제
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([existingRecord.storage_path])
        }

        // Storage에 업로드
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true
          })

        if (uploadError) {
          result.errors.push(`Storage 업로드 실패 (${match.fileName}): ${uploadError.message}`)
          result.skippedCount++
          continue
        }

        // PDF에서 총 지급액 자동 추출 (실패 시 null — 후속 동기화 스킵)
        let totalPayment: number | null = null
        try {
          totalPayment = await extractPayslipTotalPayment(Buffer.from(pdfArrayBuffer))
        } catch (parseErr) {
          console.error(`[tax-office-files] PDF 파싱 오류 (${match.fileName}):`, parseErr)
        }
        if (totalPayment == null) {
          result.errors.push(`총 지급액 인식 실패: ${match.fileName} (수동 입력이 필요할 수 있습니다)`)
        }

        // DB에 메타데이터 저장 (upsert)
        const dbRecord = {
          clinic_id: clinicId,
          employee_user_id: match.matchedEmployeeId,
          payment_year: paymentYear,
          payment_month: paymentMonth,
          file_name: displayFileName,
          storage_path: storagePath,
          uploaded_by: uploadedBy,
          total_payment: totalPayment,
          created_at: new Date().toISOString()
        }

        if (existingRecord?.id) {
          const { error: updateError } = await supabase
            .from('payroll_tax_office_files')
            .update({
              file_name: displayFileName,
              storage_path: storagePath,
              uploaded_by: uploadedBy,
              total_payment: totalPayment,
              created_at: new Date().toISOString()
            })
            .eq('id', existingRecord.id)

          if (updateError) {
            result.errors.push(`DB 업데이트 실패 (${match.fileName}): ${updateError.message}`)
            result.skippedCount++
            continue
          }
        } else {
          const { error: insertError } = await supabase
            .from('payroll_tax_office_files')
            .insert(dbRecord)

          if (insertError) {
            result.errors.push(`DB 저장 실패 (${match.fileName}): ${insertError.message}`)
            result.skippedCount++
            continue
          }
        }

        result.uploadedCount++
      } catch (fileError) {
        result.errors.push(
          `파일 처리 오류 (${match.fileName}): ${fileError instanceof Error ? fileError.message : String(fileError)}`
        )
        result.skippedCount++
      }
    }

    result.success = result.uploadedCount > 0 || (matches.length === 0)
    return NextResponse.json(result)

  } catch (error) {
    console.error('[API] tax-office-files POST error:', error)
    return NextResponse.json(
      {
        ...result,
        errors: [error instanceof Error ? error.message : '파일 업로드 중 오류가 발생했습니다.']
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/payroll/tax-office-files
 * 세무사무실 급여명세서 파일 목록 조회
 * Query params: clinicId, year, month, employeeId (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const employeeId = searchParams.get('employeeId')

    if (!clinicId || !year || !month) {
      return NextResponse.json(
        { success: false, error: 'clinicId, year, month가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('payroll_tax_office_files')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('payment_year', parseInt(year))
      .eq('payment_month', parseInt(month))

    if (employeeId) {
      query = query.eq('employee_user_id', employeeId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API] tax-office-files GET error:', error)
      return NextResponse.json(
        { success: false, error: `파일 목록 조회 실패: ${error.message}` },
        { status: 500 }
      )
    }

    // snake_case -> camelCase 변환
    const files = (data || []).map((row) => ({
      id: row.id,
      clinicId: row.clinic_id,
      employeeUserId: row.employee_user_id,
      paymentYear: row.payment_year,
      paymentMonth: row.payment_month,
      fileName: row.file_name,
      storagePath: row.storage_path,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at
    }))

    return NextResponse.json({ success: true, data: files })

  } catch (error) {
    console.error('[API] tax-office-files GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '파일 목록 조회 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/payroll/tax-office-files
 * 세무사무실 급여명세서 파일 삭제
 * Query params: id, clinicId
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const clinicId = searchParams.get('clinicId')

    if (!id || !clinicId) {
      return NextResponse.json(
        { success: false, error: 'id, clinicId가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    // 파일 메타데이터 조회 (storage_path 확인용)
    const { data: record, error: fetchError } = await supabase
      .from('payroll_tax_office_files')
      .select('id, storage_path, clinic_id')
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .maybeSingle()

    if (fetchError) {
      console.error('[API] tax-office-files DELETE fetch error:', fetchError)
      return NextResponse.json(
        { success: false, error: `파일 조회 실패: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!record) {
      return NextResponse.json(
        { success: false, error: '파일을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // Storage에서 파일 삭제
    if (record.storage_path) {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([record.storage_path])

      if (storageError) {
        console.error('[API] tax-office-files DELETE storage error:', storageError)
        // Storage 삭제 실패해도 DB는 삭제 진행 (고아 레코드 방지)
      }
    }

    // DB에서 레코드 삭제
    const { error: deleteError } = await supabase
      .from('payroll_tax_office_files')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[API] tax-office-files DELETE db error:', deleteError)
      return NextResponse.json(
        { success: false, error: `파일 삭제 실패: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: '파일이 삭제되었습니다.' })

  } catch (error) {
    console.error('[API] tax-office-files DELETE error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '파일 삭제 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}
