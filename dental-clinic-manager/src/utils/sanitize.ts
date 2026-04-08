/**
 * HTML Sanitization Utility
 * DOMPurify를 사용하여 XSS 공격을 방지하면서 TipTap 에디터의 서식을 유지
 */

import DOMPurify from 'dompurify'

// TipTap 에디터에서 사용하는 허용 태그
const ALLOWED_TAGS = [
  // 텍스트 서식
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'sub', 'sup', 'mark', 'small',
  // 제목
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // 목록
  'ul', 'ol', 'li',
  // 링크 & 미디어
  'a', 'img', 'video', 'source', 'iframe',
  // 인용 & 코드
  'blockquote', 'code', 'pre',
  // 테이블
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // 구조
  'div', 'span', 'hr', 'details', 'summary',
  // 기타
  'figure', 'figcaption',
]

// 허용 속성
const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'class', 'style', 'id',
  'colspan', 'rowspan', 'scope',
  'controls', 'autoplay', 'muted', 'loop', 'playsinline', 'type',
  'data-*',
  'allowfullscreen', 'frameborder', 'allow',
  'start', 'reversed',
]

/**
 * HTML 콘텐츠를 sanitize하여 XSS 공격을 방지
 * TipTap 에디터에서 생성한 서식은 유지
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    // a 태그의 target="_blank"에 noopener noreferrer 자동 추가
    ADD_ATTR: ['target'],
  })
}
