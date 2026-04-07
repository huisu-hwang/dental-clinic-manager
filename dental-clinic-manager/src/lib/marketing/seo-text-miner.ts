import type { SeoKeywordMiningResult } from '@/types/marketing';

interface AnalyzedPostRow {
  body_text: string | null;
  title: string;
  tags: string[] | null;
  body_length: number;
  image_count: number;
  heading_count: number;
  keyword_count: number;
}

const STOP_WORDS = new Set([
  '은', '는', '이', '가', '을', '를', '에', '의', '로', '와',
  '과', '등', '한', '된', '하는', '합니다', '입니다', '있는', '없는', '되는',
  '하고', '에서', '으로', '까지', '부터', '에게', '처럼', '같은', '통해', '대한',
  '위한', '것은', '것이', '것을', '수도', '때문', '하면', '해서', '그리고', '하지만',
  '또한', '그런', '이런', '저런', '어떤',
  '있습니다', '없습니다', '됩니다', '입니다', '합니다', '해서', '그래서', '때문에',
  '있어요', '없어요', '해요', '거예요', '이에요', '이것', '그것', '저것',
  '여기', '거기', '저기', '정말', '진짜', '아주', '매우', '정도',
  '이번', '다음', '모든', '많은',
]);

const PUNCTUATION_REGEX = /[.,!?;:'"()\[\]{}<>\/\\@#$%^&*~`|+=\-_\s]+/;
const PURELY_NUMERIC_OR_PUNCT = /^[\d\s.,!?;:'"()\[\]{}<>\/\\@#$%^&*~`|+=\-_]+$/;

function generateNgrams(token: string): string[] {
  const ngrams: string[] = [];

  // Keep the full token if it's 2-4 chars
  if (token.length >= 2 && token.length <= 4) {
    ngrams.push(token);
  }

  // Generate character n-grams of size 2, 3, 4
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= token.length - n; i++) {
      ngrams.push(token.substring(i, i + n));
    }
  }

  return ngrams;
}

const CONTAINS_KOREAN = /[\uAC00-\uD7A3\u3131-\u314E]/;

function isValidKeyword(ngram: string): boolean {
  if (PURELY_NUMERIC_OR_PUNCT.test(ngram)) return false;
  if (STOP_WORDS.has(ngram)) return false;
  if (!CONTAINS_KOREAN.test(ngram)) return false; // 한국어 없는 키워드 제외
  return true;
}

function generateWordBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t1 = tokens[i], t2 = tokens[i + 1];
    if (t1.length >= 2 && t2.length >= 2
        && !STOP_WORDS.has(t1) && !STOP_WORDS.has(t2)
        && CONTAINS_KOREAN.test(`${t1}${t2}`)) {
      bigrams.push(`${t1} ${t2}`);
    }
  }
  return bigrams;
}

export function extractKeywordsFromPosts(
  posts: AnalyzedPostRow[],
  mainKeyword: string
): SeoKeywordMiningResult {
  // Track keyword -> { total frequency, set of post indices, per-post frequency }
  const keywordStats = new Map<string, { frequency: number; postIndices: Set<number>; perPost: number[] }>();

  for (let postIdx = 0; postIdx < posts.length; postIdx++) {
    const post = posts[postIdx];
    const bodyText = post.body_text;
    if (!bodyText) continue;

    const tokens = bodyText.split(PUNCTUATION_REGEX).filter(Boolean);
    const postNgramSet = new Set<string>();

    for (const token of tokens) {
      const ngrams = generateNgrams(token);
      for (const ngram of ngrams) {
        if (!isValidKeyword(ngram)) continue;
        if (ngram === mainKeyword) continue;

        const stats = keywordStats.get(ngram);
        if (stats) {
          stats.frequency++;
          stats.perPost[postIdx]++;
        } else {
          const perPost = new Array(posts.length).fill(0);
          perPost[postIdx] = 1;
          keywordStats.set(ngram, { frequency: 1, postIndices: new Set(), perPost });
        }

        postNgramSet.add(ngram);
      }
    }

    // Generate word bigrams and add to same keywordStats
    const bigrams = generateWordBigrams(tokens);
    const postBigramSet = new Set<string>();
    for (const bigram of bigrams) {
      if (bigram === mainKeyword) continue;

      const stats = keywordStats.get(bigram);
      if (stats) {
        stats.frequency++;
        stats.perPost[postIdx]++;
      } else {
        const perPost = new Array(posts.length).fill(0);
        perPost[postIdx] = 1;
        keywordStats.set(bigram, { frequency: 1, postIndices: new Set(), perPost });
      }

      postBigramSet.add(bigram);
    }

    // Record which post each ngram appeared in
    for (const ngram of postNgramSet) {
      keywordStats.get(ngram)!.postIndices.add(postIdx);
    }

    // Record which post each bigram appeared in
    for (const bigram of postBigramSet) {
      keywordStats.get(bigram)!.postIndices.add(postIdx);
    }
  }

  // Filter: must appear in 2+ posts
  const competitorKeywords: { keyword: string; frequency: number; postCount: number; score: number; perPost: number[] }[] = [];

  for (const [keyword, stats] of keywordStats) {
    const postCount = stats.postIndices.size;
    if (postCount < 2) continue;

    competitorKeywords.push({
      keyword,
      frequency: stats.frequency,
      postCount,
      score: stats.frequency * postCount,
      perPost: stats.perPost,
    });
  }

  // Sort by score descending
  competitorKeywords.sort((a, b) => b.score - a.score);

  const top15 = competitorKeywords.slice(0, 15);

  // Aggregate stats
  const totalPosts = posts.length || 1;
  const avgBodyLength = posts.reduce((sum, p) => sum + p.body_length, 0) / totalPosts;
  const avgImageCount = posts.reduce((sum, p) => sum + p.image_count, 0) / totalPosts;
  const avgHeadingCount = posts.reduce((sum, p) => sum + p.heading_count, 0) / totalPosts;
  const avgKeywordCount = posts.reduce((sum, p) => sum + p.keyword_count, 0) / totalPosts;

  // Collect common tags
  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    if (!post.tags) continue;
    for (const tag of post.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const commonTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Collect title patterns
  const titlePatterns = posts.map((p) => p.title);

  return {
    competitorKeywords: top15.map(({ keyword, frequency, postCount, perPost }) => ({
      keyword,
      frequency,
      postCount,
      perPostFrequency: perPost,
    })),
    recommendedKeywords: top15.map((k) => k.keyword),
    avgBodyLength: Math.round(avgBodyLength),
    avgImageCount: Math.round(avgImageCount * 10) / 10,
    avgHeadingCount: Math.round(avgHeadingCount * 10) / 10,
    avgKeywordCount: Math.round(avgKeywordCount * 10) / 10,
    commonTags,
    titlePatterns,
  };
}
