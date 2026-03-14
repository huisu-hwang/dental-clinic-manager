/** 전월 결산 Job 생성 */
declare function createMonthlySettlementJobs(): Promise<number>;
/** 결산 데이터 집계 (Job 완료 후 호출) */
export declare function aggregateSettlement(clinicId: string, year: number, month: number): Promise<Record<string, unknown>>;
/** 월말 결산 스케줄러 시작 */
export declare function startMonthlySettlement(): void;
export { createMonthlySettlementJobs };
//# sourceMappingURL=monthlySettlement.d.ts.map