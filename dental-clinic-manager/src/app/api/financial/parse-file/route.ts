// ============================================
// 수입 데이터 파일 파싱 API
// POST: 엑셀/이미지 파일 파싱
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// 엑셀 파일 파싱
async function parseExcelFile(buffer: ArrayBuffer): Promise<{
  insurance_revenue?: number;
  non_insurance_revenue?: number;
  insurance_patient_count?: number;
  non_insurance_patient_count?: number;
  items?: Array<{ description: string; amount: number; date?: string }>;
}> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // 데이터 추출 로직
  let insuranceRevenue = 0;
  let nonInsuranceRevenue = 0;
  let insurancePatientCount = 0;
  let nonInsurancePatientCount = 0;
  const items: Array<{ description: string; amount: number; date?: string }> = [];

  // 키워드 기반 데이터 추출
  const insuranceKeywords = ['보험', '건강보험', '요양급여', '공단', 'insurance'];
  const nonInsuranceKeywords = ['비보험', '비급여', '자비', '현금', 'non-insurance', '카드'];
  const patientKeywords = ['환자수', '환자 수', '인원', 'patient', '명'];
  const amountKeywords = ['금액', '수입', '매출', 'amount', 'revenue', '원'];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    const rowText = row.map(cell => String(cell || '').toLowerCase()).join(' ');

    // 보험 수입 찾기
    if (insuranceKeywords.some(k => rowText.includes(k.toLowerCase()))) {
      for (const cell of row) {
        const num = parseNumber(cell);
        if (num > 0) {
          if (patientKeywords.some(k => rowText.includes(k.toLowerCase()))) {
            if (num < 10000) insurancePatientCount = num; // 환자 수는 보통 작은 숫자
            else insuranceRevenue = num;
          } else {
            insuranceRevenue = num;
          }
        }
      }
    }

    // 비보험 수입 찾기
    if (nonInsuranceKeywords.some(k => rowText.includes(k.toLowerCase()))) {
      for (const cell of row) {
        const num = parseNumber(cell);
        if (num > 0) {
          if (patientKeywords.some(k => rowText.includes(k.toLowerCase()))) {
            if (num < 10000) nonInsurancePatientCount = num;
            else nonInsuranceRevenue = num;
          } else {
            nonInsuranceRevenue = num;
          }
        }
      }
    }

    // 일반 항목으로 추출 (설명과 금액이 있는 행)
    if (row.length >= 2) {
      const description = String(row[0] || '');
      const amount = parseNumber(row[1]) || parseNumber(row[row.length - 1]);
      if (description && amount > 0 && !description.match(/^[0-9]+$/)) {
        items.push({
          description,
          amount,
          date: row.length > 2 ? String(row[2] || '') : undefined,
        });
      }
    }
  }

  return {
    insurance_revenue: insuranceRevenue,
    non_insurance_revenue: nonInsuranceRevenue,
    insurance_patient_count: insurancePatientCount,
    non_insurance_patient_count: nonInsurancePatientCount,
    items: items.slice(0, 50), // 최대 50개 항목
  };
}

// 숫자 파싱 유틸리티
function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // 콤마, 원 등 제거
    const cleaned = value.replace(/[,원₩\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// 이미지 OCR 처리 (AI 분석 활용)
async function parseImageFile(
  base64Data: string,
  mimeType: string
): Promise<{
  extracted_text: string;
  detected_amounts: Array<{ value: number; context: string; confidence: number }>;
  insurance_revenue?: number;
  non_insurance_revenue?: number;
}> {
  // Google Gemini API를 활용한 OCR
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('이미지 분석을 위한 API 키가 설정되지 않았습니다.');
  }

  const prompt = `이 이미지는 치과병원의 수입/매출 관련 문서입니다.
이미지에서 다음 정보를 추출해주세요:

1. 보험 진료 수입 (건강보험공단 청구 금액)
2. 비보험 진료 수입 (비급여, 자비 진료 금액)
3. 총 수입 금액
4. 환자 수 (보험/비보험 별도)
5. 기타 금액 정보

JSON 형식으로 응답해주세요:
{
  "insurance_revenue": 숫자 또는 null,
  "non_insurance_revenue": 숫자 또는 null,
  "insurance_patient_count": 숫자 또는 null,
  "non_insurance_patient_count": 숫자 또는 null,
  "total_revenue": 숫자 또는 null,
  "detected_amounts": [{"value": 금액, "context": "설명", "confidence": 0.0-1.0}],
  "extracted_text": "추출된 주요 텍스트"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error('이미지 분석 API 호출에 실패했습니다.');
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSON 파싱 시도
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          extracted_text: parsed.extracted_text || '',
          detected_amounts: parsed.detected_amounts || [],
          insurance_revenue: parsed.insurance_revenue,
          non_insurance_revenue: parsed.non_insurance_revenue,
        };
      } catch {
        // JSON 파싱 실패 시 텍스트 반환
      }
    }

    return {
      extracted_text: text,
      detected_amounts: [],
    };
  } catch (error) {
    console.error('Image OCR error:', error);
    throw new Error('이미지 분석 중 오류가 발생했습니다.');
  }
}

// POST: 파일 파싱
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    // 엑셀 파일 처리
    if (
      fileType === 'application/vnd.ms-excel' ||
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      const buffer = await file.arrayBuffer();
      const data = await parseExcelFile(buffer);

      return NextResponse.json({
        success: true,
        type: 'excel',
        data,
      });
    }

    // 이미지 파일 처리
    if (fileType.startsWith('image/')) {
      const buffer = await file.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');
      const data = await parseImageFile(base64Data, fileType);

      return NextResponse.json({
        success: true,
        type: 'image',
        data,
      });
    }

    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. (엑셀 또는 이미지 파일만 가능)' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/financial/parse-file:', error);
    const message = error instanceof Error ? error.message : '파일 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
