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

  // ===== KOSPI 추가 (시가총액 상위, 인기 종목) =====
  { ticker: '272210', name: '한화시스템', alias: ['hanwha systems'] },
  { ticker: '000880', name: '한화', alias: ['hanwha'] },
  { ticker: '009830', name: '한화솔루션', alias: ['hanwha solutions'] },
  { ticker: '000370', name: '한화손해보험', alias: ['hanwha general insurance'] },
  { ticker: '402340', name: 'SK스퀘어', alias: ['sk square'] },
  { ticker: '361610', name: 'SK아이이테크놀로지', alias: ['sk ie technology', 'skiet'] },
  { ticker: '011200', name: 'HMM', alias: ['hmm'] },
  { ticker: '267250', name: 'HD현대', alias: ['hd hyundai'] },
  { ticker: '329180', name: 'HD현대중공업', alias: ['hd hyundai heavy', 'hyundai heavy'] },
  { ticker: '009540', name: 'HD한국조선해양', alias: ['ksoe', '한국조선해양'] },
  { ticker: '010140', name: '삼성중공업', alias: ['samsung heavy'] },
  { ticker: '267260', name: 'HD현대일렉트릭', alias: ['hd hyundai electric'] },
  { ticker: '010120', name: 'LS ELECTRIC', alias: ['ls electric', 'ls산전'] },
  { ticker: '006260', name: 'LS', alias: ['ls corp'] },
  { ticker: '003490', name: '대한항공', alias: ['korean air'] },
  { ticker: '020560', name: '아시아나항공', alias: ['asiana airlines'] },
  { ticker: '000720', name: '현대건설', alias: ['hyundai engineering'] },
  { ticker: '047040', name: '대우건설', alias: ['daewoo e&c'] },
  { ticker: '028050', name: '삼성E&A', alias: ['samsung e&a', '삼성엔지니어링'] },
  { ticker: '000150', name: '두산', alias: ['doosan'] },
  { ticker: '034020', name: '두산에너빌리티', alias: ['doosan enerbility', '두산중공업'] },
  { ticker: '241560', name: '두산밥캣', alias: ['doosan bobcat'] },
  { ticker: '079550', name: 'LIG넥스원', alias: ['lig nex1'] },
  { ticker: '064350', name: '현대로템', alias: ['hyundai rotem'] },
  { ticker: '000150', name: '두산', alias: ['doosan'] },
  { ticker: '139480', name: '이마트', alias: ['emart'] },
  { ticker: '023530', name: '롯데쇼핑', alias: ['lotte shopping'] },
  { ticker: '004170', name: '신세계', alias: ['shinsegae'] },
  { ticker: '161890', name: '한국콜마', alias: ['kolmar korea'] },
  { ticker: '161390', name: '한국타이어앤테크놀로지', alias: ['hankook tire'] },
  { ticker: '073240', name: '금호타이어', alias: ['kumho tire'] },
  { ticker: '034220', name: 'LG디스플레이', alias: ['lg display'] },
  { ticker: '000100', name: '유한양행', alias: ['yuhan'] },
  { ticker: '170900', name: '동아에스티', alias: ['donga st'] },
  { ticker: '128940', name: '한미약품', alias: ['hanmi pharm'] },
  { ticker: '009420', name: '한올바이오파마', alias: ['hanall biopharma'] },
  { ticker: '326030', name: 'SK바이오팜', alias: ['sk biopharm'] },
  { ticker: '302440', name: 'SK바이오사이언스', alias: ['sk bioscience'] },
  { ticker: '145020', name: '휴젤', alias: ['hugel'] },
  { ticker: '009240', name: '한샘', alias: ['hanssem'] },
  { ticker: '004990', name: '롯데지주', alias: ['lotte holdings'] },
  { ticker: '000080', name: '하이트진로', alias: ['hite jinro'] },
  { ticker: '004990', name: '롯데지주', alias: ['lotte holdings'] },
  { ticker: '093370', name: '후성', alias: ['foosung'] },
  { ticker: '012630', name: 'HDC', alias: ['hdc'] },
  { ticker: '294870', name: 'HDC현대산업개발', alias: ['hdc hyundai dev'] },
  { ticker: '030000', name: '제일기획', alias: ['cheil worldwide'] },
  { ticker: '180640', name: '한진칼', alias: ['hanjin kal'] },
  { ticker: '003410', name: '쌍용씨앤이', alias: ['ssangyong cement'] },
  { ticker: '008770', name: '호텔신라', alias: ['hotel shilla'] },
  { ticker: '079430', name: '현대리바트', alias: ['hyundai livart'] },
  { ticker: '000040', name: 'KR모터스', alias: ['kr motors'] },
  { ticker: '015230', name: '대창단조', alias: ['daechang forging'] },
  { ticker: '298050', name: '효성첨단소재', alias: ['hyosung advanced materials'] },
  { ticker: '004800', name: '효성', alias: ['hyosung'] },
  { ticker: '298040', name: '효성중공업', alias: ['hyosung heavy industries'] },
  { ticker: '298020', name: '효성티앤씨', alias: ['hyosung tnc'] },
  { ticker: '120110', name: '코오롱인더', alias: ['kolon industries'] },
  { ticker: '001120', name: 'LX인터내셔널', alias: ['lx international'] },
  { ticker: '383220', name: 'F&F', alias: ['f&f'] },
  { ticker: '111770', name: '영원무역', alias: ['youngone'] },
  { ticker: '081660', name: '휠라홀딩스', alias: ['fila holdings'] },
  { ticker: '241590', name: '화승엔터프라이즈', alias: ['hwaseung enterprise'] },
  { ticker: '123890', name: '한국아트라스BX', alias: ['hankook atlas bx'] },
  { ticker: '003690', name: '코리안리', alias: ['korean re'] },
  { ticker: '005830', name: 'DB손해보험', alias: ['db insurance'] },
  { ticker: '088350', name: '한화생명', alias: ['hanwha life'] },
  { ticker: '001450', name: '현대해상', alias: ['hyundai marine'] },
  { ticker: '029780', name: '삼성카드', alias: ['samsung card'] },
  { ticker: '024110', name: '기업은행', alias: ['ibk'] },
  { ticker: '138930', name: 'BNK금융지주', alias: ['bnk financial'] },
  { ticker: '175330', name: 'JB금융지주', alias: ['jb financial'] },
  { ticker: '139130', name: 'DGB금융지주', alias: ['dgb financial'] },
  { ticker: '011070', name: 'LG이노텍', alias: ['lg innotek'] },
  { ticker: '007070', name: 'GS리테일', alias: ['gs retail'] },
  { ticker: '078930', name: 'GS', alias: ['gs corp'] },
  { ticker: '006650', name: '대한유화', alias: ['korea petrochemical'] },
  { ticker: '011780', name: '금호석유', alias: ['kumho petrochemical', '금호석유화학'] },
  { ticker: '298000', name: '효성화학', alias: ['hyosung chemical'] },
  { ticker: '003670', name: '포스코퓨처엠', alias: ['posco future m', '포스코케미칼'] },
  { ticker: '402030', name: 'POSCO홀딩스1우', alias: [] },
  { ticker: '005935', name: '삼성전자우', alias: ['samsung electronics pref'] },
  { ticker: '005385', name: '현대차우', alias: ['hyundai motor pref'] },
  { ticker: '051915', name: 'LG화학우', alias: [] },
  { ticker: '180400', name: '엔에이치엔', alias: ['nhn'] },
  { ticker: '294140', name: '상상인', alias: ['sangsangin'] },
  { ticker: '326030', name: 'SK바이오팜', alias: ['sk biopharm'] },
  { ticker: '085620', name: '미래에셋생명', alias: ['mirae asset life'] },
  { ticker: '030210', name: '다올투자증권', alias: ['daol securities'] },
  { ticker: '003540', name: '대신증권', alias: ['daishin securities'] },
  { ticker: '008560', name: '메리츠증권', alias: ['meritz securities'] },
  { ticker: '039490', name: '키움증권', alias: ['kiwoom securities'] },
  { ticker: '016360', name: '삼성증권', alias: ['samsung securities'] },
  { ticker: '006800', name: '미래에셋증권', alias: ['mirae asset securities'] },
  { ticker: '030610', name: '교보증권', alias: ['kyobo securities'] },
  { ticker: '001440', name: '대한전선', alias: ['taihan electric'] },
  { ticker: '000990', name: 'DB하이텍', alias: ['db hitek'] },
  { ticker: '042700', name: '한미반도체', alias: ['hanmi semiconductor'] },
  { ticker: '108860', name: '셀바스AI', alias: ['selvas ai'] },
  { ticker: '195870', name: '해성디에스', alias: ['haesung ds'] },
  { ticker: '011930', name: '신성통상', alias: ['shinsung tongsang'] },
  { ticker: '001230', name: '동국제강', alias: ['dongkuk steel'] },

  // ===== KOSDAQ 추가 (시가총액 상위, 인기 종목) =====
  { ticker: '046970', name: '우리로', alias: ['woori ro'] },
  { ticker: '328130', name: '루닛', alias: ['lunit'] },
  { ticker: '418420', name: '레인보우로보틱스', alias: ['rainbow robotics'] },
  { ticker: '348370', name: '엔켐', alias: ['enchem'] },
  { ticker: '950140', name: '잉글우드랩', alias: ['englewood lab'] },
  { ticker: '450080', name: '에코프로머티', alias: ['ecopro materials'] },
  { ticker: '460860', name: '동인기연', alias: ['dongin engineering'] },
  { ticker: '058820', name: 'CMG제약', alias: ['cmg pharm'] },
  { ticker: '141080', name: '리가켐바이오', alias: ['ligachem bio', '레고켐바이오'] },
  { ticker: '432320', name: '카카오엔터프라이즈', alias: ['kakao enterprise'] },
  { ticker: '950130', name: '엑세스바이오', alias: ['access bio'] },
  { ticker: '084370', name: '유진테크', alias: ['eugene tech'] },
  { ticker: '067160', name: '아프리카TV', alias: ['afreeca tv', '숲'] },
  { ticker: '194480', name: '데브시스터즈', alias: ['devsisters'] },
  { ticker: '095340', name: 'ISC', alias: ['isc'] },
  { ticker: '299900', name: '위지윅스튜디오', alias: ['wysiwyg studios'] },
  { ticker: '265520', name: 'AP시스템', alias: ['ap systems'] },
  { ticker: '108860', name: '셀바스AI', alias: ['selvas ai'] },
  { ticker: '005290', name: '동진쎄미켐', alias: ['dongjin semichem'] },
  { ticker: '084850', name: '아이티엠반도체', alias: ['itm semiconductor'] },
  { ticker: '237690', name: '에스티팜', alias: ['st pharm'] },
  { ticker: '950170', name: 'JTC', alias: ['jtc'] },
  { ticker: '950210', name: '프레스티지바이오파마', alias: ['prestige biopharma'] },
  { ticker: '393890', name: '나노씨엠에스', alias: ['nano cms'] },
  { ticker: '475150', name: 'HLB바이오스텝', alias: ['hlb biostep'] },
  { ticker: '048410', name: '현대바이오', alias: ['hyundai bio'] },
  { ticker: '028300', name: 'HLB', alias: ['hlb'] },
  { ticker: '376300', name: '디어유', alias: ['dear u'] },
  { ticker: '353200', name: '대덕전자', alias: ['daeduck electronics'] },
  { ticker: '041960', name: '코미팜', alias: ['komipharm'] },
  { ticker: '393890', name: '나노씨엠에스', alias: ['nano cms'] },
  { ticker: '317510', name: '포니링크', alias: ['pony link'] },
  { ticker: '950180', name: 'SBI액시즈', alias: ['sbi axes'] },
  { ticker: '900290', name: 'GRT', alias: ['grt'] },
  { ticker: '900280', name: '골든센츄리', alias: ['golden century'] },
  { ticker: '317240', name: 'TS트릴리온', alias: ['ts trillion'] },
  { ticker: '278470', name: '에이피알', alias: ['apr'] },
  { ticker: '298380', name: '에이비엘바이오', alias: ['abl bio'] },
  { ticker: '060280', name: '큐렉소', alias: ['curexo'] },
  { ticker: '388720', name: '나라셀라', alias: ['narasella'] },
  { ticker: '347140', name: '피엔케이피부임상연구센타', alias: ['pnk skin'] },
  { ticker: '376180', name: '하나기술', alias: ['hana technology'] },
  { ticker: '108490', name: '로보스타', alias: ['robostar'] },
  { ticker: '101730', name: '위메이드맥스', alias: ['wemade max'] },
  { ticker: '376300', name: '디어유', alias: ['dear u'] },
  { ticker: '251270', name: '넷마블', alias: ['netmarble'] },
  { ticker: '192080', name: '더블유게임즈', alias: ['double u games'] },
  { ticker: '900070', name: '글로벌에스엠', alias: ['global sm'] },
  { ticker: '950220', name: '나노신소재', alias: ['nano new materials'] },
  { ticker: '294630', name: '미투젠', alias: ['mitogen'] },
  { ticker: '900110', name: '이스트아시아홀딩스', alias: ['east asia holdings'] },
  { ticker: '900300', name: '오가닉티코스메틱', alias: ['organictea cosmetic'] },
  { ticker: '900250', name: '크리스탈신소재', alias: ['crystal new materials'] },
  { ticker: '950160', name: '코오롱티슈진', alias: ['kolon tissuegene'] },
  { ticker: '900260', name: '로스웰', alias: ['rosewell'] },
  { ticker: '900270', name: '헝셩그룹', alias: ['heng sheng group'] },
  { ticker: '900310', name: '컬러레이', alias: ['color ray'] },
  { ticker: '900340', name: '윙입푸드', alias: ['wing yip food'] },
  { ticker: '060980', name: '한일홀딩스', alias: ['hanil holdings'] },
  { ticker: '012040', name: '한국멤브레인', alias: ['korea membrane'] },
]

/**
 * 제네릭 종목 딕셔너리 검색 (한글/영문/코드 지원)
 */
export function searchTickerDict<T extends { ticker: string; name: string; alias?: string[] }>(
  dict: T[],
  query: string,
  limit = 10
): T[] {
  const q = query.trim().toLowerCase()
  if (q.length < 1) return []

  const scored: { entry: T; score: number }[] = []

  for (const entry of dict) {
    const tickerLower = entry.ticker.toLowerCase()
    // 1. 정확한 코드 일치
    if (tickerLower === q) {
      return [entry]
    }
    // 2. 코드 접두사 일치
    if (tickerLower.startsWith(q)) {
      scored.push({ entry, score: 100 - entry.ticker.length })
      continue
    }
    // 3. 이름 정확히 일치
    const nameLower = entry.name.toLowerCase()
    if (nameLower === q) {
      scored.push({ entry, score: 90 })
      continue
    }
    // 4. 이름 접두사 일치
    if (nameLower.startsWith(q) || entry.name.startsWith(query)) {
      scored.push({ entry, score: 80 - entry.name.length })
      continue
    }
    // 5. 이름 포함
    if (nameLower.includes(q) || entry.name.includes(query)) {
      scored.push({ entry, score: 60 - entry.name.length })
      continue
    }
    // 6. alias 일치 (접두사 우선, 포함은 낮은 점수)
    if (entry.alias?.some(a => a.toLowerCase().startsWith(q))) {
      scored.push({ entry, score: 55 })
      continue
    }
    if (entry.alias?.some(a => a.toLowerCase().includes(q))) {
      scored.push({ entry, score: 45 })
      continue
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry)
}

/**
 * 한글/영문 쿼리로 국내 종목 검색
 */
export function searchKRTicker(query: string, limit = 10): KRTickerEntry[] {
  return searchTickerDict(KR_TICKER_DICT, query, limit)
}
