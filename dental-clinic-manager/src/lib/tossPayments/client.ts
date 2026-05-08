const TOSS_API_BASE = 'https://api.tosspayments.com'

export class TossPaymentsError extends Error {
  name = 'TossPaymentsError'
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public raw?: unknown
  ) {
    super(message)
  }
}

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY
  if (!key) throw new Error('TOSS_SECRET_KEY 환경 변수가 설정되지 않았습니다')
  return key
}

export interface TossFetchInit extends RequestInit {
  idempotencyKey?: string
}

export async function tossFetch<T>(path: string, init: TossFetchInit = {}): Promise<T> {
  const { idempotencyKey, headers: extraHeaders, ...rest } = init
  const auth = 'Basic ' + Buffer.from(`${getSecretKey()}:`).toString('base64')

  const headers: Record<string, string> = {
    Authorization: auth,
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string> | undefined),
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${TOSS_API_BASE}${path}`, { ...rest, headers })

  if (!res.ok) {
    const text = await res.text()
    let parsed: { code?: string; message?: string } = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      /* not json */
    }
    throw new TossPaymentsError(
      parsed.code ?? 'UNKNOWN',
      parsed.message ?? (text || `HTTP ${res.status}`),
      res.status,
      text
    )
  }

  return res.json() as Promise<T>
}
