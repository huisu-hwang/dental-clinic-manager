'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Play, Pause, Trash2, BarChart3, ChevronDown, ChevronUp, Edit3,
  X, CheckCircle2, AlertCircle, Target, Eye,
} from 'lucide-react'
import TickerSearch from './TickerSearch'
import type { InvestmentStrategy, Market } from '@/types/investment'

interface WatchlistItem {
  id: string
  ticker: string
  ticker_name: string | null
  market: Market
  is_active: boolean
}

interface Props {
  strategy: InvestmentStrategy
  hasCredential: boolean
  onRefresh: () => void
  onBacktest: (id: string) => void
}

const MARKET_LABELS: Record<string, string> = { KR: '국내', US: '미국' }

export default function StrategyCard({ strategy, hasCredential, onRefresh, onBacktest }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [addingMarket, setAddingMarket] = useState<Market>(strategy.target_market)
  const [toggling, setToggling] = useState(false)

  const loadWatchlist = useCallback(async () => {
    setWatchlistLoading(true)
    try {
      const res = await fetch(`/api/investment/watchlist?strategyId=${strategy.id}`)
      const json = await res.json()
      if (res.ok) setWatchlist(json.data || [])
    } catch { /* ignore */ } finally { setWatchlistLoading(false) }
  }, [strategy.id])

  useEffect(() => { loadWatchlist() }, [loadWatchlist])

  const addTicker = async (ticker: string, name?: string) => {
    if (!ticker.trim()) return
    const res = await fetch('/api/investment/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId: strategy.id,
        ticker: ticker.trim(),
        tickerName: name,
        market: addingMarket,
      }),
    })
    const json = await res.json()
    if (res.ok) loadWatchlist()
    else alert(json.error || '추가 실패')
  }

  const removeTicker = async (id: string) => {
    const res = await fetch(`/api/investment/watchlist?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadWatchlist()
  }

  const toggleActive = async () => {
    setToggling(true)
    try {
      const res = await fetch('/api/investment/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: strategy.id, isActive: !strategy.is_active }),
      })
      const json = await res.json()
      if (res.ok) {
        onRefresh()
      } else {
        // 활성화 조건 미충족 에러
        if (json.code === 'NO_WATCHLIST') {
          alert('⚠️ 감시 종목이 없습니다.\n\n전략 상세를 펼쳐서 자동매매할 종목을 먼저 추가해주세요.')
          setExpanded(true)
        } else if (json.code === 'NO_CREDENTIAL') {
          alert('⚠️ 증권 계좌 연결이 필요합니다.\n\n계좌 연결 탭에서 KIS 계좌를 먼저 연결해주세요.')
        } else {
          alert(json.error || '활성화 실패')
        }
      }
    } catch { alert('네트워크 오류') } finally { setToggling(false) }
  }

  const deleteStrategy = async () => {
    if (!confirm('이 전략을 삭제하시겠습니까?')) return
    const res = await fetch(`/api/investment/strategies?id=${strategy.id}`, { method: 'DELETE' })
    if (res.ok) onRefresh()
    else { const json = await res.json(); alert(json.error) }
  }

  // 활성화 준비 체크리스트
  const hasWatchlist = watchlist.length > 0
  const needsCredential = strategy.automation_level === 2
  const canActivate = hasWatchlist && (!needsCredential || hasCredential)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
      {/* 상단 헤더 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-at-text break-all">{strategy.name}</h3>
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              strategy.is_active
                ? 'bg-green-50 text-at-success border border-green-200'
                : 'bg-at-surface-alt text-at-text-weak border border-at-border'
            }`}>{strategy.is_active ? '● 자동매매 작동 중' : '● 비활성'}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-at-accent-light text-at-accent font-medium">
              {MARKET_LABELS[strategy.target_market] || strategy.target_market}
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700 font-medium">
              Level {strategy.automation_level} ({strategy.automation_level === 1 ? '알림만' : '완전자동'})
            </span>
          </div>
          {strategy.description && <p className="text-xs text-at-text-secondary mt-1 break-words">{strategy.description}</p>}
          <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-xs text-at-text-weak flex-wrap">
            <span>지표 {(strategy.indicators as unknown[]).length}개</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> 감시 종목 {watchlistLoading ? '...' : `${watchlist.length}개`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
          <button onClick={() => onBacktest(strategy.id)} className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors text-at-text-secondary" title="백테스트">
            <BarChart3 className="w-4 h-4" />
          </button>
          <Link
            href={`/investment/strategy/${strategy.id}/edit`}
            className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors text-at-text-secondary"
            title="수정"
          >
            <Edit3 className="w-4 h-4" />
          </Link>
          <button
            onClick={toggleActive}
            disabled={toggling}
            className={`p-2 rounded-lg transition-colors ${
              strategy.is_active
                ? 'hover:bg-amber-50 text-amber-600'
                : canActivate
                  ? 'hover:bg-green-50 text-green-600'
                  : 'hover:bg-at-surface-alt text-at-text-secondary'
            }`}
            title={strategy.is_active ? '자동매매 중지' : '자동매매 시작'}
          >
            {strategy.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={deleteStrategy} disabled={strategy.is_active} className="p-2 rounded-lg hover:bg-red-50 transition-colors text-at-error/60 hover:text-at-error disabled:opacity-40 disabled:cursor-not-allowed" title="삭제">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors text-at-text-secondary" title={expanded ? '접기' : '펼치기'}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 활성화 체크리스트 (비활성 상태일 때만) */}
      {!strategy.is_active && (
        <div className="mt-2 p-3 rounded-xl bg-at-surface-alt border border-at-border">
          <p className="text-xs font-semibold text-at-text mb-2">🚀 자동매매 시작 준비</p>
          <ul className="text-xs space-y-1">
            <li className="flex items-center gap-2">
              {hasWatchlist ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              )}
              <span className={hasWatchlist ? 'text-at-text-secondary' : 'text-at-text font-medium'}>
                감시 종목 추가 ({watchlist.length}개)
                {!hasWatchlist && (
                  <button onClick={() => setExpanded(true)} className="ml-2 text-at-accent underline text-xs">
                    지금 추가
                  </button>
                )}
              </span>
            </li>
            {needsCredential && (
              <li className="flex items-center gap-2">
                {hasCredential ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                )}
                <span className={hasCredential ? 'text-at-text-secondary' : 'text-at-text font-medium'}>
                  증권 계좌 연결 (Level 2 필수)
                </span>
              </li>
            )}
          </ul>
          {canActivate && (
            <button
              onClick={toggleActive}
              disabled={toggling}
              className="mt-3 w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              ▶ 자동매매 시작
            </button>
          )}
        </div>
      )}

      {/* 확장 영역: 감시 종목 관리 */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-at-border space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-at-text">감시 종목 (자동매매 대상)</h4>
              <span className="text-xs text-at-text-weak">{watchlist.length}/20개</span>
            </div>
            <p className="text-xs text-at-text-secondary mb-3">
              이 전략이 자동으로 매매할 종목을 추가하세요. 전략 활성화 시 이 종목들의 실시간 가격을 감시합니다.
            </p>

            {/* 종목 추가 - 모바일: 세로 배치, 데스크톱: 가로 배치 */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
              <select
                value={addingMarket}
                onChange={e => setAddingMarket(e.target.value as Market)}
                className="px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent w-full sm:w-24"
              >
                <option value="KR">국내</option>
                <option value="US">미국</option>
              </select>
              <TickerSearch
                onSelect={(ticker, name) => addTicker(ticker, name)}
                market={addingMarket}
                className="w-full sm:flex-1"
              />
            </div>

            {/* 종목 목록 */}
            {watchlist.length === 0 ? (
              <div className="text-center py-4 text-xs text-at-text-weak">
                <Target className="w-6 h-6 mx-auto mb-1 opacity-30" />
                검색으로 종목을 추가해주세요
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {watchlist.map(w => (
                  <span key={w.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-at-surface-alt border border-at-border text-sm">
                    <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                      w.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>{w.market}</span>
                    <span className="font-mono font-semibold text-at-text">{w.ticker}</span>
                    {w.ticker_name && w.ticker_name !== w.ticker && (
                      <span className="text-at-text-secondary text-xs">{w.ticker_name}</span>
                    )}
                    <button
                      onClick={() => removeTicker(w.id)}
                      disabled={strategy.is_active}
                      className="text-at-text-weak hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={strategy.is_active ? '전략이 활성 상태라 삭제 불가' : '삭제'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
