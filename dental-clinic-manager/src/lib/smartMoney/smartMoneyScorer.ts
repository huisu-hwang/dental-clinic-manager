/**
 * 스마트머니 종합 점수 / 시그널 추출
 *
 * - 가중치: investorFlow 40 / wyckoff 30 / algoFootprint 20 / vwap 10
 * - 점수 부호: 양수 = 매집(accumulation), 음수 = 분배(distribution)
 * - interpretation:
 *     ≥+60  strong-accumulation
 *     ≥+30  mild-accumulation
 *     |x|<30 neutral
 *     ≤-30  mild-distribution
 *     ≤-60  strong-distribution
 */

import type {
  AlgoFootprintResult,
  Interpretation,
  InvestorFlowResult,
  SignalDetail,
  SignalType,
  VWAPResult,
  WyckoffResult,
} from '@/types/smartMoney'

export interface ScorerInput {
  vwap: VWAPResult
  investorFlow: InvestorFlowResult | null
  wyckoff: WyckoffResult
  algoFootprint: AlgoFootprintResult
}

export interface ScorerOutput {
  /** -100 ~ +100 */
  overallScore: number
  interpretation: Interpretation
  signalDetails: SignalDetail[]
}

const WEIGHTS = {
  investorFlow: 40,
  wyckoff: 30,
  algoFootprint: 20,
  vwap: 10,
} as const

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function computeSmartMoneyScore(input: ScorerInput): ScorerOutput {
  const { vwap, investorFlow, wyckoff, algoFootprint } = input
  const signalDetails: SignalDetail[] = []
  const triggeredAt = new Date().toISOString()

  // ============================================
  // 1) Investor Flow (40)
  // ============================================
  let flowComponent = 0
  if (investorFlow) {
    const sign =
      investorFlow.signal === 'accumulation' ? 1
        : investorFlow.signal === 'distribution' ? -1
          : 0
    flowComponent = sign * (investorFlow.confidence / 100) * WEIGHTS.investorFlow

    // 외국인/기관 개별 시그널 추출
    if (investorFlow.foreigner_net_5d > 0 && investorFlow.signal === 'accumulation') {
      signalDetails.push({
        type: 'foreigner-accumulation',
        confidence: clamp(investorFlow.confidence, 0, 100),
        description: `외국인 5일 누적 순매수 ${investorFlow.foreigner_net_5d.toLocaleString()}`,
        triggeredAt,
      })
    } else if (investorFlow.foreigner_net_5d < 0 && investorFlow.signal === 'distribution') {
      signalDetails.push({
        type: 'foreigner-distribution',
        confidence: clamp(investorFlow.confidence, 0, 100),
        description: `외국인 5일 누적 순매도 ${Math.abs(investorFlow.foreigner_net_5d).toLocaleString()}`,
        triggeredAt,
      })
    }
    if (investorFlow.institution_net_5d > 0 && investorFlow.signal === 'accumulation') {
      signalDetails.push({
        type: 'institution-accumulation',
        confidence: clamp(investorFlow.confidence, 0, 100),
        description: `기관 5일 누적 순매수 ${investorFlow.institution_net_5d.toLocaleString()}`,
        triggeredAt,
      })
    } else if (investorFlow.institution_net_5d < 0 && investorFlow.signal === 'distribution') {
      signalDetails.push({
        type: 'institution-distribution',
        confidence: clamp(investorFlow.confidence, 0, 100),
        description: `기관 5일 누적 순매도 ${Math.abs(investorFlow.institution_net_5d).toLocaleString()}`,
        triggeredAt,
      })
    }
  }

  // ============================================
  // 2) Wyckoff (30)
  // ============================================
  let wyckoffComponent = 0
  if (wyckoff.springDetected) {
    wyckoffComponent += WEIGHTS.wyckoff * 0.6
    signalDetails.push({
      type: 'spring',
      confidence: 75,
      description: 'Wyckoff Spring 패턴 — 매집 신호 가능성',
      triggeredAt,
    })
  }
  if (wyckoff.upthrustDetected) {
    wyckoffComponent -= WEIGHTS.wyckoff * 0.6
    signalDetails.push({
      type: 'upthrust',
      confidence: 75,
      description: 'Wyckoff Upthrust 패턴 — 분배 신호 가능성',
      triggeredAt,
    })
  }
  if (wyckoff.absorptionScore > 50) {
    // Absorption은 방향이 모호 → algoFootprint.direction 으로 가중
    const dirSign =
      algoFootprint.direction === 'accumulation' ? 1
        : algoFootprint.direction === 'distribution' ? -1
          : 0
    wyckoffComponent += dirSign * (wyckoff.absorptionScore / 100) * WEIGHTS.wyckoff * 0.4
    signalDetails.push({
      type: 'absorption',
      confidence: clamp(wyckoff.absorptionScore, 0, 100),
      description: `흐름 흡수(Absorption) — 거래량 폭증 대비 가격 정체 (방향 ${algoFootprint.direction})`,
      triggeredAt,
    })
  }

  // ============================================
  // 3) Algo Footprint (20)
  // ============================================
  let algoComponent = 0
  if (algoFootprint.dominantAlgo) {
    const dirSign =
      algoFootprint.direction === 'accumulation' ? 1
        : algoFootprint.direction === 'distribution' ? -1
          : 0
    const dominantScore = (() => {
      switch (algoFootprint.dominantAlgo) {
        case 'TWAP': return algoFootprint.twapScore
        case 'VWAP': return algoFootprint.vwapScore
        case 'Iceberg': return algoFootprint.icebergScore
        case 'Sniper': return algoFootprint.sniperScore
        case 'MOO': return algoFootprint.mooScore
        case 'MOC': return algoFootprint.mocScore
      }
    })()
    algoComponent = dirSign * (dominantScore / 100) * WEIGHTS.algoFootprint

    // 개별 알고리즘 시그널
    const algoSignal: SignalType | null = (() => {
      const isAccum = algoFootprint.direction === 'accumulation'
      const isDist = algoFootprint.direction === 'distribution'
      switch (algoFootprint.dominantAlgo) {
        case 'TWAP': return isAccum ? 'twap-accumulation' : isDist ? 'twap-distribution' : null
        case 'VWAP': return isAccum ? 'vwap-accumulation' : isDist ? 'vwap-distribution' : null
        case 'Iceberg': return isAccum ? 'iceberg-buy' : isDist ? 'iceberg-sell' : null
        case 'Sniper': return isAccum ? 'sniper-buy' : isDist ? 'sniper-sell' : null
        // MOO/MOC는 detectAuctionFootprint가 직접 산출한 auctionDirection을 우선 사용
        case 'MOO': {
          if (algoFootprint.auctionDirection === 'moo-buy') return 'moo-accumulation'
          if (algoFootprint.auctionDirection === 'moo-sell') return 'moo-distribution'
          return isAccum ? 'moo-accumulation' : isDist ? 'moo-distribution' : null
        }
        case 'MOC': {
          if (algoFootprint.auctionDirection === 'moc-buy') return 'moc-accumulation'
          if (algoFootprint.auctionDirection === 'moc-sell') return 'moc-distribution'
          return isAccum ? 'moc-accumulation' : isDist ? 'moc-distribution' : null
        }
      }
    })()
    if (algoSignal) {
      const isAuction = algoFootprint.dominantAlgo === 'MOO' || algoFootprint.dominantAlgo === 'MOC'
      const desc = isAuction
        ? `${algoFootprint.dominantAlgo} 동시호가 거래량 집중 (${algoFootprint.auctionDirection ?? algoFootprint.direction})`
        : `${algoFootprint.dominantAlgo} 풋프린트 감지 (${algoFootprint.direction})`
      signalDetails.push({
        type: algoSignal,
        confidence: clamp(dominantScore, 0, 100),
        description: desc,
        triggeredAt,
      })
    }
  }

  // ============================================
  // 4) VWAP (10)
  // ============================================
  let vwapComponent = 0
  // VWAP 위에서 거래되면 매집 우호, 아래면 분배 우호 (단순 가중)
  if (vwap.zone === 'above') {
    vwapComponent = WEIGHTS.vwap * Math.min(1, Math.abs(vwap.distance) / 2)
  } else if (vwap.zone === 'below') {
    vwapComponent = -WEIGHTS.vwap * Math.min(1, Math.abs(vwap.distance) / 2)
  }

  // ============================================
  // 종합
  // ============================================
  const rawScore = flowComponent + wyckoffComponent + algoComponent + vwapComponent
  const overallScore = Math.round(clamp(rawScore, -100, 100))

  let interpretation: Interpretation
  if (overallScore >= 60) interpretation = 'strong-accumulation'
  else if (overallScore >= 30) interpretation = 'mild-accumulation'
  else if (overallScore <= -60) interpretation = 'strong-distribution'
  else if (overallScore <= -30) interpretation = 'mild-distribution'
  else interpretation = 'neutral'

  return {
    overallScore,
    interpretation,
    signalDetails,
  }
}
