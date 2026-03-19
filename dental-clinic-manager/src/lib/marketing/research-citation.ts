import Anthropic from '@anthropic-ai/sdk';

// ============================================
// 논문 인용 기능 (옵션)
// 치과 관련 학술 논문을 검색하여 블로그 글에 인용 삽입
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ResearchCitation {
  title: string;
  authors: string;
  journal: string;
  year: string;
  summary: string;
  relevance: number; // 0~1
}

export interface CitationResult {
  citedBody: string;          // 인용이 삽입된 본문
  references: string[];       // 참고 논문 목록
  citationCount: number;      // 인용 수
}

/**
 * PubMed에서 치과 관련 논문 검색
 */
export async function searchPubMed(keyword: string, maxResults: number = 5): Promise<ResearchCitation[]> {
  try {
    // 1. PubMed E-utilities로 검색
    const searchQuery = encodeURIComponent(`${keyword} dental OR dentistry`);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchQuery}&retmax=${maxResults}&sort=relevance&retmode=json`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const ids: string[] = searchData.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    // 2. 논문 상세 정보 가져오기
    const detailUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    const citations: ResearchCitation[] = [];
    for (const id of ids) {
      const article = detailData.result?.[id];
      if (!article) continue;

      citations.push({
        title: article.title || '',
        authors: article.sortfirstauthor || article.authors?.[0]?.name || '',
        journal: article.fulljournalname || article.source || '',
        year: article.pubdate?.split(' ')[0] || '',
        summary: article.title || '', // PubMed summary는 별도 API 필요
        relevance: 0.5,
      });
    }

    return citations;
  } catch (error) {
    console.error('[Research] PubMed 검색 실패:', error);
    return [];
  }
}

/**
 * KCI (한국학술지인용색인)에서 국내 논문 검색
 */
export async function searchKCI(keyword: string, maxResults: number = 3): Promise<ResearchCitation[]> {
  try {
    const apiKey = process.env.KCI_API_KEY;
    if (!apiKey) return [];

    const searchQuery = encodeURIComponent(keyword);
    const url = `https://open.kci.go.kr/po/openapi/openApiSearch.kci?apiCode=articleSearch&title=${searchQuery}&displayCount=${maxResults}&key=${apiKey}`;

    const res = await fetch(url);
    const text = await res.text();

    // XML 파싱 (간단한 정규식 기반)
    const citations: ResearchCitation[] = [];
    const articles = text.match(/<record>([\s\S]*?)<\/record>/g) || [];

    for (const article of articles) {
      const getField = (field: string) => {
        const match = article.match(new RegExp(`<${field}>(.*?)</${field}>`));
        return match?.[1] || '';
      };

      citations.push({
        title: getField('article-title'),
        authors: getField('author-name'),
        journal: getField('journal-name'),
        year: getField('pub-year'),
        summary: getField('abstract'),
        relevance: 0.5,
      });
    }

    return citations;
  } catch (error) {
    console.error('[Research] KCI 검색 실패:', error);
    return [];
  }
}

/**
 * 논문 검색 통합 (PubMed + KCI)
 */
export async function searchResearch(keyword: string): Promise<ResearchCitation[]> {
  const [pubmedResults, kciResults] = await Promise.all([
    searchPubMed(keyword, 3),
    searchKCI(keyword, 2),
  ]);

  return [...kciResults, ...pubmedResults].slice(0, 3);
}

/**
 * 블로그 글에 논문 인용 삽입
 */
export async function insertCitations(
  body: string,
  keyword: string
): Promise<CitationResult> {
  // 1. 관련 논문 검색
  const citations = await searchResearch(keyword);

  if (citations.length === 0) {
    return {
      citedBody: body,
      references: [],
      citationCount: 0,
    };
  }

  // 2. 논문 데이터를 정리
  const researchData = citations
    .map((c, i) => `[${i + 1}] ${c.authors} (${c.year}). "${c.title}". ${c.journal}`)
    .join('\n');

  // 3. Claude API로 인용 삽입
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `다음 블로그 글에 아래 논문 내용을 자연스럽게 인용해주세요.

## 규칙
- 논문 내용을 그대로 복붙하지 말고 쉬운 말로 풀어서 설명
- "○○ 연구팀(20XX)에 따르면..." 형태로 자연스럽게 삽입
- 2~3개의 인용을 적절한 위치에 삽입
- 글 마지막에 [참고 논문] 섹션 추가
- 기존 [IMAGE: ...] 마커는 그대로 유지
- 글의 어투와 톤은 변경하지 마세요

## 논문 정보
${researchData}

## 블로그 글
${body}`,
      },
    ],
  });

  const citedBody = response.content[0].type === 'text' ? response.content[0].text : body;

  // 참고 논문 목록 생성
  const references = citations.map(
    (c) => `${c.authors}, "${c.title}", ${c.journal}, ${c.year}`
  );

  return {
    citedBody,
    references,
    citationCount: citations.length,
  };
}
