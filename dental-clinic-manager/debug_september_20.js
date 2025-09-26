// 9월 20일 데이터 디버깅용 스크립트
// 브라우저 콘솔에서 실행하여 데이터 확인

console.log("=== 9월 20일 데이터 디버깅 ===");

// 상세 기록(consultLogs)에서 9월 20일 데이터 확인
const consultData = window.__NEXT_DATA__?.props?.pageProps?.consultLogs?.filter(log => log.date === '2025-09-20') || [];
console.log("상담 상세 기록 (9월 20일):", consultData);
console.log("상담 상세 기록 개수:", consultData.length);

// 일일 보고서(dailyReports)에서 9월 20일 데이터 확인
const reportData = window.__NEXT_DATA__?.props?.pageProps?.dailyReports?.find(report => report.date === '2025-09-20') || null;
console.log("일일 보고서 (9월 20일):", reportData);
if (reportData) {
    console.log("보고서 상담 진행:", reportData.consult_proceed);
    console.log("보고서 상담 보류:", reportData.consult_hold);
}

// 브라우저에서 직접 API 호출 테스트
if (typeof fetch !== 'undefined') {
    console.log("API 직접 조회 시작...");

    // Supabase 클라이언트로 직접 확인 (개발자 도구에서 실행)
    // 이 부분은 실제 Supabase 설정이 필요합니다
}

console.log("=== 디버깅 완료 ===");