/**
 * 스마트머니 종합 점수 / 시그널 추출 (2026-04 정교화 버전)
 *
 * 가중치 (총합 100):
 *   investorFlow 25 / wyckoffPhase 20 / marketStructure 15 / liquidity 10
 *   VSA 10 / algoFootprint 10 / 단일봉 Wyckoff 5 / VWAP 5
 *
 * 트랩 모디파이어:
 *   bull-trap + score>0 → score *= 0.7
 *   bear-trap + score<0 → score *= 0.7
 *
 * manipulationRiskScore (0~100):
 *   trap 감지 +40, news pattern +30, climax 신호 +20, no-demand/supply +10 (clamp)
 */

import type {
  AlgoFootprintResult,
  Interpretation,
  InvestorFlowResult,
  LiquidityResult,
  MarketStructureResult,
  NewsContextResult,
  OrderBlockFvgResult,
  SessionResult,
  SignalDetail,
  SignalType,
  TrapResult,
  VSAResult,
  VWAPResult,
  WyckoffPhaseResult,
  WyckoffResult,
} from '@/types/smartMoney'

export interface ScorerInput {
  vwap: VWAPResult
  investorFlow: InvestorFlowResult | null
  wyckoff: WyckoffResult
  algoFootprint: AlgoFootprintResult
  // ===== 정교화 엔진 (옵션) =====
  wyckoffPhase?: WyckoffPhaseResult | null
  liquidity?: LiquidityResult | null
  marketStructure?: MarketStructureResult | null
  orderBlocksFvg?: OrderBlockFvgResult | null
  traps?: TrapResult | null
  vsa?: VSAResult | null
  session?: SessionResult | null
  newsContext?: NewsContextResult | null
}

export interface ScorerOutput {
  /** -100 ~ +100 */
  overallScore: number
  interpretation: Interpretation
  signalDetails: SignalDetail[]
  /** 0~100 — 시장 조작 위험도 (UI 노출용) */
  manipulationRiskScore: number
}

const WEIGHTS = {
  investorFlow: 25,
  wyckoffPhase: 20,
  marketStructure: 15,
  liquidity: 10,
  vsa: 10,
  algoFootprint: 10,
  wyckoff: 5,
  vwap: 5,
} as const

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function computeSmartMoneyScore(input: ScorerInput): ScorerOutput {
  const {
    vwap,
    investorFlow,
    wyckoff,
    algoFootprint,
    wyckoffPhase,
    liquidity,
    marketStructure,
    orderBlocksFvg,
    traps,
    vsa,
    session,
    newsContext,
  } = input
  const signalDetails: SignalDetail[] = []
  const triggeredAt = new Date().toISOString()

  // ============================================
  // 1) Investor Flow (25)
  // ============================================
  let flowComponent = 0
  if (investorFlow) {
    const sign =
      investorFlow.signal === 'accumulation' ? 1
        : investorFlow.signal === 'distribution' ? -1
          : 0
    flowComponent = sign * (investorFlow.confidence / 100) * WEIGHTS.investorFlow

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
  // 2) Wyckoff Phase (20) — 다단계
  // ============================================
  let wyckoffPhaseComponent = 0
  if (wyckoffPhase && wyckoffPhase.cycle && wyckoffPhase.phase) {
    const cycleSign = wyckoffPhase.cycle === 'accumulation' ? 1 : -1
    // Phase C/D/E일수록 강하게 가중 (E=1.0, D=0.85, C=0.7, B=0.5, A=0.35)
    const phaseWeight =
      wyckoffPhase.phase === 'E' ? 1.0
        : wyckoffPhase.phase === 'D' ? 0.85
          : wyckoffPhase.phase === 'C' ? 0.7
            : wyckoffPhase.phase === 'B' ? 0.5
              : 0.35
    wyckoffPhaseComponent = cycleSign * phaseWeight * (wyckoffPhase.confidence / 100) * WEIGHTS.wyckoffPhase

    // Phase C/D/E 핵심 이벤트는 별도 SignalDetail
    const eventTypes = wyckoffPhase.events.map((e) => e.type)
    if (wyckoffPhase.cycle === 'accumulation') {
      if (wyckoffPhase.phase === 'C') {
        signalDetails.push({
          type: 'wyckoff-phase-c',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: `와이코프 매집 Phase C (Spring 확인)`,
          triggeredAt,
        })
      }
      if (eventTypes.includes('SOS')) {
        signalDetails.push({
          type: 'wyckoff-sos',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: '강세 신호(SOS) — 박스권 상향 이탈',
          triggeredAt,
        })
      }
      if (eventTypes.includes('LPS')) {
        signalDetails.push({
          type: 'wyckoff-lps',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: '마지막 지지점(LPS) — 매집 완료 가능성',
          triggeredAt,
        })
      }
    } else {
      if (eventTypes.includes('UTAD')) {
        signalDetails.push({
          type: 'wyckoff-utad',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: 'UTAD — 상향 돌파 후 실패 (분배 가능성)',
          triggeredAt,
        })
      }
      if (eventTypes.includes('SOW')) {
        signalDetails.push({
          type: 'wyckoff-sow',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: '약세 신호(SOW) — 박스권 하향 이탈',
          triggeredAt,
        })
      }
      if (eventTypes.includes('LPSY')) {
        signalDetails.push({
          type: 'wyckoff-lpsy',
          confidence: clamp(wyckoffPhase.confidence, 0, 100),
          description: '마지막 공급점(LPSY) — 분배 완료 가능성',
          triggeredAt,
        })
      }
    }
  }

  // ============================================
  // 3) Market Structure (15) — BOS / CHoCH
  // ============================================
  let structureComponent = 0
  if (marketStructure && marketStructure.lastEvent && marketStructure.lastEventDirection) {
    const dirSign = marketStructure.lastEventDirection === 'bullish' ? 1 : -1
    // CHoCH(추세반전)은 BOS(추세지속)보다 강하게 가중
    const eventStrength = marketStructure.lastEvent === 'CHoCH' ? 1.0 : 0.7
    structureComponent = dirSign * eventStrength * WEIGHTS.marketStructure

    if (marketStructure.lastEvent === 'CHoCH') {
      signalDetails.push({
        type: marketStructure.lastEventDirection === 'bullish' ? 'choch-bullish' : 'choch-bearish',
        confidence: 75,
        description: `시장구조 변화(CHoCH) — ${marketStructure.lastEventDirection === 'bullish' ? '강세 전환' : '약세 전환'}`,
        triggeredAt,
      })
    } else if (marketStructure.lastEvent === 'BOS') {
      signalDetails.push({
        type: marketStructure.lastEventDirection === 'bullish' ? 'bos-bullish' : 'bos-bearish',
        confidence: 65,
        description: `구조 돌파(BOS) — ${marketStructure.lastEventDirection === 'bullish' ? '상승 추세 지속' : '하락 추세 지속'}`,
        triggeredAt,
      })
    }
  }

  // ============================================
  // 4) Liquidity Sweep (10)
  // ============================================
  let liquidityComponent = 0
  if (liquidity && liquidity.recentSweeps.length > 0) {
    const latest = liquidity.recentSweeps[0]
    const dirSign = latest.direction === 'bullish-sweep' ? 1 : -1
    // recoveredInside일 때 가중 강화
    const strength = latest.recoveredInside ? 1.0 : 0.6
    liquidityComponent = dirSign * strength * WEIGHTS.liquidity

    signalDetails.push({
      type: latest.direction === 'bullish-sweep' ? 'liquidity-sweep-bullish' : 'liquidity-sweep-bearish',
      confidence: clamp(60 + latest.volumeSpike * 10, 0, 100),
      description: latest.description,
      triggeredAt,
    })
  }

  // ============================================
  // 5) VSA (10)
  // ============================================
  let vsaComponent = 0
  if (vsa && vsa.signals.length > 0) {
    const dirSign = vsa.effortVsResult === 'bullish' ? 1 : vsa.effortVsResult === 'bearish' ? -1 : 0
    // 가장 confident한 시그널의 평균 가중
    const avgConfidence = vsa.signals.reduce((s, sig) => s + sig.confidence, 0) / vsa.signals.length
    vsaComponent = dirSign * (avgConfidence / 100) * WEIGHTS.vsa

    // 최신 시그널 1-2개를 signalDetails로 노출
    for (const sig of vsa.signals.slice(0, 2)) {
      const sigType: SignalType =
        sig.type === 'no-demand' ? 'no-demand'
          : sig.type === 'no-supply' ? 'no-supply'
            : sig.type === 'buying-climax' ? 'buying-climax'
              : sig.type === 'selling-climax' ? 'selling-climax'
                : 'stopping-volume'
      signalDetails.push({
        type: sigType,
        confidence: clamp(sig.confidence, 0, 100),
        description: sig.description,
        triggeredAt,
      })
    }
  }

  // ============================================
  // 6) Algo Footprint (10)
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

    const algoSignal: SignalType | null = (() => {
      const isAccum = algoFootprint.direction === 'accumulation'
      const isDist = algoFootprint.direction === 'distribution'
      switch (algoFootprint.dominantAlgo) {
        case 'TWAP': return isAccum ? 'twap-accumulation' : isDist ? 'twap-distribution' : null
        case 'VWAP': return isAccum ? 'vwap-accumulation' : isDist ? 'vwap-distribution' : null
        case 'Iceberg': return isAccum ? 'iceberg-buy' : isDist ? 'iceberg-sell' : null
        case 'Sniper': return isAccum ? 'sniper-buy' : isDist ? 'sniper-sell' : null
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
  // 7) 단일봉 Wyckoff (5) — 기존 호환
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
  // 8) VWAP (5)
  // ============================================
  let vwapComponent = 0
  if (vwap.zone === 'above') {
    vwapComponent = WEIGHTS.vwap * Math.min(1, Math.abs(vwap.distance) / 2)
  } else if (vwap.zone === 'below') {
    vwapComponent = -WEIGHTS.vwap * Math.min(1, Math.abs(vwap.distance) / 2)
  }

  // ============================================
  // OB/FVG / Session — informational signals (점수에 직접 반영 안함, signalDetails로만 노출)
  // ============================================
  if (orderBlocksFvg) {
    const unmitigatedOB = orderBlocksFvg.orderBlocks.find((ob) => !ob.mitigated)
    if (unmitigatedOB) {
      signalDetails.push({
        type: unmitigatedOB.direction === 'bullish' ? 'order-block-bullish' : 'order-block-bearish',
        confidence: 60,
        description: `미체결 ${unmitigatedOB.direction === 'bullish' ? '강세' : '약세'} 오더블록 (${unmitigatedOB.low.toFixed(2)}~${unmitigatedOB.high.toFixed(2)})`,
        triggeredAt,
      })
    }
    const unfilledFvg = orderBlocksFvg.fvgs.find((f) => !f.filled)
    if (unfilledFvg) {
      signalDetails.push({
        type: unfilledFvg.direction === 'bullish' ? 'fvg-bullish' : 'fvg-bearish',
        confidence: 55,
        description: `미충족 ${unfilledFvg.direction === 'bullish' ? '강세' : '약세'} FVG (${unfilledFvg.bottom.toFixed(2)}~${unfilledFvg.top.toFixed(2)})`,
        triggeredAt,
      })
    }
  }

  if (session) {
    if (session.judasSwingDetected) {
      signalDetails.push({
        type: 'judas-swing',
        confidence: 70,
        description: `Judas Swing — ${session.judasSwingDirection === 'bullish-fake' ? '가짜 상승' : '가짜 하락'} 후 반전`,
        triggeredAt,
      })
    }
    if (session.po3Pattern) {
      signalDetails.push({
        type: session.po3Pattern,
        confidence: 65,
        description: `PO3 (AMD) ${session.po3Pattern === 'po3-accumulation' ? '매집' : '분배'} 패턴`,
        triggeredAt,
      })
    }
  }

  if (newsContext && newsContext.pattern) {
    signalDetails.push({
      type: newsContext.pattern,
      confidence: 70,
      description: newsContext.description,
      triggeredAt,
    })
  }

  // ============================================
  // 트랩 모디파이어 + Trap 시그널
  // ============================================
  if (traps) {
    if (traps.bullTrapDetected) {
      signalDetails.push({
        type: 'bull-trap',
        confidence: 75,
        description: traps.description || '불 트랩 — 가짜 상향 돌파',
        triggeredAt,
      })
    }
    if (traps.bearTrapDetected) {
      signalDetails.push({
        type: 'bear-trap',
        confidence: 75,
        description: traps.description || '베어 트랩 — 가짜 하향 이탈',
        triggeredAt,
      })
    }
  }

  // ============================================
  // 종합 점수
  // ============================================
  let rawScore =
    flowComponent
    + wyckoffPhaseComponent
    + structureComponent
    + liquidityComponent
    + vsaComponent
    + algoComponent
    + wyckoffComponent
    + vwapComponent

  // 트랩 모디파이어
  if (traps?.bullTrapDetected && rawScore > 0) {
    rawScore *= 0.7
  }
  if (traps?.bearTrapDetected && rawScore < 0) {
    rawScore *= 0.7
  }

  const overallScore = Math.round(clamp(rawScore, -100, 100))

  let interpretation: Interpretation
  if (overallScore >= 60) interpretation = 'strong-accumulation'
  else if (overallScore >= 30) interpretation = 'mild-accumulation'
  else if (overallScore <= -60) interpretation = 'strong-distribution'
  else if (overallScore <= -30) interpretation = 'mild-distribution'
  else interpretation = 'neutral'

  // ============================================
  // 조작 위험도 점수 (manipulationRiskScore)
  // ============================================
  let manipRisk = 0
  if (traps?.bullTrapDetected) manipRisk += 40
  if (traps?.bearTrapDetected) manipRisk += 40
  if (newsContext?.pattern === 'news-fade') manipRisk += 30
  if (newsContext?.pattern === 'sell-the-news') manipRisk += 20
  if (vsa?.signals.some((s) => s.type === 'buying-climax' || s.type === 'selling-climax')) manipRisk += 20
  if (vsa?.signals.some((s) => s.type === 'no-demand' || s.type === 'no-supply')) manipRisk += 10
  if (session?.judasSwingDetected) manipRisk += 15
  const manipulationRiskScore = clamp(manipRisk, 0, 100)

  return {
    overallScore,
    interpretation,
    signalDetails,
    manipulationRiskScore,
  }
}
