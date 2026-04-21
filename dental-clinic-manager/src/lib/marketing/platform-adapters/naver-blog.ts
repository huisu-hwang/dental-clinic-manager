import { checkMedicalLaw, suggestFixes } from '@/lib/marketing/medical-law-checker';
import type {
  GeneratedImageMeta,
  NaverBlogContent,
  TopicCategory,
} from '@/types/marketing';

// ============================================
// 블로그 본문 → 네이버 블로그 에디터 페이로드 변환
// - 단락 <p> / 소제목 <h3> / 리스트 <ul> 기본 포맷
// - 태그 자동 생성 (고정 + 카테고리 + 키워드 변형)
// - 본문 하단 면책 문구 자동 삽입
// - 1500~2000자 범위/키워드 밀도 검증 (미달 시 warnings)
// ============================================

const FIXED_TAGS = ['하얀치과', '치과', '치과정보'];

const CATEGORY_TAG_MAP: Record<TopicCategory, string[]> = {
  info: ['구강건강', '치아관리', '건강정보'],
  symptom: ['치아증상', '구강질환', '증상정보'],
  treatment: ['치과치료', '치과시술', '치과진료'],
  cost: ['치과비용', '건강보험', '치과가격'],
  review: ['치과후기', '치료사례', '치과경험'],
  clinic_news: ['병원소식', '치과의사', '원내이야기'],
};

const CATEGORY_BLOG_FOLDER: Record<TopicCategory, string> = {
  info: '건강정보',
  symptom: '증상과 질환',
  treatment: '치료 이야기',
  cost: '비용과 보험',
  review: '치료 사례',
  clinic_news: '원내 소식',
};

export interface TransformOptions {
  keyword: string;
  topicCategory?: TopicCategory;
  customTags?: string[];
  clinicName?: string;   // 예: "하얀치과" — 제목/태그/면책에 쓰임
  includePhone?: string; // 본문 CTA용 전화번호 (선택)
}

/**
 * HTML 변환 (문단·소제목·이미지 플레이스홀더)
 */
function plainToBlogHtml(body: string, images: GeneratedImageMeta[]): string {
  const lines = body.split('\n').map((l) => l.trim());
  const out: string[] = [];
  let bullets: string[] = [];
  let imageIdx = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>`);
    bullets = [];
  };

  for (const line of lines) {
    if (!line) {
      flushBullets();
      continue;
    }

    // 이미지 마커 (예: [IMAGE] 또는 ![...])
    if (/^\[IMAGE\]$/i.test(line) || /^!\[.*\]\(.*\)$/.test(line)) {
      flushBullets();
      const img = images[imageIdx];
      if (img) {
        out.push(`<p data-image="${escapeAttr(img.fileName)}" data-prompt="${escapeAttr(img.prompt)}">[이미지: ${escapeHtml(img.prompt || img.fileName)}]</p>`);
        imageIdx++;
      }
      continue;
    }

    // 소제목 (##, 또는 `◆`, `▶`)
    if (/^##+\s+/.test(line) || /^[◆▶■]\s+/.test(line)) {
      flushBullets();
      const heading = line.replace(/^##+\s+|^[◆▶■]\s+/, '');
      out.push(`<h3>${escapeHtml(heading)}</h3>`);
      continue;
    }

    // 불릿
    if (/^[-•*]\s+/.test(line)) {
      bullets.push(line);
      continue;
    }

    flushBullets();
    out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flushBullets();

  // 남은 이미지가 있다면 본문 뒤에 첨부
  while (imageIdx < images.length) {
    const img = images[imageIdx];
    out.push(`<p data-image="${escapeAttr(img.fileName)}" data-prompt="${escapeAttr(img.prompt)}">[이미지: ${escapeHtml(img.prompt || img.fileName)}]</p>`);
    imageIdx++;
  }

  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll('\n', ' ');
}

/**
 * 태그 생성 — 고정 태그 + 카테고리 태그 + 키워드 변형 (총 10개 이내)
 */
function buildTags(
  keyword: string,
  topicCategory: TopicCategory | undefined,
  custom: string[] = [],
  clinicName?: string
): string[] {
  const set = new Set<string>();

  // 병원명
  if (clinicName) set.add(clinicName);
  for (const t of FIXED_TAGS) set.add(t);

  // 카테고리
  if (topicCategory) {
    for (const t of CATEGORY_TAG_MAP[topicCategory]) set.add(t);
  }

  // 키워드 변형 (공백 제거, 어절 분리)
  if (keyword) {
    const normalized = keyword.replace(/\s+/g, '');
    set.add(normalized);

    const parts = keyword.split(/\s+/).filter((p) => p.length >= 2);
    for (const p of parts) set.add(p);

    // "분당 임플란트 비용" → "임플란트비용"
    if (parts.length >= 2) {
      set.add(parts.slice(-2).join(''));
    }
  }

  // 사용자 커스텀
  for (const t of custom) {
    if (t) set.add(t.replace(/^#/, ''));
  }

  return Array.from(set).slice(0, 10);
}

/**
 * 요약 (본문 앞부분 150자)
 */
function buildSummary(body: string): string {
  const plain = body.replace(/[#*•\-\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 150);
}

/**
 * 키워드 본문 빈도 (공백 무시, 대소문자 무시)
 */
function countKeyword(body: string, keyword: string): number {
  if (!keyword) return 0;
  const needle = keyword.replace(/\s+/g, '').toLowerCase();
  const hay = body.replace(/\s+/g, '').toLowerCase();
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * 순수 글자 수 (HTML 제외, 공백 포함)
 */
function plainLength(body: string): number {
  return body.replace(/\s+/g, ' ').trim().length;
}

/**
 * 메인 변환 함수
 */
export async function transformToNaverBlog(
  title: string,
  body: string,
  images: GeneratedImageMeta[],
  options: TransformOptions
): Promise<NaverBlogContent> {
  const warnings: string[] = [];

  // 1. 의료법 체크 & 본문 보정
  const lawResult = checkMedicalLaw(body);
  let processedBody = body;
  if (!lawResult.passed) {
    warnings.push(`의료법 경고: ${lawResult.details.join(' · ')}`);
    processedBody = suggestFixes(lawResult, body);
  }

  // 2. 면책 문구 확인 (없으면 하단에 추가)
  const DISCLAIMER =
    '\n\n※ 개인마다 치아 상태와 치료 결과가 다를 수 있으며, 정확한 진단은 내원 상담을 통해 가능합니다.';
  const hasDisclaimer = processedBody.includes('개인마다 치아 상태');
  if (!hasDisclaimer) {
    processedBody += DISCLAIMER;
  }

  // 3. 본문 → HTML
  const bodyHtml = plainToBlogHtml(processedBody, images);

  // 4. 태그·요약
  const tags = buildTags(
    options.keyword,
    options.topicCategory,
    options.customTags || [],
    options.clinicName
  );
  const summary = buildSummary(processedBody);

  // 5. 글자수/키워드 밀도 검증
  const wordCount = plainLength(processedBody);
  const keywordCount = countKeyword(processedBody, options.keyword);

  if (wordCount < 1500) warnings.push(`본문 ${wordCount}자 — 권장 1500자 이상`);
  if (wordCount > 2500) warnings.push(`본문 ${wordCount}자 — 권장 2000자 이하 (과도 가능성)`);
  if (keywordCount < 4) warnings.push(`핵심 키워드 '${options.keyword}' ${keywordCount}회 — 권장 5~6회`);
  if (keywordCount > 12) warnings.push(`핵심 키워드 '${options.keyword}' ${keywordCount}회 — 과다 (키워드 스터핑 위험)`);

  return {
    title,
    body: processedBody,
    bodyHtml,
    summary,
    tags,
    category: options.topicCategory ? CATEGORY_BLOG_FOLDER[options.topicCategory] : undefined,
    disclaimer: DISCLAIMER.trim(),
    wordCount,
    keywordCount,
    images,
    hashtags: tags.map((t) => `#${t}`),
    warnings,
  };
}
