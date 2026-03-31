// ============================================
// 랜덤 딜레이 유틸리티
// 모든 딜레이는 고정값이 아닌 랜덤 범위 사용 (봇 감지 회피)
// ============================================
/**
 * min~max 범위의 랜덤 밀리초를 반환
 */
export function randomMs(range) {
    return range.min + Math.random() * (range.max - range.min);
}
/**
 * min~max 범위의 랜덤 시간만큼 대기
 */
export async function randomDelay(range) {
    const ms = randomMs(range);
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 고정 시간 대기 (특수한 경우에만 사용)
 */
export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
