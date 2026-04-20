/**
 * 국내 주요 종목 한글 매핑 (Yahoo Finance는 한글 검색 미지원 대응)
 *
 * 구성: KOSPI + KOSDAQ 시가총액 상위 + 주요 관심 종목
 */

export interface KRTickerEntry {
  ticker: string
  name: string
  alias?: string[]  // 검색 보조어 (영문명, 줄임말 등)
}

export const KR_TICKER_DICT: KRTickerEntry[] = [
  // KOSPI 대형주
  { ticker: '005930', name: '삼성전자', alias: ['samsung', 'samsung electronics'] },
  { ticker: '000660', name: 'SK하이닉스', alias: ['sk hynix', 'hynix'] },
  { ticker: '373220', name: 'LG에너지솔루션', alias: ['lg energy', 'lges'] },
  { ticker: '207940', name: '삼성바이오로직스', alias: ['samsung biologics'] },
  { ticker: '005380', name: '현대차', alias: ['hyundai motor', 'hyundai'] },
  { ticker: '000270', name: '기아', alias: ['kia', 'kia motors'] },
  { ticker: '035420', name: 'NAVER', alias: ['네이버', 'naver'] },
  { ticker: '035720', name: '카카오', alias: ['kakao'] },
  { ticker: '051910', name: 'LG화학', alias: ['lg chem'] },
  { ticker: '006400', name: '삼성SDI', alias: ['samsung sdi'] },
  { ticker: '068270', name: '셀트리온', alias: ['celltrion'] },
  { ticker: '105560', name: 'KB금융', alias: ['kb financial'] },
  { ticker: '055550', name: '신한지주', alias: ['shinhan', 'shinhan financial'] },
  { ticker: '086790', name: '하나금융지주', alias: ['hana financial'] },
  { ticker: '316140', name: '우리금융지주', alias: ['woori financial'] },
  { ticker: '032830', name: '삼성생명', alias: ['samsung life'] },
  { ticker: '003550', name: 'LG', alias: ['lg corp'] },
  { ticker: '034730', name: 'SK', alias: ['sk holdings'] },
  { ticker: '017670', name: 'SK텔레콤', alias: ['sk telecom', 'skt'] },
  { ticker: '015760', name: '한국전력', alias: ['kepco', '한전'] },
  { ticker: '033780', name: 'KT&G', alias: ['kt&g'] },
  { ticker: '030200', name: 'KT', alias: ['kt corp'] },
  { ticker: '032640', name: 'LG유플러스', alias: ['lg u+', 'lg uplus'] },
  { ticker: '096770', name: 'SK이노베이션', alias: ['sk innovation'] },
  { ticker: '010130', name: '고려아연', alias: ['korea zinc'] },
  { ticker: '011170', name: '롯데케미칼', alias: ['lotte chemical'] },
  { ticker: '009150', name: '삼성전기', alias: ['samsung electro-mechanics'] },
  { ticker: '018260', name: '삼성에스디에스', alias: ['samsung sds'] },
  { ticker: '066570', name: 'LG전자', alias: ['lg electronics'] },
  { ticker: '010950', name: 'S-Oil', alias: ['s-oil', 's oil', '에스오일'] },
  { ticker: '012330', name: '현대모비스', alias: ['hyundai mobis'] },
  { ticker: '028260', name: '삼성물산', alias: ['samsung c&t'] },
  { ticker: '000810', name: '삼성화재', alias: ['samsung fire'] },
  { ticker: '005490', name: 'POSCO홀딩스', alias: ['posco', '포스코홀딩스', '포스코'] },
  { ticker: '251270', name: '넷마블', alias: ['netmarble'] },
  { ticker: '036570', name: '엔씨소프트', alias: ['ncsoft', 'nc soft'] },
  { ticker: '352820', name: '하이브', alias: ['hybe', 'bts'] },
  { ticker: '041510', name: '에스엠', alias: ['sm entertainment', 'sm ent'] },
  { ticker: '035900', name: 'JYP Ent.', alias: ['jyp', 'jyp엔터'] },
  { ticker: '122870', name: '와이지엔터테인먼트', alias: ['yg', 'yg엔터', 'yg entertainment'] },

  // 코스닥 주요
  { ticker: '091990', name: '셀트리온헬스케어', alias: ['celltrion healthcare'] },
  { ticker: '247540', name: '에코프로비엠', alias: ['ecopro bm'] },
  { ticker: '086520', name: '에코프로', alias: ['ecopro'] },
  { ticker: '196170', name: '알테오젠', alias: ['alteogen'] },
  { ticker: '357780', name: '솔브레인', alias: ['soulbrain'] },
  { ticker: '293490', name: '카카오게임즈', alias: ['kakao games'] },
  { ticker: '112040', name: '위메이드', alias: ['wemade'] },
  { ticker: '263750', name: '펄어비스', alias: ['pearl abyss'] },
  { ticker: '039030', name: '이오테크닉스', alias: ['eo technics'] },
  { ticker: '214150', name: '클래시스', alias: ['classys'] },
  { ticker: '078130', name: '국일제지', alias: ['kook il paper'] },
  { ticker: '032500', name: '케이엠더블유', alias: ['kmw'] },
  { ticker: '278280', name: '천보', alias: ['chunbo'] },
  { ticker: '058470', name: '리노공업', alias: ['leeno industrial'] },
  { ticker: '067310', name: '하나마이크론', alias: ['hana micron'] },
  { ticker: '131970', name: '두산테스나', alias: ['doosan tesna'] },

  // 기타 관심
  { ticker: '090430', name: '아모레퍼시픽', alias: ['amore pacific'] },
  { ticker: '051900', name: 'LG생활건강', alias: ['lg h&h'] },
  { ticker: '097950', name: 'CJ제일제당', alias: ['cj cheiljedang'] },
  { ticker: '271560', name: '오리온', alias: ['orion'] },
  { ticker: '004020', name: '현대제철', alias: ['hyundai steel'] },
  { ticker: '329180', name: '현대중공업', alias: ['hyundai heavy industries'] },
  { ticker: '042660', name: '한화오션', alias: ['hanwha ocean'] },
  { ticker: '010620', name: '현대미포조선', alias: ['hyundai mipo'] },
  { ticker: '047810', name: '한국항공우주', alias: ['kai', '한국우주항공'] },
  { ticker: '012450', name: '한화에어로스페이스', alias: ['hanwha aerospace'] },
]

/**
 * 한글/영문 쿼리로 국내 종목 검색
 */
export function searchKRTicker(query: string, limit = 10): KRTickerEntry[] {
  const q = query.trim().toLowerCase()
  if (q.length < 1) return []

  const scored: { entry: KRTickerEntry; score: number }[] = []

  for (const entry of KR_TICKER_DICT) {
    // 1. 정확한 코드 일치
    if (entry.ticker === q) {
      return [entry]
    }
    // 2. 코드 접두사 일치
    if (entry.ticker.startsWith(q)) {
      scored.push({ entry, score: 100 - entry.ticker.length })
      continue
    }
    // 3. 한글 이름 정확히 일치
    const nameLower = entry.name.toLowerCase()
    if (nameLower === q) {
      scored.push({ entry, score: 90 })
      continue
    }
    // 4. 한글 이름 접두사 일치 ("삼성" → 삼성전자, 삼성바이오로직스 등)
    if (nameLower.startsWith(q) || entry.name.startsWith(query)) {
      scored.push({ entry, score: 80 - entry.name.length })
      continue
    }
    // 5. 한글 이름 포함
    if (nameLower.includes(q) || entry.name.includes(query)) {
      scored.push({ entry, score: 60 - entry.name.length })
      continue
    }
    // 6. alias 일치
    if (entry.alias?.some(a => a.toLowerCase().includes(q))) {
      scored.push({ entry, score: 50 })
      continue
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry)
}
