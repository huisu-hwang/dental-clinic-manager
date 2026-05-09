import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../lib/logger.js'

const DIR = process.env.PDF_STORAGE_DIR ?? './pdf-cache'
mkdirSync(DIR, { recursive: true })

export async function downloadPdf(url: string, key: string): Promise<string | null> {
  const localPath = join(DIR, `${key}.pdf`)
  if (existsSync(localPath)) return localPath
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuctionAggregator/1.0)' },
    })
    if (!res.ok) {
      log.warn('pdf_download_failed', { url, status: res.status })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(localPath, buf)
    return localPath
  } catch (e) {
    log.warn('pdf_download_error', { url, error: String(e) })
    return null
  }
}
