export interface RLInferenceConfig {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export interface PredictRequestBody {
  model_id: string
  checkpoint_path: string
  algorithm: string
  kind: 'portfolio' | 'single_asset'
  state_window: number
  input_features: string[]
  ohlcv: Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>
  indicators?: Record<string, Record<string, number[]>>
  current_positions?: Record<string, { qty: number; avg_price: number }>
}

export interface PortfolioPredictResponse {
  kind: 'portfolio'
  weights: Record<string, number>
  confidence: number
  raw_action: number[]
  metadata: Record<string, unknown>
}

export interface SinglePredictResponse {
  kind: 'single_asset'
  action: 'buy' | 'sell' | 'hold'
  size_hint?: number
  confidence: number
  metadata: Record<string, unknown>
}

export type PredictResponse = PortfolioPredictResponse | SinglePredictResponse

export class RLInferenceClient {
  constructor(private cfg: RLInferenceConfig) {}

  async predict(body: PredictRequestBody): Promise<PredictResponse> {
    return this._post('/predict', body)
  }

  async health(): Promise<{ status: string; loaded_models: string[]; uptime_seconds: number }> {
    return this._get('/health')
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        ctrl.abort()
        reject(new Error(`rl-inference-server ${path} timeout after ${this.cfg.timeoutMs}ms`))
      }, this.cfg.timeoutMs)
    })
    const fetchPromise = fetch(`${this.cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-RL-API-KEY': this.cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).then(async (resp) => {
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`rl-inference-server ${path} returned ${resp.status}: ${text}`)
      }
      return resp.json() as Promise<T>
    })
    return Promise.race([fetchPromise, timeoutPromise])
  }

  private async _get<T>(path: string): Promise<T> {
    const ctrl = new AbortController()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        ctrl.abort()
        reject(new Error(`rl-inference-server /health timeout after ${this.cfg.timeoutMs}ms`))
      }, this.cfg.timeoutMs)
    })
    const fetchPromise = fetch(`${this.cfg.baseUrl}${path}`, {
      headers: { 'X-RL-API-KEY': this.cfg.apiKey },
      signal: ctrl.signal,
    }).then(async (resp) => {
      if (!resp.ok) {
        throw new Error(`rl-inference-server ${path} returned ${resp.status}`)
      }
      return resp.json() as Promise<T>
    })
    return Promise.race([fetchPromise, timeoutPromise])
  }
}
