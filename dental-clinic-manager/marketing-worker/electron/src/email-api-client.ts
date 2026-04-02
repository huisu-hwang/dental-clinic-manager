import { getConfig } from './config-store';

export interface EmailMail {
  id: string;
  from: string;
  subject: string;
  date: string;
  type: 'lab' | 'tax_office';
  attachments: { id: string; name: string; mimeType: string }[];
}

export interface EmailCheckResult {
  provider: 'gmail' | 'naver';
  mails?: EmailMail[];  // Gmail: 서버에서 조회 완료
  credentials?: {       // 네이버: 워커가 직접 IMAP 접속
    email: string;
    password: string;
  };
  settings?: {
    labSenderEmails: string[];
    taxOfficeSenderEmails: string[];
    lastCheckedAt: string | null;
  };
}

export class EmailApiClient {
  private dashboardUrl: string;
  private apiKey: string;

  constructor() {
    const cfg = getConfig();
    this.dashboardUrl = cfg.dashboardUrl;
    this.apiKey = cfg.workerApiKey;
  }

  private async request(path: string, options?: RequestInit) {
    const url = `${this.dashboardUrl}/api/marketing/worker-api/email${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Email API error: ${res.status}`);
    return res.json();
  }

  async checkForMails(clinicId: string): Promise<EmailCheckResult> {
    return this.request('/check', {
      method: 'POST',
      body: JSON.stringify({ clinicId }),
    });
  }

  async downloadAttachment(clinicId: string, mailId: string, attachmentId: string): Promise<{ data: string; fileName: string; mimeType: string }> {
    return this.request('/attachment', {
      method: 'POST',
      body: JSON.stringify({ clinicId, mailId, attachmentId }),
    });
  }

  async saveLabExpense(data: { clinicId: string; year: number; month: number; items: { description: string; amount: number; vendor_name: string }[] }): Promise<void> {
    await this.request('/lab-expense', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadPayslip(data: { clinicId: string; year: number; month: number; zipData: string }): Promise<{ uploadedCount: number }> {
    return this.request('/payslip-upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSettings(clinicId: string, updates: { lastCheckedAt?: string; lastMailId?: string }): Promise<void> {
    await this.request('/settings', {
      method: 'POST',
      body: JSON.stringify({ clinicId, ...updates }),
    });
  }

  async getSettings(clinicId: string): Promise<any> {
    return this.request(`/settings?clinicId=${clinicId}`);
  }
}
