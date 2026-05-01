import type {
  ApprovalDecisionKind,
  ApprovalDecisionResponse,
  ApprovalHistoryItem,
  ApprovalRequest,
  BackendSession,
  Page,
  Project,
  PromptSubmissionResponse,
  Thread,
  Turn
} from "@concierge/shared";

export interface ApiConfig {
  backendUrl: string;
  token: string;
}

async function request<T>(config: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.backendUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function health(config: ApiConfig): Promise<{ ok: boolean }> {
  return request(config, "/health");
}

export function getSession(config: ApiConfig): Promise<{ ok: boolean; session: BackendSession }> {
  return request(config, "/session");
}

export function listThreads(config: ApiConfig): Promise<Page<Thread>> {
  return request(config, "/threads?limit=50");
}

export function getThread(config: ApiConfig, threadId: string): Promise<Thread> {
  return request(config, `/threads/${encodeURIComponent(threadId)}`);
}

export function listTurns(config: ApiConfig, threadId: string): Promise<Page<Turn>> {
  return request(config, `/threads/${encodeURIComponent(threadId)}/turns?limit=50`);
}

export function listApprovals(config: ApiConfig): Promise<Page<ApprovalRequest>> {
  return request(config, "/approvals");
}

export function listRecentApprovals(config: ApiConfig): Promise<Page<ApprovalHistoryItem>> {
  return request(config, "/approvals/recent?limit=5");
}

export function listProjects(config: ApiConfig): Promise<Page<Project>> {
  return request(config, "/projects");
}

export function decideApproval(
  config: ApiConfig,
  approvalId: string,
  decision: ApprovalDecisionKind,
  rulePrefix?: string[],
  followUpText?: string
): Promise<ApprovalDecisionResponse> {
  return request(config, "/approvals/decision", {
    method: "POST",
    body: JSON.stringify({ approvalId, decision, rulePrefix, followUpText })
  });
}

export function sendPrompt(config: ApiConfig, threadId: string, text: string): Promise<PromptSubmissionResponse> {
  return request(config, `/threads/${encodeURIComponent(threadId)}/prompts`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}
