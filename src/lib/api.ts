import type {
  FeedbackResponse,
  MoodKey,
  Report,
  ReportsResponse,
  ReportValue,
  SubjectKey,
} from '../../shared/domain.js';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError(0, 'サーバーに接続できませんでした');
  }

  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'サーバーでエラーが発生しました');
  }
  return body as T;
}

export function fetchReports(): Promise<ReportsResponse> {
  return request<ReportsResponse>('/api/reports');
}

export function postReport(
  subject: SubjectKey,
  action: ReportValue,
): Promise<ReportsResponse & { report: Report }> {
  return request('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ subject, action }),
  });
}

export function deleteReport(id: string): Promise<ReportsResponse & { ok: true }> {
  return request(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchFeedback(): Promise<FeedbackResponse> {
  return request<FeedbackResponse>('/api/feedback');
}

export function postFeedback(mood: MoodKey, body: string): Promise<FeedbackResponse> {
  return request('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ mood, body }),
  });
}

export function toggleFeedbackLike(id: string): Promise<FeedbackResponse> {
  return request(`/api/feedback/${encodeURIComponent(id)}/like`, { method: 'POST' });
}
