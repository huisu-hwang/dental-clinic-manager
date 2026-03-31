export declare const CONFIG: {
    readonly api: {
        readonly dashboardUrl: string;
        readonly workerApiKey: string;
    };
    readonly supabase: {
        readonly url: string;
        readonly serviceRoleKey: string;
    };
    readonly naver: {
        readonly blogId: string;
        readonly loginCookie: string;
    };
    readonly publishing: {
        readonly maxPostsPerDay: 3;
        readonly minIntervalMinutes: 30;
        readonly snsDelayMinutes: 30;
    };
    readonly delays: {
        readonly charType: {
            readonly min: 10;
            readonly max: 50;
        };
        readonly paragraph: {
            readonly min: 1000;
            readonly max: 3000;
        };
        readonly pageLoad: {
            readonly min: 2000;
            readonly max: 3000;
        };
        readonly popupHandle: {
            readonly min: 1000;
            readonly max: 2000;
        };
        readonly templateApply: {
            readonly min: 2000;
            readonly max: 3000;
        };
        readonly titleToBody: {
            readonly min: 1500;
            readonly max: 2500;
        };
        readonly imageUpload: {
            readonly min: 2000;
            readonly max: 4000;
        };
        readonly beforeSave: {
            readonly min: 1500;
            readonly max: 3500;
        };
        readonly afterSave: {
            readonly min: 3000;
            readonly max: 5000;
        };
        readonly iframeSwitch: {
            readonly min: 1500;
            readonly max: 3500;
        };
    };
    readonly worker: {
        readonly port: number;
        readonly cronInterval: "*/5 * * * *";
    };
};
/**
 * API 모드 여부 (대시보드 API를 통해 동작)
 * DASHBOARD_API_URL과 WORKER_API_KEY가 설정되어 있으면 API 모드
 */
export declare function isApiMode(): boolean;
