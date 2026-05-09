import pdfParse from 'pdf-parse'
import { readFileSync } from 'node:fs'
import { parseNoticeText, type ParsedNotice } from './noticeParser.js'
import { log } from '../lib/logger.js'

export const PARSER_VERSION = 'v1'

export interface ExtractResult extends ParsedNotice {
  rawText: string | null
  parserVersion: string
}

export async function extractRightsFromPdf(pdfPath: string): Promise<ExtractResult> {
  try {
    const buf = readFileSync(pdfPath)
    const parsed = await pdfParse(buf)
    const text = parsed.text ?? ''
    const rights = parseNoticeText(text)
    return { ...rights, rawText: text, parserVersion: PARSER_VERSION }
  } catch (e) {
    log.warn('pdf_parse_failed', { pdfPath, error: String(e) })
    return {
      ...failResult(),
      rawText: null,
      parserVersion: PARSER_VERSION,
    }
  }
}

function failResult(): ParsedNotice {
  return {
    baseRightType: null,
    baseRightDate: null,
    hasSeniorTenant: false,
    tenantCount: 0,
    totalDeposit: 0,
    unsettledTaxes: 0,
    riskFlags: {},
    parseStatus: 'failed',
  }
}
