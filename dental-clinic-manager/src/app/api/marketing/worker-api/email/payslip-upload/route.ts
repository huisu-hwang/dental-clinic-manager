import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import JSZip from 'jszip';

const STORAGE_BUCKET = 'payroll-documents';

/**
 * POST /api/marketing/worker-api/email/payslip-upload
 * 급여명세서 ZIP 업로드 - Worker API Key 인증
 * ZIP 파싱, PDF 추출, 직원 매칭, Storage 업로드
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, year, month, zipData } = body as {
      clinicId: string;
      year: number;
      month: number;
      zipData: string; // base64
    };

    if (!clinicId || !year || !month || !zipData) {
      return NextResponse.json(
        { error: 'clinicId, year, month, zipData가 필요합니다.' },
        { status: 400 }
      );
    }

    // base64 -> Buffer -> JSZip
    const zipBuffer = Buffer.from(zipData, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    // 클리닉 직원 목록 조회
    const { data: employees } = await admin
      .from('users')
      .select('id, name, display_name')
      .eq('clinic_id', clinicId)
      .eq('is_active', true);

    if (!employees || employees.length === 0) {
      return NextResponse.json({ error: '활성 직원이 없습니다.' }, { status: 400 });
    }

    let uploadedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    let totalSalary = 0;

    // ZIP 내 PDF 파일 처리
    const zipEntries = Object.entries(zip.files).filter(
      ([path, entry]) => !entry.dir && path.toLowerCase().endsWith('.pdf')
    );

    for (const [path, entry] of zipEntries) {
      const fileName = path.split('/').pop() || path;
      const fileNameWithoutExt = fileName.replace(/\.pdf$/i, '');

      // 직원 매칭 (파일명에 직원 이름이 포함된 경우)
      const matchedEmployee = employees.find(
        (emp) =>
          fileNameWithoutExt.includes(emp.name) ||
          (emp.display_name && fileNameWithoutExt.includes(emp.display_name))
      );

      if (!matchedEmployee) {
        skippedCount++;
        errors.push(`직원 매칭 실패: ${fileName}`);
        continue;
      }

      try {
        const pdfData = await entry.async('arraybuffer');
        const storagePath = `${clinicId}/${year}/${month}/${matchedEmployee.id}.pdf`;

        // 기존 파일 확인 및 삭제
        const { data: existingRecord } = await admin
          .from('payroll_tax_office_files')
          .select('id, storage_path')
          .eq('clinic_id', clinicId)
          .eq('employee_user_id', matchedEmployee.id)
          .eq('payment_year', year)
          .eq('payment_month', month)
          .maybeSingle();

        if (existingRecord?.storage_path) {
          await admin.storage
            .from(STORAGE_BUCKET)
            .remove([existingRecord.storage_path]);
        }

        // Storage 업로드
        const { error: uploadError } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, pdfData, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadError) {
          errors.push(`Storage 업로드 실패 (${fileName}): ${uploadError.message}`);
          skippedCount++;
          continue;
        }

        // DB 메타데이터 저장 (upsert)
        if (existingRecord?.id) {
          await admin
            .from('payroll_tax_office_files')
            .update({
              file_name: fileName,
              storage_path: storagePath,
              uploaded_by: 'email-worker',
              created_at: new Date().toISOString(),
            })
            .eq('id', existingRecord.id);
        } else {
          await admin
            .from('payroll_tax_office_files')
            .insert({
              clinic_id: clinicId,
              employee_user_id: matchedEmployee.id,
              payment_year: year,
              payment_month: month,
              file_name: fileName,
              storage_path: storagePath,
              uploaded_by: 'email-worker',
              created_at: new Date().toISOString(),
            });
        }

        uploadedCount++;
      } catch (fileError) {
        errors.push(
          `파일 처리 오류 (${fileName}): ${fileError instanceof Error ? fileError.message : String(fileError)}`
        );
        skippedCount++;
      }
    }

    // 총 급여가 있으면 expense_records에 인건비 추가
    if (totalSalary > 0) {
      // expense_categories에서 type='personnel' 카테고리 조회
      let { data: personnelCategory } = await admin
        .from('expense_categories')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('type', 'personnel')
        .maybeSingle();

      if (!personnelCategory) {
        const { data: newCat } = await admin
          .from('expense_categories')
          .insert({
            clinic_id: clinicId,
            name: '인건비',
            type: 'personnel',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        personnelCategory = newCat;
      }

      if (personnelCategory) {
        await admin
          .from('expense_records')
          .insert({
            clinic_id: clinicId,
            category_id: personnelCategory.id,
            description: `${year}년 ${month}월 급여`,
            amount: totalSalary,
            expense_date: `${year}-${String(month).padStart(2, '0')}-01`,
            year,
            month,
            notes: '이메일 자동 입력',
            created_at: new Date().toISOString(),
          });
      }
    }

    return NextResponse.json({
      success: uploadedCount > 0,
      uploadedCount,
      skippedCount,
      totalFiles: zipEntries.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[worker-api/email/payslip-upload]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
