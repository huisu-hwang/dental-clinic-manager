export declare const config: {
    readonly supabase: {
        readonly url: string;
        readonly serviceRoleKey: string;
    };
    readonly encryptionKey: string;
    readonly worker: {
        readonly id: string;
        readonly pollIntervalMs: number;
        readonly heartbeatIntervalMs: number;
        readonly maxConcurrent: number;
    };
    readonly playwright: {
        readonly headless: boolean;
        readonly timeoutMs: number;
    };
    readonly schedule: {
        readonly dailySyncCron: string;
        readonly monthlySettlementCron: string;
        readonly clinicIntervalMinutes: number;
    };
    readonly logLevel: string;
};
//# sourceMappingURL=config.d.ts.map