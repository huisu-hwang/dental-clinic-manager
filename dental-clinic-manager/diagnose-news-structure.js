// 치의신보 HTML 구조 진단 스크립트
const fs = require('fs');

async function diagnoseNewsStructure() {
  try {
    console.log('=== 치의신보 HTML 구조 진단 ===\n');

    const targetUrl = 'https://www.dailydental.co.kr/news/articleList.html';

    console.log('1. 페이지 가져오기:', targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      }
    });

    console.log('응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ 요청 실패:', response.status);
      return;
    }

    const html = await response.text();
    console.log('HTML 크기:', (html.length / 1024).toFixed(2), 'KB\n');

    // HTML 저장
    fs.writeFileSync('articleList-page.html', html, 'utf-8');
    console.log('✅ HTML 저장됨: articleList-page.html\n');

    // "많이 본 뉴스" 섹션 찾기
    console.log('2. "많이 본 뉴스" 섹션 분석\n');

    // 다양한 패턴으로 검색
    const patterns = [
      { name: '직접 텍스트 검색', regex: /많이\s*본\s*뉴스/gi },
      { name: 'most 클래스', regex: /<[^>]*class="[^"]*most[^"]*"/gi },
      { name: 'view 클래스', regex: /<[^>]*class="[^"]*view[^"]*"/gi },
      { name: 'ranking 클래스', regex: /<[^>]*class="[^"]*ranking[^"]*"/gi },
      { name: 'popular 클래스', regex: /<[^>]*class="[^"]*popular[^"]*"/gi },
      { name: 'best 클래스', regex: /<[^>]*class="[^"]*best[^"]*"/gi },
      { name: 'hot 클래스', regex: /<[^>]*class="[^"]*hot[^"]*"/gi },
      { name: 'tab 클래스', regex: /<[^>]*class="[^"]*tab[^"]*"/gi },
    ];

    for (const { name, regex } of patterns) {
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        console.log(`✓ "${name}" 발견: ${matches.length}개`);
        console.log(`  예시: ${matches[0].substring(0, 150)}...`);
      }
    }

    // "많이 본 뉴스" 섹션 추출
    const mostViewedMatch = html.match(/많이\s*본\s*뉴스[\s\S]{0,5000}/i);
    if (mostViewedMatch) {
      const section = mostViewedMatch[0].substring(0, 3000);
      console.log('\n3. "많이 본 뉴스" 섹션 HTML 샘플:\n');
      console.log(section);
      console.log('\n---\n');

      fs.writeFileSync('mostviewed-section.html', section, 'utf-8');
      console.log('✅ "많이 본 뉴스" 섹션 저장됨: mostviewed-section.html\n');
    }

    // articleView 링크 찾기
    console.log('4. articleView 링크 분석\n');
    const articlePattern = /<a[^>]*href="([^"]*articleView\.html\?idxno=\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    let count = 0;
    const articles = [];

    console.log('발견된 기사 링크:\n');
    while ((match = articlePattern.exec(html)) !== null && count < 15) {
      const link = match[1];
      let titleContent = match[2];

      // HTML 태그 제거
      let title = titleContent
        .replace(/<img[^>]*>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 숫자로 시작하는 경우 숫자 제거
      const originalTitle = title;
      title = title.replace(/^\d+[\.\s:：]+/, '').trim();
      title = title.replace(/^[\[\(]\d+[\]\)]\s*/, '').trim();

      if (title && title.length >= 5 && title.length <= 200) {
        articles.push({ title, link, originalTitle });
        count++;
        console.log(`[${count}] ${title}`);
        console.log(`    원본: ${originalTitle}`);
        console.log(`    링크: ${link}`);
        console.log();
      }
    }

    console.log(`\n✅ 총 ${articles.length}개 기사 발견`);

    // 결과 저장
    fs.writeFileSync('diagnosed-articles.json', JSON.stringify(articles, null, 2), 'utf-8');
    console.log('✅ 진단 결과 저장됨: diagnosed-articles.json');

  } catch (error) {
    console.error('❌ 에러 발생:', error.message);
    console.error(error.stack);
  }
}

diagnoseNewsStructure();
