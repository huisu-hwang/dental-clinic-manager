/**
 * 파일 파싱 유틸리티 - AI 데이터 분석용 파일 첨부 기능
 */

import * as XLSX from 'xlsx';
import type { FileAttachment, ParsedFileData } from '@/types/aiAnalysis';

// 제약사항
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TABLE_ROWS = 500;
const MAX_TEXT_LENGTH = 50000;
const MAX_PDF_PAGES = 50;
const MAX_PREVIEW_ROWS = 10;
const MAX_TEXT_PREVIEW = 5000;

// 지원 파일 형식
const SUPPORTED_EXTENSIONS = {
  excel: ['.xlsx', '.xls'],
  csv: ['.csv'],
  pdf: ['.pdf'],
  text: ['.txt', '.md'],
};

export type FileType = 'excel' | 'csv' | 'pdf' | 'text' | 'unsupported';

/**
 * 파일 유효성 검사
 */
export function validateFile(file: File): { valid: boolean; error?: string; type: FileType } {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();

  // 파일 크기 검사
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `파일 크기가 10MB를 초과합니다. (현재: ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
      type: 'unsupported'
    };
  }

  // 파일 형식 검사
  if (SUPPORTED_EXTENSIONS.excel.includes(extension)) {
    return { valid: true, type: 'excel' };
  }
  if (SUPPORTED_EXTENSIONS.csv.includes(extension)) {
    return { valid: true, type: 'csv' };
  }
  if (SUPPORTED_EXTENSIONS.pdf.includes(extension)) {
    return { valid: true, type: 'pdf' };
  }
  if (SUPPORTED_EXTENSIONS.text.includes(extension)) {
    return { valid: true, type: 'text' };
  }

  return {
    valid: false,
    error: `지원하지 않는 파일 형식입니다. (지원: xlsx, xls, csv, pdf, txt, md)`,
    type: 'unsupported'
  };
}

/**
 * 스프레드시트 파싱 (Excel, CSV)
 */
export async function parseSpreadsheet(file: File, fileType: 'excel' | 'csv'): Promise<ParsedFileData> {
  const buffer = await file.arrayBuffer();

  let rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  if (fileType === 'csv') {
    // CSV 파싱
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 1) {
      throw new Error('데이터가 없습니다.');
    }

    // 헤더 추출
    headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // 데이터 행 파싱
    for (let i = 1; i < lines.length && rows.length < MAX_TABLE_ROWS; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
  } else {
    // Excel 파싱
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (jsonData.length < 1) {
      throw new Error('데이터가 없습니다.');
    }

    // 헤더 추출
    headers = (jsonData[0] as unknown[]).map(h => String(h || '').trim());

    // 데이터 행 파싱
    for (let i = 1; i < jsonData.length && rows.length < MAX_TABLE_ROWS; i++) {
      const rowData = jsonData[i] as unknown[];
      if (!rowData || rowData.every(cell => cell == null || cell === '')) continue;

      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = rowData[idx] ?? '';
      });
      rows.push(row);
    }
  }

  const totalRows = rows.length;
  const sampleRows = rows.slice(0, MAX_PREVIEW_ROWS);

  // 요약 생성
  const columnSummary = headers.slice(0, 5).join(', ');
  const summary = `테이블 데이터: ${headers.length}개 컬럼, ${totalRows}행. 주요 컬럼: ${columnSummary}${headers.length > 5 ? ' 외 ' + (headers.length - 5) + '개' : ''}`;

  return {
    tableData: {
      headers,
      rows,
      totalRows,
      sampleRows,
    },
    summary,
  };
}

/**
 * 텍스트 파일 파싱 (TXT, MD)
 */
export async function parseTextFile(file: File): Promise<ParsedFileData> {
  const text = await file.text();

  // 길이 제한
  const content = text.slice(0, MAX_TEXT_LENGTH);
  const preview = text.slice(0, MAX_TEXT_PREVIEW);
  const totalLength = text.length;

  // 요약 생성
  const lines = text.split('\n').length;
  const words = text.split(/\s+/).filter(w => w).length;
  const truncated = totalLength > MAX_TEXT_LENGTH ? ` (${MAX_TEXT_LENGTH}자로 제한됨)` : '';
  const summary = `텍스트 파일: ${lines}줄, 약 ${words}단어, ${totalLength}자${truncated}`;

  return {
    textData: {
      content,
      preview,
      totalLength,
    },
    summary,
  };
}

/**
 * PDF 파일 파싱
 */
export async function parsePdfFile(file: File): Promise<ParsedFileData> {
  // pdfjs-dist를 동적 import (클라이언트에서만 실행)
  const pdfjsLib = await import('pdfjs-dist');

  // Worker 설정 (브라우저 환경)
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  let fullText = '';

  // 각 페이지에서 텍스트 추출
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += pageText + '\n\n';
  }

  // 길이 제한
  const content = fullText.slice(0, MAX_TEXT_LENGTH);
  const preview = fullText.slice(0, MAX_TEXT_PREVIEW);
  const totalLength = fullText.length;

  // 요약 생성
  const truncated = pdf.numPages > MAX_PDF_PAGES ? ` (최대 ${MAX_PDF_PAGES}페이지까지 처리)` : '';
  const textTruncated = totalLength > MAX_TEXT_LENGTH ? `, 텍스트는 ${MAX_TEXT_LENGTH}자로 제한됨` : '';
  const summary = `PDF 문서: ${pdf.numPages}페이지${truncated}, 약 ${totalLength}자 추출${textTruncated}`;

  return {
    textData: {
      content,
      preview,
      totalLength,
      pageCount: pdf.numPages,
    },
    summary,
  };
}

/**
 * 파일 파싱 메인 함수
 */
export async function parseFile(file: File): Promise<FileAttachment> {
  const validation = validateFile(file);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  let parsedData: ParsedFileData;

  switch (validation.type) {
    case 'excel':
    case 'csv':
      parsedData = await parseSpreadsheet(file, validation.type);
      break;
    case 'pdf':
      parsedData = await parsePdfFile(file);
      break;
    case 'text':
      parsedData = await parseTextFile(file);
      break;
    default:
      throw new Error('지원하지 않는 파일 형식입니다.');
  }

  return {
    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: file.name,
    type: validation.type,
    size: file.size,
    parsedData,
  };
}

/**
 * 파일 데이터를 AI 컨텍스트 문자열로 변환
 */
export function buildFileContext(attachments: FileAttachment[]): string {
  if (!attachments || attachments.length === 0) return '';

  const contextParts: string[] = [];

  for (const attachment of attachments) {
    const { name, type, parsedData } = attachment;

    contextParts.push(`\n[ATTACHED_FILE: ${name}]`);
    contextParts.push(`파일 유형: ${type.toUpperCase()}`);
    contextParts.push(`요약: ${parsedData.summary}`);

    if (parsedData.tableData) {
      const { headers, sampleRows, totalRows } = parsedData.tableData;
      contextParts.push(`\n컬럼: ${headers.join(', ')}`);
      contextParts.push(`전체 데이터: ${totalRows}행`);
      contextParts.push(`\n샘플 데이터 (처음 ${sampleRows.length}행):`);
      contextParts.push(JSON.stringify(sampleRows, null, 2));
    }

    if (parsedData.textData) {
      const { preview, totalLength, pageCount } = parsedData.textData;
      if (pageCount) {
        contextParts.push(`페이지 수: ${pageCount}`);
      }
      contextParts.push(`전체 길이: ${totalLength}자`);
      contextParts.push(`\n내용 미리보기 (처음 ${MAX_TEXT_PREVIEW}자):\n${preview}`);
    }

    contextParts.push(`[/ATTACHED_FILE: ${name}]\n`);
  }

  return contextParts.join('\n');
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
